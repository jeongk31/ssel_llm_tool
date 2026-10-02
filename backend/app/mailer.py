"""Outgoing mail for server-side coding runs.

CAT sends one kind of message: a link to a run's own page. It never attaches
results. Coded communication in an email leaves the server for good — into
mail archives, backups and forwards — where the 48-hour expiry means nothing.
A link keeps the data on the server and lets it expire.

Mail is optional. With no ``SMTP_HOST`` configured nothing is sent, and that is
not an error: server-side runs still work and their links still work, so the
feature is usable before a relay is approved.
"""

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from starlette.concurrency import run_in_threadpool

from app.config import settings

logger = logging.getLogger(__name__)

_CONNECT_TIMEOUT_SECONDS = 20


def run_link(token: str) -> str:
    """The absolute URL of a run's page, or "" when no public URL is configured."""
    base = settings.public_base_url.strip().rstrip("/")
    return f"{base}/runs/{token}" if base else ""


def _build(to_address: str, subject: str, body: str) -> EmailMessage:
    message = EmailMessage()
    message["From"] = formataddr((settings.mail_from_name, settings.mail_from))
    message["To"] = to_address
    message["Subject"] = subject
    message["Auto-Submitted"] = "auto-generated"  # keep auto-replies away
    message.set_content(body)
    return message


def _send_sync(message: EmailMessage) -> None:
    if settings.smtp_port == 465:
        client: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=_CONNECT_TIMEOUT_SECONDS
        )
    else:
        client = smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=_CONNECT_TIMEOUT_SECONDS
        )
    try:
        if settings.smtp_starttls and settings.smtp_port != 465:
            client.starttls()
        if settings.smtp_user:
            client.login(settings.smtp_user, settings.smtp_password)
        client.send_message(message)
    finally:
        try:
            client.quit()
        except Exception:
            client.close()


async def send_run_finished(to_address: str, token: str, status: str, coded: int, total: int) -> str:
    """Tell someone their run is done. Returns "sent", "failed" or "skipped"."""
    link = run_link(token)
    if not settings.mail_configured or not to_address or not link:
        return "skipped"

    hours = settings.run_link_ttl_hours
    if status == "completed":
        subject = "Your CAT coding run has finished"
        opening = f"Your coding run finished. {coded} of {total} episodes were coded."
    elif status == "stopped":
        subject = "Your CAT coding run was stopped"
        opening = f"Your coding run was stopped after coding {coded} of {total} episodes."
    else:
        subject = "Your CAT coding run did not finish"
        opening = (
            f"Your coding run did not finish. {coded} of {total} episodes were coded "
            "before it stopped; the page below shows what went wrong."
        )

    body = (
        f"{opening}\n\n"
        f"Open your results:\n{link}\n\n"
        f"The page shows the run's progress and lets you download the results. "
        f"It stays available for {hours} hours from when the run started, after which "
        f"the results are deleted from the server.\n\n"
        "Anyone with this link can download the results, so treat it like the data itself.\n\n"
        "— CAT, Social Science Experimental Laboratory, NYU Abu Dhabi\n"
    )

    try:
        await run_in_threadpool(_send_sync, _build(to_address, subject, body))
        return "sent"
    except Exception:
        # A failed notification must never fail the run: the results are on the
        # server either way and the link still works.
        logger.warning("could not send run notification", exc_info=True)
        return "failed"
