"""Brand management: name, domain, tracked prompts and competitors per user.

Kept intentionally lightweight — this module holds the brand config (a CRUD
shell). Heavy LLM-driven overview/citations/rankings live under `projects.py`
and continue to run there; the frontend just filters those results by the
selected brand's domain. No LLM calls are made from this module.
"""
from __future__ import annotations

import re
import secrets
import logging
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
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
