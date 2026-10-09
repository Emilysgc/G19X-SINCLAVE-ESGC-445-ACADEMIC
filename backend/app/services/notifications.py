"""Notificaciones: panel interno + canales externos opcionales (correo SMTP y Microsoft Teams)."""
import asyncio
import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

import httpx
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Notification, NotificationType, User

logger = logging.getLogger("hr.notify")


async def notify(db: AsyncSession, user_id: int, ntype: NotificationType, title: str, message: str,
                 request_id: Optional[int] = None) -> Notification:
    n = Notification(user_id=user_id, type=ntype, title=title[:200], message=message[:1000], related_request_id=request_id)
    db.add(n)
    await db.flush()
    s = get_settings()
    if s.SMTP_HOST or s.TEAMS_WEBHOOK_URL:
        email = (await db.execute(select(User.email).where(User.id == user_id))).scalar_one_or_none()
        asyncio.create_task(_deliver_external(email, title, message))
    return n


async def _deliver_external(email: Optional[str], title: str, message: str) -> None:
    s = get_settings()
    try:
        if s.SMTP_HOST and email:
            await asyncio.to_thread(_send_email, email, title, message)
        if s.TEAMS_WEBHOOK_URL:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(s.TEAMS_WEBHOOK_URL, json={"text": f"**{title}**\n\n{message}"})
    except Exception as exc:  # noqa: BLE001  (un canal externo nunca debe romper el flujo)
        logger.warning("No se pudo entregar la notificación externa: %s", exc)


def _send_email(to: str, subject: str, body: str) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.SMTP_FROM, to, f"[{s.COMPANY_NAME} RRHH] {subject}"
    msg.set_content(body)
    with smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if s.SMTP_USER:
            smtp.login(s.SMTP_USER, s.SMTP_PASSWORD or "")
        smtp.send_message(msg)


async def unread_count(db: AsyncSession, user_id: int) -> int:
    q = select(func.count()).select_from(Notification).where(Notification.user_id == user_id, Notification.is_read.is_(False))
    return (await db.execute(q)).scalar() or 0


async def mark_all_read(db: AsyncSession, user_id: int) -> None:
    await db.execute(update(Notification).where(Notification.user_id == user_id, Notification.is_read.is_(False)).values(is_read=True))
