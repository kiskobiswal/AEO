"""Per-user daily throttle for expensive rescan endpoints.

Applies to: brand rescan (which powers Overview, Prompts and Citations),
Site Audit project rescan. Admins bypass. Zero LLM cost — pure Mongo lookup.

Contract:
  * ONE rescan per (user_id, scope, target_id) per UTC day.
  * Repeat call within the same UTC day → 429 with `retry_after` seconds
    and a friendly error message the frontend can surface.
  * Result stored in `rescan_throttle` collection, one row per
    (user_id, scope, target_id) with the last `scan_at` timestamp.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import HTTPException


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _start_of_next_utc_day(now: datetime) -> datetime:
    tomorrow = (now + timedelta(days=1)).date()
    return datetime(tomorrow.year, tomorrow.month, tomorrow.day, tzinfo=timezone.utc)


def _seconds_until_reset(now: datetime) -> int:
    return max(1, int((_start_of_next_utc_day(now) - now).total_seconds()))


def _is_admin(user: dict) -> bool:
    if not user:
        return False
    return user.get("role") == "admin" or bool(user.get("full_access"))


async def check_daily_rescan(db, user: dict, scope: str, target_id: str) -> None:
    """Raises HTTPException(429) if a rescan was already recorded today.

    Admins bypass. Does NOT record the scan — call `record_daily_rescan`
    after the scan starts to update the throttle timestamp.
    """
    if _is_admin(user):
        return
    uid = str(user.get("id") or user.get("_id") or "")
    if not uid:
        return
    key = {"user_id": uid, "scope": scope, "target_id": str(target_id)}
    doc = await db.rescan_throttle.find_one(key)
    if not doc:
        return
    last = doc.get("scan_at")
    if not isinstance(last, datetime):
        return
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    now = _now_utc()
    if last.date() == now.date():
        retry_after = _seconds_until_reset(now)
        hours = retry_after // 3600
        mins = (retry_after % 3600) // 60
        pretty = f"{hours}h {mins}m" if hours else f"{mins}m"
        raise HTTPException(
            status_code=429,
            detail={
                "code": "daily_rescan_limit",
                "scope": scope,
                "message": f"You've already run a rescan today. Please try again in {pretty} (limit: 1 rescan / day).",
                "retry_after_seconds": retry_after,
                "next_available_at": _start_of_next_utc_day(now).isoformat(),
            },
        )


async def record_daily_rescan(db, user: dict, scope: str, target_id: str) -> None:
    if _is_admin(user):
        return
    uid = str(user.get("id") or user.get("_id") or "")
    if not uid:
        return
    key = {"user_id": uid, "scope": scope, "target_id": str(target_id)}
    await db.rescan_throttle.update_one(
        key,
        {"$set": {**key, "scan_at": _now_utc()}},
        upsert=True,
    )


async def enforce_daily_rescan(db, user: dict, scope: str, target_id: str) -> None:
    """One-shot: raise 429 if already-run today, else record and continue."""
    await check_daily_rescan(db, user, scope, target_id)
    await record_daily_rescan(db, user, scope, target_id)


async def ensure_indexes(db) -> None:
    """Compound index used by `check_daily_rescan` lookups."""
    await db.rescan_throttle.create_index(
        [("user_id", 1), ("scope", 1), ("target_id", 1)], unique=True
    )
