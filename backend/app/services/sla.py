"""Agente de SLA: recordatorios y escalamiento automático de aprobaciones vencidas.

Se ejecuta periódicamente (lock en Redis para que solo un worker lo haga) y también bajo demanda.
  - Paso vencido            → recordatorio al aprobador y aviso al solicitante.
  - Vencido por el doble    → escalamiento a RRHH (el paso pasa a ser resoluble por cualquier HR_ADMIN).
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.cache import cache
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models import ApprovalStep, ApprovalWorkflow, AuditAction, NotificationType, StepStatus, User, UserRole
from app.models.request import ACTIVE_STATUSES
from app.services.audit import audit
from app.services.notifications import notify

logger = logging.getLogger("hr.sla")


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


async def run_sla_cycle() -> dict:
    now = datetime.now(timezone.utc)
    reminded = escalated = 0
    async with AsyncSessionLocal() as db:
        q = (select(ApprovalStep).options(selectinload(ApprovalStep.workflow).selectinload(ApprovalWorkflow.request))
             .where(ApprovalStep.status == StepStatus.PENDING, ApprovalStep.due_at.is_not(None), ApprovalStep.due_at < now))
        for step in (await db.execute(q)).scalars():
            wf, req = step.workflow, step.workflow.request
            if step.step_index != wf.current_step_index or req.status not in ACTIVE_STATUSES:
                continue
            due, created = _aware(step.due_at), _aware(req.created_at)
            overdue = now - due
            window = max(due - created, timedelta(hours=1))
            if not step.reminded:
                step.reminded = True
                reminded += 1
                if step.approver_id:
                    await notify(db, step.approver_id, NotificationType.SLA_WARNING, "Aprobación vencida",
                                 f"La solicitud {req.folio} superó su tiempo de atención (SLA).", req.id)
                await notify(db, req.requester_id, NotificationType.SLA_WARNING, "Tu solicitud sigue pendiente",
                             f"{req.folio} está tardando más de lo previsto; se dio seguimiento al aprobador.", req.id)
                audit(db, None, "Request", req.id, AuditAction.SYSTEM, f"Recordatorio SLA enviado para {req.folio}")
            elif not step.escalated and overdue > window and step.approver_role is None:
                step.escalated, step.approver_id, step.approver_role, step.label = True, None, UserRole.HR_ADMIN.value, "RRHH (escalado)"
                escalated += 1
                hr_ids = (await db.execute(select(User.id).where(User.role == UserRole.HR_ADMIN, User.is_active.is_(True),
                                                                 User.id != req.requester_id))).scalars()
                for uid in hr_ids:
                    await notify(db, uid, NotificationType.APPROVAL_PENDING, "Aprobación escalada a RRHH",
                                 f"{req.folio} no fue atendida a tiempo y fue escalada a RRHH.", req.id)
                audit(db, None, "Request", req.id, AuditAction.ESCALATE, f"{req.folio} escalada a RRHH por vencimiento de SLA")
        await db.commit()
    if reminded or escalated:
        await cache.delete_prefix("analytics:")
    return {"reminded": reminded, "escalated": escalated}


async def scheduler_loop() -> None:
    s = get_settings()
    await asyncio.sleep(15)
    while True:
        try:
            if await cache.acquire_lock("sla:lock", max(s.SLA_CHECK_INTERVAL_SECONDS - 5, 5)):
                result = await run_sla_cycle()
                if result["reminded"] or result["escalated"]:
                    logger.info("Ciclo SLA: %s", result)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Error en el ciclo SLA")
        await asyncio.sleep(s.SLA_CHECK_INTERVAL_SECONDS)
