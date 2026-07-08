"""Contact form → stored in the DB and managed in the /admin panel."""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db, ContactMessage
from app.ratelimit import limiter

router = APIRouter()


class ContactRequest(BaseModel):
    name: str
    email: str
    title: str = ""
    body: str


@router.post("/contact")
@limiter.limit("10/hour")
async def contact(request: Request, req: ContactRequest, db: AsyncSession = Depends(get_db)):
    name = req.name.strip()[:120]
    email = req.email.strip()[:200]
    title = req.title.strip()[:200]
    body = req.body.strip()[:5000]

    if not name or not email or not body:
        raise HTTPException(400, "Name, email, and message are required.")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Please enter a valid email address.")

    db.add(ContactMessage(name=name, email=email, title=title, body=body, status="unresolved"))
    await db.commit()
    return {"ok": True}
