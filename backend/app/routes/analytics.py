"""Developer usage analytics — records metadata only (never API keys or dataset content)."""
import asyncio
import ipaddress
import json
import secrets
import time
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
from starlette.concurrency import run_in_threadpool
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_template import ADMIN_HTML
from app.config import settings
from app.models.database import get_db, UsageEvent, ContactMessage, ErrorLog
from app.ratelimit import limiter
from app.usage import scrub_secrets


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
    if event not in ("visit", "run", "run_complete"):
        return {"ok": False}
    consent = str(payload.get("consent", ""))

    # A rejected visitor contributes only one anonymous visit record. Do not
    # inspect, geolocate, or persist request metadata, browser identifiers, or
    # run configuration for this path.
    if consent == "rejected":
        if event != "visit":
            return {"ok": False}
        db.add(UsageEvent(event="visit"))
        await db.commit()
        return {"ok": True, "anonymous": True}

    # Detailed analytics are accepted only when the client explicitly records
    # the visitor's affirmative choice.
    if consent != "accepted":
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
    # A run's outcome ("run_complete") is correlated to its start ("run") by run_id.
    status = str(payload.get("status", ""))[:20]
    if event == "run":
        status = "started"
    raw_samples = payload.get("error_sample") if isinstance(payload.get("error_sample"), list) else []
    # Provider errors quote the key that was rejected; never persist one.
    error_sample = [scrub_secrets(str(s))[:300] for s in raw_samples][:10]
    ev = UsageEvent(
        event=event,
        session_id=str(payload.get("session_id", ""))[:64],
        run_id=str(payload.get("run_id", ""))[:64],
        status=status,
        episodes_coded=_int(payload.get("episodes_coded")),
        error_count=_int(payload.get("error_count")),
        duration_ms=_int(payload.get("duration_ms")),
        error_sample=error_sample,
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
        country_code=(geo.get("country_code") or "")[:4],
        city=(geo.get("city") or "")[:120],
        region=(geo.get("region") or "")[:120],
        user_agent=(request.headers.get("user-agent") or "")[:400],
        referer=(request.headers.get("referer") or "")[:400],
    )
    db.add(ev)
    await db.commit()
    return {"ok": True}


# ── Public usage summary ────────────────────────────────────────────────────
# Served unauthenticated on the Usage Statistics page, so it exposes only coarse
# aggregates: counts and totals, provider/model names, and activity per month.
# Never an IP address, a city, a session identifier, a user agent, or error text.
# Country totals are published so the page can show a map. That is coarser than
# anything the admin sees — no city, IP, session, or timestamp — but it is still
# more than a bare count, so keep it at country granularity.

_PUBLIC_CACHE_TTL_SECONDS = 120
_PUBLIC_MODELS_ROW_CAP = 20000
_public_summary_cache: dict[str, object] = {"at": 0.0, "payload": None}


async def _compute_public_summary(db: AsyncSession) -> dict:
    async def count_where(*conditions) -> int:
        return int(await db.scalar(select(func.count()).select_from(UsageEvent).where(*conditions)) or 0)

    identified = UsageEvent.run_id.isnot(None) & (UsageEvent.run_id != "")

    # A run is reported by the browser and by the server under one run_id, so count
    # distinct ids; rows predating run ids are counted individually.
    distinct_runs = int(await db.scalar(
        select(func.count(func.distinct(UsageEvent.run_id)))
        .where(UsageEvent.event == "run", identified)
    ) or 0)
    unidentified_runs = await count_where(UsageEvent.event == "run", ~identified)

    completed = (
        select(
            UsageEvent.run_id.label("run_id"),
            func.max(UsageEvent.episodes_coded).label("coded"),
        )
        .where(
            UsageEvent.event == "run_complete",
            UsageEvent.status == "completed",
            identified,
        )
        .group_by(UsageEvent.run_id)
        .subquery()
    )
    completed_count, episodes_coded = (await db.execute(
        select(func.count(), func.coalesce(func.sum(completed.c.coded), 0)).select_from(completed)
    )).one()

    visits = await count_where(UsageEvent.event == "visit")
    downloads = await count_where(UsageEvent.event == "package_download")
    unique_visitors = int(await db.scalar(
        select(func.count(func.distinct(UsageEvent.session_id)))
        .where(UsageEvent.session_id.isnot(None), UsageEvent.session_id != "")
    ) or 0)
    country_rows = (await db.execute(
        select(UsageEvent.country, UsageEvent.country_code, func.count())
        .where(
            UsageEvent.country.isnot(None),
            UsageEvent.country != "",
            UsageEvent.country != "Local",
        )
        .group_by(UsageEvent.country, UsageEvent.country_code)
    )).all()
    by_country: Counter = Counter()
    by_country_code: Counter = Counter()
    for name, code, count in country_rows:
        by_country[str(name)] += int(count)
        if code:
            by_country_code[str(code).upper()] += int(count)
    countries = len(by_country)
    first_event = await db.scalar(select(func.min(UsageEvent.created_at)))

    # Activity per month, so the page can show a trend without exposing timestamps.
    month = func.to_char(UsageEvent.created_at, "YYYY-MM")
    month_rows = (await db.execute(
        select(month, func.count())
        .where(UsageEvent.created_at.isnot(None))
        .group_by(month)
        .order_by(month)
    )).all()

    # The model list is stored as JSON text, so it is tallied in Python.
    model_rows = (await db.execute(
        select(UsageEvent.models, UsageEvent.providers)
        .where(UsageEvent.event == "run")
        .limit(_PUBLIC_MODELS_ROW_CAP)
    )).all()
    model_counter, provider_counter = Counter(), Counter()
    for models, providers in model_rows:
        for name in set(models or []):
            model_counter[str(name)] += 1
        for name in set(providers or []):
            provider_counter[str(name)] += 1

    return {
        "since": _to_uae(first_event)[:10] if first_event else "",
        "visits": visits,
        "unique_visitors": unique_visitors,
        "countries": countries,
        "runs": distinct_runs + unidentified_runs,
        "runs_completed": int(completed_count or 0),
        "episodes_coded": int(episodes_coded or 0),
        "package_downloads": downloads,
        "by_month": {str(label): int(count) for label, count in month_rows if label},
        # Country totals drive the map. This is coarser than the per-visit records
        # the admin sees: names and counts only, never a city, IP, or session.
        "by_country": dict(by_country.most_common()),
        "by_country_code": dict(by_country_code.most_common()),
        "top_models": [{"name": name, "runs": count} for name, count in model_counter.most_common(8)],
        "providers": [{"name": name, "runs": count} for name, count in provider_counter.most_common(8)],
    }


@router.get("/analytics/public-summary")
@limiter.limit("60/minute")
async def public_summary(request: Request, db: AsyncSession = Depends(get_db)):
    """Aggregate usage figures for the public Usage Statistics page."""
    now = time.monotonic()
    cached = _public_summary_cache.get("payload")
    if cached is not None and now - float(_public_summary_cache["at"]) < _PUBLIC_CACHE_TTL_SECONDS:
        return cached
    payload = await _compute_public_summary(db)
    _public_summary_cache["at"] = now
    _public_summary_cache["payload"] = payload
    return payload


def _sort_key(r) -> str:
    return str(r.created_at or "")


_STATS_ROW_CAP = 50000  # bound memory/CPU on large deployments (newest events)


async def _compute_stats(db: AsyncSession) -> dict:
    # Load the newest events (bounded) then process OFF the event loop, so a large
    # dataset or frequent admin polling can never block the whole backend.
    result = await db.execute(
        select(UsageEvent).order_by(UsageEvent.created_at.desc()).limit(_STATS_ROW_CAP)
    )
    rows = list(result.scalars().all())
    return await run_in_threadpool(_process_stats, rows)


def _is_server(row) -> bool:
    """A backend-recorded event. Legacy rows predate the column and are browser ones."""
    return (row.source or "client") == "server"


def _merge_run_reports(starts: list) -> list:
    """Collapse the two reports of one run into a single run.

    A coding run is reported twice: by the browser (only with analytics consent, and
    only if the tab survives the run) and by the backend (always, and authoritative
    about the outcome). They share a run_id, so pick one row per run. The browser row
    is preferred as the descriptor because it also carries the visitor's location and
    the dataset counts; the backend row stands in when the visitor declined analytics.
    """
    by_run: dict[str, list] = {}
    unidentified = []
    for s in starts:
        if s.run_id:
            by_run.setdefault(s.run_id, []).append(s)
        else:
            unidentified.append(s)  # legacy rows recorded before run ids existed
    merged = [next((r for r in group if not _is_server(r)), group[0]) for group in by_run.values()]
    return merged + unidentified


def _process_stats(rows) -> dict:
    visits = [r for r in rows if r.event == "visit"]
    downloads = [r for r in rows if r.event == "package_download"]
    completes = [r for r in rows if r.event == "run_complete"]
    starts = _merge_run_reports([r for r in rows if r.event == "run"])

    # Correlate each run's outcome with its start by run_id. A start with no
    # matching completion is an abandoned run (the server restarted mid-run, or an
    # old browser-only run whose tab was closed). The backend's outcome wins: it is
    # the one report that cannot be lost to consent or a closed tab.
    complete_by_run = {}
    for c in completes:
        if not c.run_id:
            continue
        if c.run_id not in complete_by_run or _is_server(c):
            complete_by_run[c.run_id] = c

    provider_c, model_c, rpm_c, agg_c = Counter(), Counter(), Counter(), Counter()
    country_c, cc_c, day_c, status_c = Counter(), Counter(), Counter(), Counter()
    per_sender_runs = 0
    # Location comes only from browser-reported events; backend events deliberately
    # carry none, so counting them would just inflate "Unknown".
    for r in rows:
        if _is_server(r):
            continue
        country_c[r.country or "Unknown"] += 1
        if r.country_code and r.country and r.country != "Local":
            cc_c[r.country_code.upper()] += 1
    # Activity per day counts each visit, run, and download once.
    for r in visits + starts + downloads:
        if r.created_at:
            day_c[_to_uae(r.created_at)[:10]] += 1

    runs = []  # one entry per Run Coding action, start merged with outcome
    total_episodes_coded = 0
    total_duration_ms = 0
    completed_count = 0
    for s in starts:
        for p in (s.providers or []):
            provider_c[p] += 1
        for m in (s.models or []):
            model_c[m] += 1
        rpm_c[str(s.runs_per_model or 0)] += 1
        agg_c[s.aggregation or "?"] += 1
        if s.per_sender:
            per_sender_runs += 1
        outcome = complete_by_run.get(s.run_id) if s.run_id else None
        status = (outcome.status if outcome else "abandoned") or "abandoned"
        status_c[status] += 1
        if outcome:
            total_episodes_coded += int(outcome.episodes_coded or 0)
            total_duration_ms += int(outcome.duration_ms or 0)
            if status == "completed":
                completed_count += 1
        runs.append({
            "at": _to_uae(s.created_at),
            "ts": _sort_key(s),
            "session": (s.session_id or "")[:8],
            "session_full": s.session_id or "",
            "run_id": s.run_id or "",
            "providers": s.providers or [],
            "models": s.models or [],
            "num_models": s.num_models or (len(s.models or []) or 0),
            "runs_per_model": s.runs_per_model or 0,
            "aggregation": s.aggregation or "",
            "variables": s.num_variables or 0,
            "rows": s.num_rows or 0,
            "episodes": s.num_episodes or 0,
            "per_sender": bool(s.per_sender),
            "country": s.country or "",
            "city": s.city or "",
            "status": status,
            "episodes_coded": int(outcome.episodes_coded or 0) if outcome else None,
            "error_count": int(outcome.error_count or 0) if outcome else None,
            "duration_ms": int(outcome.duration_ms or 0) if outcome else None,
            "error_sample": (outcome.error_sample or []) if outcome else [],
        })
    runs.sort(key=lambda x: x["ts"], reverse=True)

    # Group everything by session so the admin can show "who did what".
    sessions_map = {}
    for r in rows:
        sid = r.session_id or ""
        if not sid:
            continue
        sess = sessions_map.setdefault(sid, {
            "id": sid, "short": sid[:8], "first_ts": _sort_key(r), "last_ts": _sort_key(r),
            "first": _to_uae(r.created_at), "last": _to_uae(r.created_at),
            "country": "", "city": "", "visits": 0, "runs": 0,
            "models": set(), "episodes": 0, "per_sender": False,
        })
        k = _sort_key(r)
        if k < sess["first_ts"]:
            sess["first_ts"], sess["first"] = k, _to_uae(r.created_at)
        if k >= sess["last_ts"]:
            sess["last_ts"], sess["last"] = k, _to_uae(r.created_at)
        if r.country and r.country != "Local":
            sess["country"] = r.country
            sess["city"] = r.city or sess["city"]
        if r.event == "visit":
            sess["visits"] += 1
        elif r.event == "run":
            sess["runs"] += 1
            for m in (r.models or []):
                sess["models"].add(m)
            sess["episodes"] += int(r.num_episodes or 0)
            if r.per_sender:
                sess["per_sender"] = True

    runs_by_session = {}
    for run in runs:
        runs_by_session.setdefault(run["session_full"], []).append(run)

    sessions = []
    for sid, sess in sessions_map.items():
        sess["models"] = sorted(sess["models"])
        sess["run_list"] = runs_by_session.get(sid, [])
        sessions.append(sess)
    sessions.sort(key=lambda x: x["last_ts"], reverse=True)

    started_n = len(starts)
    recent = sorted(rows, key=_sort_key, reverse=True)[:300]
    return {
        "visits": len(visits),
        "unique_visitors": len({r.session_id for r in rows if r.session_id}),
        "countries": len({r.country for r in rows if r.country and r.country != "Local"}),
        # Run-outcome summary.
        "runs": started_n,                       # Run Coding actions started
        # The two ways a run reaches the dashboard, so it is obvious when browser
        # analytics are being declined and the server counts are carrying the load.
        "runs_recorded_by_server": sum(1 for r in rows if r.event == "run" and _is_server(r)),
        "runs_reported_by_browser": sum(1 for r in rows if r.event == "run" and not _is_server(r)),
        "package_downloads": len(downloads),     # script packages downloaded to run offline
        "runs_completed": completed_count,
        "runs_failed": status_c.get("failed", 0),
        "runs_stopped": status_c.get("stopped", 0),
        "runs_abandoned": status_c.get("abandoned", 0),
        "success_rate": round(100 * completed_count / started_n, 1) if started_n else 0,
        "avg_episodes": round(total_episodes_coded / completed_count, 1) if completed_count else 0,
        "avg_duration_ms": round(total_duration_ms / completed_count) if completed_count else 0,
        "total_episodes_coded": total_episodes_coded,
        "sessions_that_ran": len({r.session_id for r in starts if r.session_id}),
        "per_sender_runs": per_sender_runs,
        "by_country": dict(country_c.most_common()),
        "by_country_code": dict(cc_c.most_common()),
        "by_provider": dict(provider_c.most_common()),
        "by_model": dict(model_c.most_common()),
        "by_runs_per_model": dict(rpm_c.most_common()),
        "by_aggregation": dict(agg_c.most_common()),
        "by_status": dict(status_c.most_common()),
        "by_day": dict(sorted(day_c.items())),
        "runs_list": runs[:300],
        "sessions": sessions[:300],
        "events": [
            {
                "at": _to_uae(r.created_at),
                "event": r.event,
                "source": "server" if _is_server(r) else "browser",
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
                "status": r.status or "",
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


async def _fetch_server_errors(db: AsyncSession, limit: int = 200) -> list[dict]:
    rows = (await db.execute(
        select(ErrorLog).order_by(ErrorLog.created_at.desc()).limit(limit)
    )).scalars().all()
    return [{
        "at": _to_uae(e.created_at),
        "source": e.source or "backend",
        "method": e.method or "",
        "path": e.path or "",
        "kind": e.kind or "Error",
        "message": e.message or "",
        "detail": e.detail or "",
    } for e in rows]


async def _admin_payload(db: AsyncSession) -> dict:
    from app.releases import RELEASES
    from app import __version__

    messages = await _fetch_messages(db)
    return {
        "stats": await _compute_stats(db),
        "server_errors": await _fetch_server_errors(db),
        "messages": messages,
        "counts": {
            "unresolved": sum(1 for m in messages if m["status"] == "unresolved"),
            "resolved": sum(1 for m in messages if m["status"] == "resolved"),
            "total": len(messages),
        },
        "version": __version__,
        "releases": RELEASES,
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
