"""Developer usage analytics — records metadata only (never API keys or dataset content)."""
import asyncio
import ipaddress
import json
import secrets
import urllib.request
from collections import Counter
from datetime import timedelta


# created_at is stored as naive UTC (Postgres func.now() with the default UTC session
# timezone); UAE is a constant UTC+4 (no DST), so a fixed +4h offset is exact.
def _to_uae(dt) -> str:
    if not dt:
        return ""
    return (dt + timedelta(hours=4)).strftime("%Y-%m-%d %H:%M:%S")

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_template import ADMIN_HTML
from app.config import settings
from app.models.database import get_db, UsageEvent, ContactMessage
from app.ratelimit import limiter


# ── Geo-IP (best effort, cached per IP) ─────────────────────────────────────
_geo_cache: dict[str, dict] = {}


def _geo_lookup_sync(ip: str) -> dict:
    if not ip:
        return {}
    if ip in _geo_cache:
        return _geo_cache[ip]
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_private or addr.is_loopback:
            res = {"country": "Local", "country_code": "", "city": "", "region": ""}
            _geo_cache[ip] = res
            return res
    except ValueError:
        return {}
    res: dict = {}
    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,city,regionName"
        with urllib.request.urlopen(url, timeout=2.5) as r:
            d = json.loads(r.read().decode())
        if d.get("status") == "success":
            res = {
                "country": d.get("country") or "",
                "country_code": d.get("countryCode") or "",
                "city": d.get("city") or "",
                "region": d.get("regionName") or "",
            }
    except Exception:
        res = {}
    _geo_cache[ip] = res
    return res


async def _geo_lookup(ip: str) -> dict:
    return await asyncio.to_thread(_geo_lookup_sync, ip)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""

router = APIRouter()          # /api/... (track is public; stats/dashboard require admin)
admin_router = APIRouter()    # /admin (root, password protected)

_security = HTTPBasic()


def require_admin(creds: HTTPBasicCredentials = Depends(_security)) -> bool:
    """HTTP Basic auth — any username, password must match settings.admin_password.

    Fails closed: if ADMIN_PASSWORD is not set, the dashboard is disabled entirely
    (no blank-password access).
    """
    expected = settings.admin_password or ""
    if not expected:
        raise HTTPException(status_code=503, detail="Admin dashboard is not configured (set ADMIN_PASSWORD).")
    if not secrets.compare_digest(creds.password or "", expected):
        raise HTTPException(status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Basic"})
    return True


def _int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


@router.post("/analytics/track")
@limiter.limit("120/minute")
async def track(request: Request, payload: dict, db: AsyncSession = Depends(get_db)):
    event = str(payload.get("event", ""))[:20]
    if event not in ("visit", "run"):
        return {"ok": False}
    providers = payload.get("providers") if isinstance(payload.get("providers"), list) else []
    models = payload.get("models") if isinstance(payload.get("models"), list) else []

    # Prefer the client-supplied public IP (the backend is behind the Next.js proxy,
    # so request headers only show the proxy's address). Fall back to the header IP.
    ip = _client_ip(request)
    client_ip = str(payload.get("client_ip") or "").strip()
    if client_ip:
        try:
            ipaddress.ip_address(client_ip)
            ip = client_ip
        except ValueError:
            pass
    geo = await _geo_lookup(ip)
    cc_header = request.headers.get("cf-ipcountry") or request.headers.get("x-vercel-ip-country") or ""

    ev = UsageEvent(
        event=event,
        session_id=str(payload.get("session_id", ""))[:64],
        providers=[str(p)[:40] for p in providers][:20],
        models=[str(m)[:80] for m in models][:20],
        num_models=_int(payload.get("num_models")),
        runs_per_model=_int(payload.get("runs_per_model")),
        aggregation=str(payload.get("aggregation", ""))[:20],
        num_variables=_int(payload.get("num_variables")),
        num_rows=_int(payload.get("num_rows")),
        num_episodes=_int(payload.get("num_episodes")),
        per_sender=bool(payload.get("per_sender", False)),
        ip=ip[:64],
        country=(geo.get("country") or "")[:80],
        country_code=(geo.get("country_code") or cc_header)[:4],
        city=(geo.get("city") or "")[:120],
        region=(geo.get("region") or "")[:120],
        user_agent=(request.headers.get("user-agent") or "")[:400],
        referer=(request.headers.get("referer") or "")[:400],
    )
    db.add(ev)
    await db.commit()
    return {"ok": True}


async def _compute_stats(db: AsyncSession) -> dict:
    rows = (await db.execute(select(UsageEvent))).scalars().all()
    visits = [r for r in rows if r.event == "visit"]
    runs = [r for r in rows if r.event == "run"]
    provider_c, model_c, rpm_c, agg_c = Counter(), Counter(), Counter(), Counter()
    country_c, cc_c, day_c = Counter(), Counter(), Counter()
    per_sender_runs = 0
    for r in rows:
        country_c[r.country or "Unknown"] += 1
        if r.country_code and r.country and r.country != "Local":
            cc_c[r.country_code.upper()] += 1
        if r.created_at:
            day_c[_to_uae(r.created_at)[:10]] += 1
    for r in runs:
        for p in (r.providers or []):
            provider_c[p] += 1
        for m in (r.models or []):
            model_c[m] += 1
        rpm_c[str(r.runs_per_model or 0)] += 1
        agg_c[r.aggregation or "?"] += 1
        if r.per_sender:
            per_sender_runs += 1
    recent = sorted(rows, key=lambda r: str(r.created_at or ""), reverse=True)[:200]
    return {
        "visits": len(visits),
        "unique_visitors": len({r.session_id for r in rows if r.session_id}),
        "countries": len({r.country for r in rows if r.country and r.country != "Local"}),
        "runs": len(runs),
        "sessions_that_ran": len({r.session_id for r in runs if r.session_id}),
        "per_sender_runs": per_sender_runs,
        "by_country": dict(country_c.most_common()),
        "by_country_code": dict(cc_c.most_common()),
        "by_provider": dict(provider_c.most_common()),
        "by_model": dict(model_c.most_common()),
        "by_runs_per_model": dict(rpm_c.most_common()),
        "by_aggregation": dict(agg_c.most_common()),
        "by_day": dict(sorted(day_c.items())),
        "events": [
            {
                "at": _to_uae(r.created_at),
                "event": r.event,
                "session": (r.session_id or "")[:8],
                "country": r.country or "",
                "city": r.city or "",
                "ip": r.ip or "",
                "models": r.models or [],
                "runs_per_model": r.runs_per_model,
                "aggregation": r.aggregation or "",
                "variables": r.num_variables,
                "rows": r.num_rows,
                "episodes": r.num_episodes,
                "per_sender": bool(r.per_sender),
                "referer": r.referer or "",
                "user_agent": (r.user_agent or "")[:80],
            }
            for r in recent
        ],
    }


async def _fetch_messages(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        select(ContactMessage).order_by(ContactMessage.created_at.desc())
    )).scalars().all()
    return [{
        "id": m.id, "name": m.name or "", "email": m.email or "", "title": m.title or "",
        "body": m.body or "", "status": m.status or "unresolved", "at": _to_uae(m.created_at),
    } for m in rows]


async def _admin_payload(db: AsyncSession) -> dict:
    messages = await _fetch_messages(db)
    return {
        "stats": await _compute_stats(db),
        "messages": messages,
        "counts": {
            "unresolved": sum(1 for m in messages if m["status"] == "unresolved"),
            "resolved": sum(1 for m in messages if m["status"] == "resolved"),
            "total": len(messages),
        },
    }


def _render_admin(payload: dict) -> str:
    # Escape </ so nothing in the data can prematurely close the <script> block.
    data = json.dumps(payload).replace("</", "<\\/")
    return ADMIN_HTML.replace("/*__DATA__*/", data)


@router.get("/analytics/stats")
async def stats(db: AsyncSession = Depends(get_db), _: bool = Depends(require_admin)):
    return await _compute_stats(db)


@router.get("/analytics/dashboard", response_class=HTMLResponse)
async def dashboard(db: AsyncSession = Depends(get_db), _: bool = Depends(require_admin)):
    return HTMLResponse(_render_admin(await _admin_payload(db)))


@admin_router.get("/admin", response_class=HTMLResponse)
async def admin(db: AsyncSession = Depends(get_db), _: bool = Depends(require_admin)):
    return HTMLResponse(_render_admin(await _admin_payload(db)))


class _StatusUpdate(BaseModel):
    status: str


@admin_router.post("/admin/messages/{msg_id}/status")
async def set_message_status(msg_id: str, upd: _StatusUpdate,
                             db: AsyncSession = Depends(get_db), _: bool = Depends(require_admin)):
    status = "resolved" if upd.status == "resolved" else "unresolved"
    m = await db.get(ContactMessage, msg_id)
    if not m:
        raise HTTPException(404, "Message not found")
    m.status = status
    await db.commit()
    return {"ok": True, "status": status}
