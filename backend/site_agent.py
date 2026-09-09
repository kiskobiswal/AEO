"""Site Agent — "Connect Website" tag pipeline.

Flow:
  1) User in profile → generates a script tag with a unique `script_id`
     and pastes it into their site's <head>.
  2) The script (served by GET /api/site-agent/{script_id}.js) loads on
     every page of the customer's site, POSTs `/ping` with the current
     origin + page URL to verify the connection, then polls
     `/patches?url=...` for any approved fixes queued from the project
     report. Patches supported today:
       - meta_title:       update <title> + og:title + twitter:title
       - meta_description: update <meta name="description"> + og/twitter
       - content_block:    inject a small HTML block near the top of <main>
                           (or <body>) if not already present.
  3) After applying, the script POSTs `/patches/{id}/ack` so it isn't
     re-applied.

All public endpoints return `Access-Control-Allow-Origin: *` so they
work when embedded on customer sites. Authenticated user endpoints for
managing connections live in server.py (`/api/site-connections`).
"""
from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# The DB handle is injected from server.py at import time via `bind_db`.
_db = None
_backend_base_url_env_key = "APP_URL"  # set by supervisor to the public URL


def bind_db(db):
    """Called once from server.py after Mongo is initialised."""
    global _db
    _db = db


# ------------------------- helpers -----------------------------------

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _origin_domain(request: Request) -> Optional[str]:
    """Extract the customer site's root domain from Origin / Referer."""
    src = request.headers.get("origin") or request.headers.get("referer") or ""
    if not src:
        return None
    try:
        host = urlparse(src).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return host or None
    except Exception:
        return None


def normalize_domain(d: str) -> str:
    """Strip protocol, www, trailing slash, path — return bare host."""
    d = (d or "").strip().lower()
    d = d.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    if d.startswith("www."):
        d = d[4:]
    return d


def _cors_response(payload, status_code: int = 200) -> Response:
    body = json.dumps(payload).encode("utf-8")
    return Response(
        content=body,
        status_code=status_code,
        media_type="application/json",
        headers=CORS_HEADERS,
    )


# ------------------------- models ------------------------------------


class PingBody(BaseModel):
    href: Optional[str] = None
    host: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


# ------------------------- router ------------------------------------

site_agent_router = APIRouter(prefix="/api/site-agent")


# The JS payload served to customer sites. Keep it small & dependency-free.
# It runs in the customer's browser — never trust anything from it beyond
# the request headers (Origin/Referer) which the browser controls.
_JS_TEMPLATE = r"""
(function(){
  try {
    var API = %API_BASE_JSON%;
    var SID = %SCRIPT_ID_JSON%;
    if (!API || !SID) return;
    var doneKey = "__citetail_applied_" + SID;
    if (window[doneKey]) return;
    window[doneKey] = {};
    var applied = window[doneKey];

    function meta(name){ var m=document.querySelector('meta[name="'+name+'"]'); return m?m.getAttribute('content'):''; }
    function ogMeta(prop){ var m=document.querySelector('meta[property="'+prop+'"]'); return m?m.getAttribute('content'):''; }

    function ping(){
      try {
        var body = {
          href: location.href,
          host: location.host,
          title: document.title || "",
          description: meta("description") || ogMeta("og:description") || ""
        };
        fetch(API + "/api/site-agent/" + SID + "/ping", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify(body),
          keepalive: true,
          credentials: "omit",
          mode: "cors"
        }).catch(function(){});
      } catch(e){}
    }

    function setMeta(name, content){
      var m = document.querySelector('meta[name="'+name+'"]');
      if (!m) { m = document.createElement("meta"); m.setAttribute("name", name); document.head.appendChild(m); }
      m.setAttribute("content", content || "");
    }
    function setProp(prop, content){
      var m = document.querySelector('meta[property="'+prop+'"]');
      if (!m) { m = document.createElement("meta"); m.setAttribute("property", prop); document.head.appendChild(m); }
      m.setAttribute("content", content || "");
    }

    function apply(patch){
      try {
        if (applied[patch.id]) return false;
        var ptype = patch.patch_type;
        var payload = patch.payload || {};
        if (ptype === "meta_title" && payload.value){
          document.title = payload.value;
          setProp("og:title", payload.value);
          setProp("twitter:title", payload.value);
        } else if (ptype === "meta_description" && payload.value){
          setMeta("description", payload.value);
          setProp("og:description", payload.value);
          setProp("twitter:description", payload.value);
        } else if (ptype === "content_block" && payload.html){
          var slot = document.getElementById("citetail-block-" + patch.id);
          if (!slot){
            slot = document.createElement("div");
            slot.id = "citetail-block-" + patch.id;
            slot.setAttribute("data-citetail-patch", patch.id);
            slot.innerHTML = payload.html;
            var target = document.querySelector("main") || document.body;
            if (target && target.firstChild) target.insertBefore(slot, target.firstChild);
            else if (target) target.appendChild(slot);
          }
        } else { return false; }
        applied[patch.id] = 1;
        fetch(API + "/api/site-agent/" + SID + "/patches/" + patch.id + "/ack", {
          method: "POST", credentials: "omit", mode: "cors", keepalive: true
        }).catch(function(){});
        return true;
      } catch(e){ return false; }
    }

    function poll(){
      try {
        var u = API + "/api/site-agent/" + SID + "/patches?url=" + encodeURIComponent(location.href);
        fetch(u, {credentials: "omit", mode: "cors"}).then(function(r){ return r.json(); })
          .then(function(data){
            var patches = (data && data.patches) || [];
            patches.forEach(apply);
          }).catch(function(){});
      } catch(e){}
    }

    function start(){
      ping();
      poll();
      // Re-poll every 20s so approved fixes appear without a manual reload.
      setInterval(poll, 20000);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else { start(); }
  } catch(e){}
})();
"""


def _api_base(request: Request) -> str:
    """Return the origin the script should call — always this backend."""
    # Prefer the public APP_URL supervisor exposes; fall back to request scheme/host.
    import os
    env_url = os.environ.get(_backend_base_url_env_key)
    if env_url:
        return env_url.rstrip("/")
    return f"{request.url.scheme}://{request.url.netloc}"


@site_agent_router.options("/{script_id}/ping")
@site_agent_router.options("/{script_id}/patches")
@site_agent_router.options("/{script_id}/patches/{patch_id}/ack")
async def cors_preflight(script_id: str, patch_id: str = ""):
    return Response(status_code=204, headers=CORS_HEADERS)


@site_agent_router.get("/{script_id}.js")
async def serve_script(script_id: str, request: Request) -> Response:
    """Public JS that the customer's site loads via <script src=...>."""
    if _db is None:
        raise HTTPException(status_code=503, detail="Site agent not ready")
    conn = await _db.site_connections.find_one({"script_id": script_id})
    if not conn:
        body = b'/* citetail: unknown script id */'
        return Response(content=body, media_type="application/javascript", headers=CORS_HEADERS)
    api_base = _api_base(request)
    js = (_JS_TEMPLATE
          .replace("%API_BASE_JSON%", json.dumps(api_base))
          .replace("%SCRIPT_ID_JSON%", json.dumps(script_id)))
    return Response(
        content=js.encode("utf-8"),
        media_type="application/javascript",
        headers={**CORS_HEADERS, "Cache-Control": "public, max-age=300"},
    )


@site_agent_router.post("/{script_id}/ping")
async def site_ping(script_id: str, body: PingBody, request: Request) -> Response:
    """Called by the injected script on every page load. Records the
    customer's real domain (from the request Origin / Referer + JS host)
    and marks the connection verified once the domain is confirmed."""
    if _db is None:
        raise HTTPException(status_code=503, detail="Site agent not ready")
    conn = await _db.site_connections.find_one({"script_id": script_id})
    if not conn:
        return _cors_response({"ok": False, "error": "unknown_script"}, status_code=404)

    origin_host = _origin_domain(request) or normalize_domain(body.host or "")
    now = _now_iso()
    updates: dict = {"last_ping_at": now}
    if body.title:
        updates["current_title"] = body.title[:300]
    if body.description:
        updates["current_description"] = body.description[:600]

    if origin_host:
        # First real ping — pin the domain and mark verified.
        if not conn.get("verified") or not conn.get("domain"):
            updates["domain"] = origin_host
            updates["verified"] = True
            updates["verified_at"] = now
        elif conn.get("domain") != origin_host:
            # Optional: track that a different host is trying to use this script.
            updates["last_alt_host"] = origin_host

    if updates:
        await _db.site_connections.update_one({"_id": conn["_id"]}, {"$set": updates})

    return _cors_response({
        "ok": True,
        "verified": bool(updates.get("verified") or conn.get("verified")),
        "domain": updates.get("domain") or conn.get("domain"),
    })


@site_agent_router.get("/{script_id}/patches")
async def get_patches(script_id: str, request: Request, url: str = "") -> Response:
    """Return pending patches for the current page URL (falls back to any
    domain-wide patches). Called by the injected script every ~20s."""
    if _db is None:
        raise HTTPException(status_code=503, detail="Site agent not ready")
    conn = await _db.site_connections.find_one({"script_id": script_id})
    if not conn:
        return _cors_response({"patches": []})

    # Fetch all pending for this script + not yet applied.
    docs = await _db.site_patches.find({"script_id": script_id, "status": "pending"},
                                       {"_id": 0}).to_list(50)
    if not docs:
        return _cors_response({"patches": []})

    # Match by page_url when present; anything without a page_url is global to the domain.
    matched = []
    for p in docs:
        target = (p.get("page_url") or "").strip()
        if not target:
            matched.append(p)
            continue
        try:
            if urlparse(url).path == urlparse(target).path or url == target:
                matched.append(p)
        except Exception:
            matched.append(p)

    # Return a slim view — never leak internal fields the customer's site doesn't need.
    slim = [{
        "id": p["id"],
        "patch_type": p["patch_type"],
        "payload": p.get("payload") or {},
        "page_url": p.get("page_url"),
    } for p in matched[:20]]
    return _cors_response({"patches": slim})


@site_agent_router.post("/{script_id}/patches/{patch_id}/ack")
async def ack_patch(script_id: str, patch_id: str) -> Response:
    """Mark a patch as applied (idempotent)."""
    if _db is None:
        raise HTTPException(status_code=503, detail="Site agent not ready")
    await _db.site_patches.update_one(
        {"id": patch_id, "script_id": script_id},
        {"$set": {"status": "applied", "applied_at": _now_iso()}},
    )
    return _cors_response({"ok": True})


# --------- helpers used from server.py for the profile / fix endpoints -----

def new_script_id() -> str:
    """Cryptographically-random public token for the <script> URL."""
    return "ct_" + secrets.token_urlsafe(18)


def make_script_tag(api_base: str, script_id: str) -> str:
    return f'<script src="{api_base.rstrip("/")}/api/site-agent/{script_id}.js" async></script>'
