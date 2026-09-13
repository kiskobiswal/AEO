"""Security helpers: rate limiting + CORS origin parser + safe error handler.

Zero external dependencies — pure Python. Rate limiting is an in-memory
sliding-window counter keyed by (client IP + bucket name). The app runs a
single uvicorn worker so in-process state is coherent; if we ever scale
horizontally, swap the storage to Redis without changing the dependency
signature.
"""
from __future__ import annotations

import logging
import os
import time
from collections import deque
from typing import Callable, Deque, Dict, List

from fastapi import HTTPException, Request

logger = logging.getLogger("citetail.security")

# ---------- Rate limiter ----------
_RL_STORE: Dict[str, Deque[float]] = {}


def _client_ip(request: Request) -> str:
    """Best-effort real client IP. Falls back to socket peer if headers absent."""
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "anon"


def rate_limit(bucket: str, limit: int, window_seconds: int) -> Callable:
    """FastAPI dependency factory.

    Enforces `limit` requests per `window_seconds` per client-IP for the
    given `bucket` name. Sensitive auth endpoints share buckets so an
    attacker hitting login and signup gets a single combined budget.
    """
    async def _dep(request: Request):
        ip = _client_ip(request)
        key = f"{bucket}:{ip}"
        now = time.time()
        q = _RL_STORE.setdefault(key, deque())
        # Drop timestamps outside the sliding window.
        cutoff = now - window_seconds
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            retry_after = max(1, int(window_seconds - (now - q[0])))
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "rate_limited",
                    "message": f"Too many requests — please slow down and try again in {retry_after}s.",
                    "retry_after_seconds": retry_after,
                },
            )
        q.append(now)
    return _dep


# ---------- CORS origins ----------
def parse_cors_origins() -> List[str] | str:
    """Parse `CORS_ORIGINS` env into a list. Special value `*` is honoured
    but logged as a warning — production deployments should list explicit
    origins (comma-separated)."""
    raw = (os.environ.get("CORS_ORIGINS") or "").strip()
    frontend_url = (os.environ.get("FRONTEND_URL") or "").strip()

    origins: List[str] = []
    if raw:
        if raw == "*":
            logger.warning("[cors] CORS_ORIGINS=* — allowing all origins. Set an explicit "
                           "comma-separated list before going live.")
            return ["*"]
        origins.extend([o.strip() for o in raw.split(",") if o.strip()])

    # FRONTEND_URL can be `*` for legacy configs — treat like CORS wildcard.
    if frontend_url == "*":
        logger.warning("[cors] FRONTEND_URL=* — allowing all origins.")
        return ["*"]
    if frontend_url and frontend_url not in origins:
        origins.append(frontend_url)

    # Always allow local dev if we're clearly not on the production wildcard.
    for local in ("http://localhost:3000", "http://127.0.0.1:3000"):
        if local not in origins:
            origins.append(local)

    return origins or ["*"]


# ---------- Safe exception handler ----------
async def safe_500_handler(_request: Request, exc: Exception):
    """Log the full traceback server-side, return a generic message to the client.

    HTTPException is handled by FastAPI's default handler and reaches the
    client with its safe `detail` string — this handler only kicks in on
    truly unexpected exceptions (bugs, DB outages, etc.).
    """
    from starlette.responses import JSONResponse
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again in a moment."},
    )
