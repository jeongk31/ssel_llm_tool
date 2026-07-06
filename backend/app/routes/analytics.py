"""Developer usage analytics — records metadata only (never API keys or dataset content)."""
from collections import Counter

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db, UsageEvent

router = APIRouter()


def _int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


@router.post("/analytics/track")
async def track(payload: dict, db: AsyncSession = Depends(get_db)):
    event = str(payload.get("event", ""))[:20]
    if event not in ("visit", "run"):
        return {"ok": False}
    providers = payload.get("providers") or []
    models = payload.get("models") or []
    ev = UsageEvent(
        event=event,
        session_id=str(payload.get("session_id", ""))[:64],
        providers=[str(p)[:40] for p in providers if isinstance(providers, list)][:20],
        models=[str(m)[:80] for m in models if isinstance(models, list)][:20],
        num_models=_int(payload.get("num_models")),
        runs_per_model=_int(payload.get("runs_per_model")),
        aggregation=str(payload.get("aggregation", ""))[:20],
        num_variables=_int(payload.get("num_variables")),
        num_rows=_int(payload.get("num_rows")),
        num_episodes=_int(payload.get("num_episodes")),
        per_sender=bool(payload.get("per_sender", False)),
    )
    db.add(ev)
    await db.commit()
    return {"ok": True}


async def _compute_stats(db: AsyncSession) -> dict:
    rows = (await db.execute(select(UsageEvent))).scalars().all()
    visits = [r for r in rows if r.event == "visit"]
    runs = [r for r in rows if r.event == "run"]
    provider_c, model_c, rpm_c, agg_c = Counter(), Counter(), Counter(), Counter()
    per_sender_runs = 0
    for r in runs:
        for p in (r.providers or []):
            provider_c[p] += 1
        for m in (r.models or []):
            model_c[m] += 1
        rpm_c[str(r.runs_per_model or 0)] += 1
        agg_c[r.aggregation or "?"] += 1
        if r.per_sender:
            per_sender_runs += 1
    recent = sorted(runs, key=lambda r: r.created_at or "", reverse=True)[:20]
    return {
        "visits": len(visits),
        "unique_visitors": len({r.session_id for r in rows if r.session_id}),
        "runs": len(runs),
        "sessions_that_ran": len({r.session_id for r in runs if r.session_id}),
        "per_sender_runs": per_sender_runs,
        "by_provider": dict(provider_c.most_common()),
        "by_model": dict(model_c.most_common()),
        "by_runs_per_model": dict(rpm_c.most_common()),
        "by_aggregation": dict(agg_c.most_common()),
        "recent_runs": [
            {
                "at": str(r.created_at) if r.created_at else None,
                "models": r.models or [],
                "runs_per_model": r.runs_per_model,
                "aggregation": r.aggregation,
                "variables": r.num_variables,
                "rows": r.num_rows,
                "episodes": r.num_episodes,
                "per_sender": r.per_sender,
            }
            for r in recent
        ],
    }


@router.get("/analytics/stats")
async def stats(db: AsyncSession = Depends(get_db)):
    return await _compute_stats(db)


@router.get("/analytics/dashboard", response_class=HTMLResponse)
async def dashboard(db: AsyncSession = Depends(get_db)):
    s = await _compute_stats(db)

    def table(title, d):
        if not d:
            return f"<h3>{title}</h3><p class='muted'>—</p>"
        rows = "".join(f"<tr><td>{k}</td><td>{v}</td></tr>" for k, v in d.items())
        return f"<h3>{title}</h3><table>{rows}</table>"

    recent_rows = "".join(
        f"<tr><td>{r['at'] or ''}</td><td>{', '.join(r['models'])}</td><td>{r['runs_per_model']}</td>"
        f"<td>{r['aggregation']}</td><td>{r['variables']}</td><td>{r['rows']}</td>"
        f"<td>{r['episodes']}</td><td>{'yes' if r['per_sender'] else ''}</td></tr>"
        for r in s["recent_runs"]
    ) or "<tr><td colspan='8' class='muted'>No runs yet</td></tr>"

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>ChAT — Usage</title>
<style>
  body{{font-family:-apple-system,Segoe UI,sans-serif;padding:32px;color:#18181b;background:#f4f5f7}}
  h1{{font-size:20px;margin:0 0 4px}} .sub{{color:#71717a;font-size:12px;margin-bottom:20px}}
  h3{{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#7c4dab;margin:18px 0 6px}}
  .cards{{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px}}
  .card{{background:#fff;border:1px solid #e3e5ea;border-radius:8px;padding:14px 18px;min-width:120px}}
  .card .v{{font-size:24px;font-weight:700}} .card .l{{font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.04em}}
  table{{border-collapse:collapse;background:#fff;border:1px solid #e3e5ea;border-radius:8px;overflow:hidden;font-size:12.5px;min-width:280px}}
  td,th{{padding:6px 12px;border-bottom:1px solid #f1f1f4;text-align:left}}
  .muted{{color:#a1a1aa}}
</style></head><body>
<h1>ChAT — Chat Annotation Toolkit · Usage</h1>
<div class="sub">Metadata only — no API keys or dataset content is stored. Refresh to update.</div>
<div class="cards">
  <div class="card"><div class="v">{s['visits']}</div><div class="l">Visits</div></div>
  <div class="card"><div class="v">{s['unique_visitors']}</div><div class="l">Unique visitors</div></div>
  <div class="card"><div class="v">{s['runs']}</div><div class="l">Runs</div></div>
  <div class="card"><div class="v">{s['sessions_that_ran']}</div><div class="l">Sessions that ran</div></div>
  <div class="card"><div class="v">{s['per_sender_runs']}</div><div class="l">Per-sender runs</div></div>
</div>
{table("Runs by provider", s['by_provider'])}
{table("Runs by model", s['by_model'])}
{table("Runs by runs-per-model", s['by_runs_per_model'])}
{table("Runs by aggregation", s['by_aggregation'])}
<h3>Recent runs</h3>
<table>
  <thead><tr><th>When</th><th>Models</th><th>Runs</th><th>Agg</th><th>Vars</th><th>Rows</th><th>Episodes</th><th>Per-sender</th></tr></thead>
  <tbody>{recent_rows}</tbody>
</table>
</body></html>"""
    return HTMLResponse(html)
