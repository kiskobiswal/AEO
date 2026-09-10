"""Brand management: name, domain, tracked prompts and competitors per user.

CRUD plus a lightweight scan endpoint that reuses the existing citation /
prompt-source pipeline (`real_citation_sources` + `real_engine_attribution`
from server.py) to populate a per-brand report:
  * `POST /api/brands/{id}/scan`   — rescan all prompts + brand citations
  * `GET  /api/brands/{id}/report` — cached scan report + citations
"""
from __future__ import annotations

import re
import time
import asyncio
import secrets
import logging
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("citetail.brands")

brands_router = APIRouter(prefix="/api/brands")


def _server():
    import server
    return server


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$", re.I)


def _normalize_domain(raw: str) -> str:
    d = (raw or "").strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = d.split("/")[0].split("?")[0].strip(".")
    if d.startswith("www."):
        d = d[4:]
    return d


class BrandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    domain: str = Field(min_length=3, max_length=253)
    prompts: List[str] = Field(default_factory=list)
    competitors: List[str] = Field(default_factory=list)

    @field_validator("prompts", "competitors")
    @classmethod
    def _trim(cls, v):
        return [s.strip() for s in (v or []) if isinstance(s, str) and s.strip()][:40]


class BrandUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    domain: Optional[str] = Field(default=None, max_length=253)
    prompts: Optional[List[str]] = None
    competitors: Optional[List[str]] = None


def _public(doc: dict) -> dict:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


async def _server_get_current_user(request: Request):
    return await _server().get_current_user(request)


@brands_router.get("")
async def list_brands(user: dict = Depends(_server_get_current_user)):
    docs = await _server().db.brands.find({"user_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return {"brands": docs}


@brands_router.post("")
async def create_brand(body: BrandCreate, user: dict = Depends(_server_get_current_user)):
    domain = _normalize_domain(body.domain)
    if not _DOMAIN_RE.match(domain):
        raise HTTPException(status_code=400, detail="Enter a valid domain, e.g. example.com")
    dup = await _server().db.brands.find_one({"user_id": user["id"], "domain": domain}, {"_id": 0})
    if dup:
        raise HTTPException(status_code=400, detail=f"You already have a brand set up for {domain}")
    doc = {
        "id": secrets.token_hex(10),
        "user_id": user["id"],
        "name": body.name.strip(),
        "domain": domain,
        "prompts": [p.strip() for p in body.prompts if p and p.strip()][:40],
        "competitors": [c.strip() for c in body.competitors if c and c.strip()][:20],
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await _server().db.brands.insert_one(doc)
    return _public(doc)


@brands_router.get("/{brand_id}")
async def get_brand(brand_id: str, user: dict = Depends(_server_get_current_user)):
    doc = await _server().db.brands.find_one({"id": brand_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Brand not found")
    return doc


@brands_router.patch("/{brand_id}")
@brands_router.put("/{brand_id}")
async def update_brand(brand_id: str, body: BrandUpdate, user: dict = Depends(_server_get_current_user)):
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.domain is not None:
        d = _normalize_domain(body.domain)
        if not _DOMAIN_RE.match(d):
            raise HTTPException(status_code=400, detail="Enter a valid domain, e.g. example.com")
        updates["domain"] = d
    if body.prompts is not None:
        updates["prompts"] = [p.strip() for p in body.prompts if p and p.strip()][:40]
    if body.competitors is not None:
        updates["competitors"] = [c.strip() for c in body.competitors if c and c.strip()][:20]
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = _now_iso()
    res = await _server().db.brands.update_one(
        {"id": brand_id, "user_id": user["id"]}, {"$set": updates}
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Brand not found")
    doc = await _server().db.brands.find_one({"id": brand_id, "user_id": user["id"]}, {"_id": 0})
    return doc


@brands_router.delete("/{brand_id}")
async def delete_brand(brand_id: str, user: dict = Depends(_server_get_current_user)):
    res = await _server().db.brands.delete_one({"id": brand_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"ok": True, "id": brand_id}


# =========================================================================
# Scan endpoints — real citation/engine data
# =========================================================================

# Engines we surface in the UI. Order matters — the engine chips render in
# this order and per-engine attribution keys use these keys.
ENGINES = ["chatgpt", "perplexity", "gemini", "claude", "copilot", "google_ai", "grok"]

_SCAN_TTL_SECONDS = 24 * 3600


def _host_of(url: str) -> str:
    try:
        h = urlparse(url).hostname or ""
        if h.startswith("www."):
            h = h[4:]
        return h.lower()
    except Exception:
        return ""


async def _run_prompt_scan(brand_name: str, brand_domain: str, competitors: list, prompt: str):
    """Run the existing prompt-source pipeline for one prompt and shape the
    result for the Brand Overview / Prompts card UI.

    Returns:
      {
        "prompt": ...,
        "sources": [{url, domain, title, engines: [...], authority}],
        "engines_covered": ["chatgpt", ...],
        "competitors_found": ["TaskUs", ...],
        "brand_found": bool,
        "score": "6/7",
      }
    """
    srv = _server()
    tf = srv.tf
    # --- 1) Real web results (Serper preferred, Tavily fallback) — same code
    # path used by /api/visibility/prompt-sources.
    serper_res = await tf._serper_search(prompt, "web", 12)
    tavily_res = []
    if not serper_res:
        tavily_res = await tf._tavily_search(prompt, "web", 10)

    seen_hosts, sources = set(), []
    for r in list(serper_res) + list(tavily_res):
        url = r.get("url") or ""
        host = tf.root_domain(tf.host_of(url))
        if not url or not host or host in seen_hosts:
            continue
        if host in ("google.com", "bing.com", "duckduckgo.com", "yahoo.com") or "/goto?" in url or "/url?" in url:
            continue
        seen_hosts.add(host)
        sources.append({
            "domain": host,
            "url": url,
            "title": r.get("title") or "",
            "type": tf.type_for(url, "web"),
            "authority": tf.authority_for(url),
            "why": r.get("snippet") or "",
        })
    sources.sort(key=lambda s: -s.get("authority", 0))
    sources = sources[:15]

    # --- 2) Per-engine attribution (which engines cite each source URL)
    try:
        engine_map = await asyncio.wait_for(
            srv.real_engine_attribution(
                brand_name or prompt, prompt, [s["url"] for s in sources],
                serper_urls=[r.get("url", "") for r in serper_res],
                tavily_urls=[r.get("url", "") for r in tavily_res],
            ),
            timeout=25,
        )
        srv.apply_engine_attribution(sources, engine_map)
    except Exception as e:
        logger.warning(f"engine attribution failed for {prompt!r}: {e}")
        for s in sources:
            s["engines"] = srv._engines_for_source(s.get("domain"), s.get("type"), s.get("authority") or 0)

    # --- 3) Roll up: which engines were "covered" (at least 1 source),
    # which competitors appeared, and did the user's own domain show up?
    engines_covered = set()
    for s in sources:
        for e in (s.get("engines") or []):
            engines_covered.add(e)

    lower_prompt_text = " ".join([(s.get("title") or "") + " " + (s.get("why") or "") for s in sources]).lower()
    comp_found = []
    for c in competitors or []:
        needle = (c or "").strip().lower()
        if not needle:
            continue
        if needle in lower_prompt_text or any(needle in _host_of(s.get("url", "")) for s in sources):
            comp_found.append(c)

    brand_hosts = {brand_domain.lower(), f"www.{brand_domain.lower()}"} if brand_domain else set()
    brand_found = any(_host_of(s.get("url", "")) in brand_hosts or brand_domain.lower() in (s.get("url", "").lower()) for s in sources) if brand_domain else False

    return {
        "prompt": prompt,
        "sources": sources,
        "engines_covered": sorted(engines_covered),
        "competitors_found": comp_found,
        "brand_found": brand_found,
        "score": f"{len(engines_covered)}/{len(ENGINES)}",
    }


async def _run_brand_scan(brand: dict) -> dict:
    """Scan every tracked prompt in parallel (bounded), plus one citations
    pull for the brand domain. Returns a full report doc ready to cache."""
    srv = _server()
    prompts = brand.get("prompts") or []
    competitors = brand.get("competitors") or []
    brand_name = brand.get("name") or ""
    brand_domain = brand.get("domain") or ""

    sem = asyncio.Semaphore(3)  # keep provider rate limits happy

    async def _one(p):
        async with sem:
            try:
                return await asyncio.wait_for(
                    _run_prompt_scan(brand_name, brand_domain, competitors, p),
                    timeout=45,
                )
            except Exception as e:
                logger.warning(f"prompt scan failed for {p!r}: {e}")
                return {"prompt": p, "sources": [], "engines_covered": [], "competitors_found": [], "brand_found": False, "score": f"0/{len(ENGINES)}"}

    prompt_results = await asyncio.gather(*[_one(p) for p in prompts]) if prompts else []

    # Real citation sources for the brand domain (0 LLM).
    citations = []
    if brand_domain:
        try:
            citations = await asyncio.wait_for(
                srv.real_citation_sources(brand_name or srv.tf.brand_name_from_domain(brand_domain), brand_domain),
                timeout=60,
            )
        except Exception as e:
            logger.warning(f"brand citations failed for {brand_domain}: {e}")
            citations = []

    # ---- Aggregates for the Overview ----
    # Voice-share: for each player (brand + competitors), count how many
    # prompts mention them. Brand is counted when brand_found=True.
    voice = {brand_name: 0}
    for c in competitors:
        voice[c] = 0
    for pr in prompt_results:
        if pr.get("brand_found"):
            voice[brand_name] = voice.get(brand_name, 0) + 1
        for c in pr.get("competitors_found") or []:
            voice[c] = voice.get(c, 0) + 1

    total = sum(voice.values()) or 1
    voice_share = [
        {"name": n, "mentions": v, "share_pct": round((v / total) * 100)}
        for n, v in voice.items()
    ]
    voice_share.sort(key=lambda x: -x["share_pct"])

    # Engine distribution across all prompt sources
    engine_counts = {e: 0 for e in ENGINES}
    for pr in prompt_results:
        for e in pr.get("engines_covered") or []:
            if e in engine_counts:
                engine_counts[e] += 1
    total_e = sum(engine_counts.values()) or 1
    engine_dist = [
        {"key": k, "mentions": v, "share_pct": round((v / total_e) * 100)}
        for k, v in engine_counts.items()
    ]

    return {
        "generated_at": _now_iso(),
        "prompts": prompt_results,
        "citations": citations,
        "voice_share": voice_share,
        "engine_distribution": engine_dist,
        "competitor_count": len(competitors),
        "engines_used": ENGINES,
    }


@brands_router.post("/{brand_id}/scan")
async def scan_brand(brand_id: str, user: dict = Depends(_server_get_current_user)):
    """Re-scan a brand: runs a fresh prompt-source + citations pull and
    caches the result in `brand_reports`. Real API calls only — no LLM."""
    srv = _server()
    brand = await srv.db.brands.find_one({"id": brand_id, "user_id": user["id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    report = await _run_brand_scan(brand)
    doc = {
        "brand_id": brand_id,
        "user_id": user["id"],
        "cached_at": time.time(),
        "report": report,
    }
    await srv.db.brand_reports.update_one({"brand_id": brand_id}, {"$set": doc}, upsert=True)
    return report


@brands_router.get("/{brand_id}/report")
async def get_brand_report(brand_id: str, user: dict = Depends(_server_get_current_user)):
    """Return the cached scan report if fresh (<24h), else run a scan."""
    srv = _server()
    brand = await srv.db.brands.find_one({"id": brand_id, "user_id": user["id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    cached = await srv.db.brand_reports.find_one({"brand_id": brand_id, "user_id": user["id"]})
    if cached:
        age = time.time() - float(cached.get("cached_at", 0))
        if age < _SCAN_TTL_SECONDS and cached.get("report"):
            return {**cached["report"], "from_cache": True, "cache_age_seconds": int(age)}
    report = await _run_brand_scan(brand)
    await srv.db.brand_reports.update_one(
        {"brand_id": brand_id},
        {"$set": {"brand_id": brand_id, "user_id": user["id"], "cached_at": time.time(), "report": report}},
        upsert=True,
    )
    return {**report, "from_cache": False, "cache_age_seconds": 0}
