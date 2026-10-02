"""Coding runs that execute on the server rather than in the browser's connection.

A normal run is driven by its HTTP stream: close the tab, lose the network, and
the generator is closed and the run dies. That is what loses work when someone's
internet drops mid-run.

A job here is the same coding run, started by a request that returns immediately
and then left to finish on its own. Progress is written to the ``coding_jobs``
row so any later request can read it, and the run is reachable at a page keyed by
an unguessable token.

Deliberate boundaries:

- **The API key is never stored.** It lives in the running task's frame and dies
  with it. A restart therefore cannot resume a run — such runs are marked
  ``interrupted`` on the next boot so nobody is left waiting for an email that
  will never arrive.
- **No participant data in the database.** The row holds counters and model
  names; coded rows stay in the temp directory the run writes.
- **Bounded.** A semaphore caps how many run at once and an episode ceiling caps
  how large one may be, so a forgotten run cannot spend without limit.
"""

import asyncio
import logging
import secrets
import time
from datetime import datetime, timedelta

from sqlalchemy import select, update

from app.config import settings
from app.usage import scrub_secrets

logger = logging.getLogger(__name__)

# Live tasks, so a job can be stopped and so nothing is garbage-collected early.
_tasks: dict[str, asyncio.Task] = {}
_stop_flags: set[str] = set()
_slots: asyncio.Semaphore | None = None

# Progress is persisted at most this often; a fast model would otherwise write a
# row per episode and spend the run talking to Postgres.
_PROGRESS_INTERVAL_SECONDS = 2.0
# Episodes to observe before an estimate is worth showing.
_ETA_MIN_SAMPLES = 5
_MAX_ERROR_SAMPLES = 10


def _semaphore() -> asyncio.Semaphore:
    global _slots
    if _slots is None:
        _slots = asyncio.Semaphore(max(1, settings.max_concurrent_jobs))
    return _slots


def new_token() -> str:
    """The capability that guards a run's page. Must be unguessable."""
    return secrets.token_hex(16)


def expiry_from(moment: datetime) -> datetime:
    return moment + timedelta(hours=settings.run_link_ttl_hours)


def eta_seconds(current: int, total: int, elapsed: float) -> int | None:
    """Seconds remaining, from the rate this run has actually achieved.

    The coding loop is sequential — one provider call per episode, awaited — so
    the rate measured over the first few episodes predicts the rest closely, and
    it needs no history: it self-calibrates to this model, this prompt length and
    this network.
    """
    if current < _ETA_MIN_SAMPLES or current >= total or elapsed <= 0:
        return None
    return max(0, round((total - current) * (elapsed / current)))


def job_payload(job) -> dict:
    """The public view of a job: progress and counters, never dataset content."""
    elapsed = 0.0
    if job.started_at:
        end = job.finished_at or datetime.utcnow()
        elapsed = max(0.0, (end - job.started_at).total_seconds())
    remaining = (
        eta_seconds(job.current_episode or 0, job.total_episodes or 0, elapsed)
        if job.status == "running"
        else None
    )
    return {
        "token": job.token,
        "status": job.status,
        "current": job.current_episode or 0,
        "total": job.total_episodes or 0,
        "episodes_coded": job.episodes_coded or 0,
        "error_count": job.error_count or 0,
        "error_sample": job.error_sample or [],
        "message": job.message or "",
        "file_name": job.file_name or "",
        "models": job.models or [],
        "runs_per_model": job.runs_per_model or 1,
        "elapsed_seconds": round(elapsed),
        "eta_seconds": remaining,
        "has_results": bool(job.result_path) and job.status == "completed",
        "email_status": job.email_status or "",
        "expires_at": job.expires_at.isoformat() if job.expires_at else "",
    }


async def _save(job_id: str, **fields) -> None:
    from app.models.database import AsyncSessionLocal, CodingJob

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(update(CodingJob).where(CodingJob.id == job_id).values(**fields))
            await db.commit()
    except Exception:
        logger.warning("could not update job %s", job_id, exc_info=True)


async def get_job(db, token: str):
    from app.models.database import CodingJob

    result = await db.execute(select(CodingJob).where(CodingJob.token == token))
    return result.scalars().first()


def request_stop(token: str) -> None:
    _stop_flags.add(token)


async def start(config: dict, file_info: dict, *, email: str = "") -> dict:
    """Create a job and leave it running. Returns the job's public payload."""
    from app.models.database import AsyncSessionLocal, CodingJob

    token = new_token()
    created = datetime.utcnow()
    slots = [s for s in (config.get("model_slots") or []) if isinstance(s, dict)]
    job = CodingJob(
        token=token,
        status="queued",
        file_name=str(config.get("file_name") or file_info.get("file_name") or "")[:255],
        models=[str(s.get("model", ""))[:80] for s in slots][:20],
        runs_per_model=int(config.get("runs_per_model") or 1),
        email=(email or "")[:200],
        created_at=created,
        expires_at=expiry_from(created),
    )
    async with AsyncSessionLocal() as db:
        db.add(job)
        await db.commit()
        job_id = job.id

    task = asyncio.create_task(_run(job_id, token, config, file_info, email))
    _tasks[token] = task
    task.add_done_callback(lambda _t: _tasks.pop(token, None))

    async with AsyncSessionLocal() as db:
        return job_payload(await get_job(db, token))


async def _run(job_id: str, token: str, config: dict, file_info: dict, email: str) -> None:
    # Imported here: routes.coding imports this module for its endpoints.
    from app.routes.coding import _coding_updates

    status = "failed"
    current = total = coded = errors = 0
    samples: list[str] = []
    message = ""
    result_path = ""
    started = datetime.utcnow()
    clock = time.monotonic()
    last_write = 0.0

    try:
        async with _semaphore():
            await _save(job_id, status="running", started_at=started)
            async for update_event in _coding_updates(config, file_info):
                if token in _stop_flags:
                    status = "stopped"
                    break
                kind = update_event.get("type")
                if kind == "progress":
                    current = int(update_event.get("current") or 0)
                    total = int(update_event.get("total") or total)
                    # Checked here because the episode count is only known once
                    # grouping has happened, inside the run itself.
                    if total > settings.max_detached_episodes:
                        status = "failed"
                        message = (
                            f"A run left to finish on the server is limited to "
                            f"{settings.max_detached_episodes} episodes; this one has {total}. "
                            "Code it in the browser, or narrow the rows in Step 1."
                        )
                        break
                elif kind == "error":
                    errors += 1
                    if len(samples) < _MAX_ERROR_SAMPLES:
                        samples.append(scrub_secrets(str(update_event.get("message", "")))[:300])
                elif kind == "complete":
                    total = int(update_event.get("total_rows") or total)
                    coded = int(update_event.get("coded_rows") or 0)
                    result_path = str(update_event.get("file_path") or "")
                    status = "completed" if (coded > 0 or errors == 0) else "failed"

                now = time.monotonic()
                if now - last_write >= _PROGRESS_INTERVAL_SECONDS:
                    last_write = now
                    await _save(
                        job_id,
                        current_episode=current,
                        total_episodes=total,
                        error_count=errors,
                        error_sample=samples,
                    )
    except asyncio.CancelledError:
        # The process is going down (a deploy, usually). Say so plainly rather
        # than leaving the row claiming the run is still going.
        await _save(
            job_id,
            status="interrupted",
            finished_at=datetime.utcnow(),
            message="The server restarted while this run was in progress. Please run it again.",
        )
        raise
    except Exception as exc:
        message = scrub_secrets(str(exc))[:500]
        logger.warning("job %s failed", job_id, exc_info=True)
    finally:
        _stop_flags.discard(token)

    if status == "stopped" and not message:
        message = "The run was stopped."
    await _save(
        job_id,
        status=status,
        current_episode=current,
        total_episodes=total,
        episodes_coded=coded,
        error_count=errors,
        error_sample=samples,
        message=message,
        result_path=result_path,
        finished_at=datetime.utcnow(),
    )

    if email:
        from app.mailer import send_run_finished

        outcome = await send_run_finished(email, token, status, coded, total)
        await _save(job_id, email_status=outcome)

    logger.info("job %s finished as %s in %.1fs", job_id, status, time.monotonic() - clock)


async def mark_interrupted_on_boot() -> None:
    """Nothing survives a restart, so no row may still claim to be running."""
    from app.models.database import AsyncSessionLocal, CodingJob

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(CodingJob)
                .where(CodingJob.status.in_(("queued", "running")))
                .values(
                    status="interrupted",
                    finished_at=datetime.utcnow(),
                    message="The server restarted while this run was in progress. Please run it again.",
                )
            )
            await db.commit()
    except Exception:
        logger.warning("could not reconcile jobs after restart", exc_info=True)


async def live_result_dirs() -> set[str]:
    """Result directories the temp sweeper must leave alone.

    Uploads expire after 24 hours, but a run link lives longer, so the sweeper
    would otherwise delete the results out from under a link that still works.
    """
    import os

    from app.models.database import AsyncSessionLocal, CodingJob

    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(CodingJob.result_path).where(
                    CodingJob.result_path.isnot(None),
                    CodingJob.result_path != "",
                    CodingJob.expires_at > datetime.utcnow(),
                )
            )).all()
        return {os.path.dirname(os.path.realpath(path)) for (path,) in rows if path}
    except Exception:
        logger.warning("could not list live job results", exc_info=True)
        return set()


async def purge_expired() -> int:
    """Delete expired jobs and the results behind them."""
    import os
    import shutil

    from app.models.database import AsyncSessionLocal, CodingJob

    removed = 0
    try:
        async with AsyncSessionLocal() as db:
            expired = (await db.execute(
                select(CodingJob).where(CodingJob.expires_at <= datetime.utcnow())
            )).scalars().all()
            for job in expired:
                if job.result_path:
                    directory = os.path.dirname(os.path.realpath(job.result_path))
                    if os.path.basename(directory).startswith("llm_coding_"):
                        shutil.rmtree(directory, ignore_errors=True)
                await db.delete(job)
                removed += 1
            if removed:
                await db.commit()
    except Exception:
        logger.warning("could not purge expired jobs", exc_info=True)
    return removed
