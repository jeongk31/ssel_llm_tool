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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.database import get_db, UsageEvent
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
    country_c, day_c = Counter(), Counter()
    per_sender_runs = 0
    for r in rows:
        country_c[r.country or "Unknown"] += 1
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


@router.get("/analytics/stats")
async def stats(db: AsyncSession = Depends(get_db), _: bool = Depends(require_admin)):
    return await _compute_stats(db)


@router.get("/analytics/dashboard", response_class=HTMLResponse)
async def dashboard(db: AsyncSession = Depends(get_db), _: bool = Depends(require_admin)):
    return HTMLResponse(_render_dashboard(await _compute_stats(db)))


@admin_router.get("/admin", response_class=HTMLResponse)
async def admin(db: AsyncSession = Depends(get_db), _: bool = Depends(require_admin)):
    return HTMLResponse(_render_dashboard(await _compute_stats(db)))


def _esc(v) -> str:
    return str(v if v is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _render_dashboard(s: dict) -> str:
    def table(title, d):
        if not d:
            return f"<h3>{title}</h3><p class='muted'>—</p>"
        rows = "".join(f"<tr><td>{_esc(k)}</td><td>{v}</td></tr>" for k, v in d.items())
        return f"<h3>{title}</h3><table>{rows}</table>"

    event_rows = "".join(
        f"<tr><td>{_esc(r['at'])}</td>"
        f"<td><span class='ev ev-{r['event']}'>{r['event']}</span></td>"
        f"<td>{_esc(r['session'])}</td>"
        f"<td>{_esc((r['country'] + (' · ' + r['city'] if r['city'] else '')) or '—')}</td>"
        f"<td class='mono'>{_esc(r['ip'])}</td>"
        f"<td>{_esc(', '.join(r['models']) or '—')}</td>"
        f"<td>{r['runs_per_model'] or ''}</td><td>{_esc(r['aggregation'])}</td>"
        f"<td>{r['variables'] or ''}</td><td>{r['rows'] or ''}</td><td>{r['episodes'] or ''}</td>"
        f"<td>{'yes' if r['per_sender'] else ''}</td>"
        f"<td class='mono small'>{_esc(r['user_agent'])}</td></tr>"
        for r in s["events"]
    ) or "<tr><td colspan='13' class='muted'>No events yet</td></tr>"

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>ChAT — Usage</title>
<style>
  body{{font-family:-apple-system,Segoe UI,sans-serif;padding:32px;color:#18181b;background:#f4f5f7}}
  h1{{font-size:20px;margin:0 0 4px}} .sub{{color:#71717a;font-size:12px;margin-bottom:20px}}
  h3{{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#7c4dab;margin:18px 0 6px}}
  .cards{{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px}}
  .card{{background:#fff;border:1px solid #e3e5ea;border-radius:8px;padding:14px 18px;min-width:110px}}
  .card .v{{font-size:24px;font-weight:700}} .card .l{{font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.04em}}
  .grid{{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}}
  table{{border-collapse:collapse;background:#fff;border:1px solid #e3e5ea;border-radius:8px;overflow:hidden;font-size:12.5px}}
  td,th{{padding:6px 12px;border-bottom:1px solid #f1f1f4;text-align:left;white-space:nowrap}}
  th{{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#a1a1aa;background:#fafafa}}
  .muted{{color:#a1a1aa}} .mono{{font-family:ui-monospace,Menlo,monospace}} .small{{font-size:10.5px;max-width:220px;overflow:hidden;text-overflow:ellipsis}}
  .ev{{font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px}}
  .ev-visit{{background:#e0e7ff;color:#3730a3}} .ev-run{{background:#dcfce7;color:#166534}}
  .log-wrap{{overflow:auto;max-width:100%}}
</style></head><body>
<h1>ChAT — Chat Annotation Toolkit · Usage</h1>
<div class="sub">Metadata only — no API keys or dataset content is stored. Times in UAE (GST, UTC+4); country/city best-effort from IP. Refresh to update.</div>
<div class="cards">
  <div class="card"><div class="v">{s['visits']}</div><div class="l">Visits</div></div>
  <div class="card"><div class="v">{s['unique_visitors']}</div><div class="l">Unique visitors</div></div>
  <div class="card"><div class="v">{s['countries']}</div><div class="l">Countries</div></div>
  <div class="card"><div class="v">{s['runs']}</div><div class="l">Runs</div></div>
  <div class="card"><div class="v">{s['sessions_that_ran']}</div><div class="l">Sessions that ran</div></div>
  <div class="card"><div class="v">{s['per_sender_runs']}</div><div class="l">Per-sender runs</div></div>
</div>
<div class="grid">
  <div>{table("By country", s['by_country'])}</div>
  <div>{table("Runs by provider", s['by_provider'])}</div>
  <div>{table("Runs by model", s['by_model'])}</div>
  <div>{table("Runs / model", s['by_runs_per_model'])}</div>
  <div>{table("Runs by aggregation", s['by_aggregation'])}</div>
  <div>{table("Events by day", s['by_day'])}</div>
</div>
<h3>Raw event log (latest {len(s['events'])})</h3>
<div class="log-wrap"><table>
  <thead><tr><th>When (UAE / GST)</th><th>Event</th><th>Session</th><th>Location</th><th>IP</th><th>Models</th><th>Runs</th><th>Agg</th><th>Vars</th><th>Rows</th><th>Episodes</th><th>Per-sender</th><th>User agent</th></tr></thead>
  <tbody>{event_rows}</tbody>
</table></div>
</body></html>"""
    return html
