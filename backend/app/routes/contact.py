"""Contact form → email. Sends submissions to settings.contact_to via SMTP."""
import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.ratelimit import limiter

router = APIRouter()


class ContactRequest(BaseModel):
    name: str
    email: str
    title: str = ""
    body: str


def _hdr(s: str) -> str:
    """Strip CR/LF so user input can't inject extra email headers."""
    return s.replace("\r", " ").replace("\n", " ").strip()


def _send_email(name: str, email: str, title: str, body: str) -> None:
    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
        raise RuntimeError("The contact form is not configured yet.")

    msg = EmailMessage()
    subject = _hdr(title) or "New message"
    msg["Subject"] = f"[ChAT] {subject}"[:200]
    msg["From"] = formataddr(("ChAT Contact Form", settings.contact_from or settings.smtp_user))
    msg["To"] = settings.contact_to
    if "@" in email:
        msg["Reply-To"] = _hdr(email)
    msg.set_content(
        f"New message from the ChAT contact form:\n\n"
        f"Name:  {name}\n"
        f"Email: {email}\n"
        f"Title: {title}\n\n"
        f"{body}\n"
    )

    context = ssl.create_default_context()
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls(context=context)
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


@router.post("/contact")
@limiter.limit("5/hour")
async def contact(request: Request, req: ContactRequest):
    name = req.name.strip()[:120]
    email = req.email.strip()[:200]
    title = req.title.strip()[:150]
    body = req.body.strip()[:5000]

    if not name or not email or not body:
        raise HTTPException(400, "Name, email, and message are required.")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Please enter a valid email address.")

    try:
        await asyncio.to_thread(_send_email, name, email, title, body)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception:
        raise HTTPException(502, "Could not send your message right now. Please try again later.")
    return {"ok": True}
