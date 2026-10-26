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


def send_recovery_code_email(to: str, code: str, minutes: int = 10, max_attempts: int = 3) -> bool:
    """Envía el código OTP de restablecimiento de contraseña por correo SMTP."""
    s = get_settings()
    subject = f"Código de verificación para restablecer contraseña: {code}"
    text_content = (
        f"Hola,\n\n"
        f"Recibimos una solicitud para restablecer tu contraseña en {s.COMPANY_NAME}.\n\n"
        f"Tu código de verificación de 6 dígitos es: {code}\n\n"
        f"Por seguridad, este código expira en {minutes} minutos y cuenta con un límite estricto de {max_attempts} intentos.\n\n"
        f"Si no solicitaste este cambio, ignora este correo. Tu cuenta sigue protegida.\n\n"
        f"Atentamente,\nEquipo de TI y Recursos Humanos · {s.COMPANY_NAME}"
    )
    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #7c3aed, #0d9488); padding: 24px; text-align: center; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">{s.COMPANY_NAME}</h2>
      <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Sistema Inteligente de Solicitudes Internas</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 15px; margin: 0 0 16px;">Hola,</p>
      <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0 0 20px;">
        Recibimos una solicitud para restablecer la contraseña de acceso a tu cuenta corporativa. Utiliza el siguiente código de verificación:
      </p>
      <div style="background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 18px; text-align: center; margin: 20px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0f172a;">{code}</span>
      </div>
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 14px; border-radius: 4px; font-size: 12px; color: #92400e; margin: 20px 0;">
        <b>Tiempo límite:</b> Válido por <b>{minutes} minutos</b>.<br>
        <b>Seguridad:</b> Cuentas con un máximo de <b>{max_attempts} intentos</b>. Tras superarlos, el código se invalidará automáticamente.
      </div>
      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 24px 0 0;">
        Si no realizaste esta solicitud, puedes ignorar este mensaje de forma segura. Nadie puede acceder a tu cuenta sin este código.
      </p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
      © {s.COMPANY_NAME} · Todos los derechos reservados.
    </div>
  </div>
</body>
</html>"""

    if not s.SMTP_HOST:
        if s.ENVIRONMENT in ("testing", "development"):
            logger.info("[SIMULACIÓN CORREO] Código para %s: %s (válido %d min)", to, code, minutes)
        else:
            logger.info("[SIMULACIÓN CORREO] Código de recuperación generado para %s (SMTP no configurado en entorno de producción; código protegido no registrado en logs).", to)
        return False

    try:
        msg = EmailMessage()
        msg["From"] = s.SMTP_FROM
        msg["To"] = to
        msg["Subject"] = f"[{s.COMPANY_NAME}] {subject}"
        msg.set_content(text_content)
        msg.add_alternative(html_content, subtype="html")

        if s.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(s.SMTP_HOST, s.SMTP_PORT, timeout=15) as smtp:
                if s.SMTP_USER:
                    smtp.login(s.SMTP_USER, s.SMTP_PASSWORD or "")
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=15) as smtp:
                smtp.starttls()
                if s.SMTP_USER:
                    smtp.login(s.SMTP_USER, s.SMTP_PASSWORD or "")
                smtp.send_message(msg)
        logger.info("Correo de recuperación enviado con éxito a %s", to)
        return True
    except Exception as exc:
        logger.error("Error al enviar correo SMTP a %s: %s", to, exc)
        return False
