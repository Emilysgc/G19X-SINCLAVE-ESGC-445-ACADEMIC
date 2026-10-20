"""Motor de flujos de trabajo: creación, aprobación multinivel, rechazo y cancelación de solicitudes."""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import cache
from app.core.config import get_settings
from app.core.security import encrypt_value
from app.models import (
    ACTIVE_STATUSES, ApprovalStep, ApprovalWorkflow, AuditAction, Department, NotificationType, Request, RequestStatus,
    RequestType, RequestTypeConfig, StepStatus, User, UserRole, generate_folio,
)
from app.services import documents
from app.services.ai_agent import Validation, get_agent
from app.services.audit import audit
from app.services.notifications import notify
from app.services.rules import classify_priority, evaluate_rules
from app.services.utils import mask_account

TITLES = {
    RequestType.VACATION: "Solicitud de vacaciones", RequestType.PERSONAL_LEAVE: "Permiso personal",
    RequestType.MEDICAL_LEAVE: "Permiso médico", RequestType.MATERNITY_PATERNITY: "Licencia de maternidad/paternidad",
    RequestType.CERTIFICATE_EMPLOYMENT: "Constancia laboral", RequestType.CERTIFICATE_SALARY: "Constancia de sueldo",
    RequestType.ADDRESS_CHANGE: "Cambio de domicilio", RequestType.BANK_ACCOUNT_CHANGE: "Cambio de cuenta bancaria",
    RequestType.PAYROLL_INCIDENT: "Incidencia de nómina", RequestType.OTHER: "Otra solicitud",
}
BALANCE_TYPES = (RequestType.VACATION, RequestType.PERSONAL_LEAVE)
LEAVE_FINAL = (RequestType.VACATION, RequestType.PERSONAL_LEAVE, RequestType.MEDICAL_LEAVE, RequestType.MATERNITY_PATERNITY)


class RuleViolation(Exception):
    def __init__(self, validation: Validation):
        self.validation = validation


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_config(db: AsyncSession, rtype: RequestType) -> Optional[RequestTypeConfig]:
    return (await db.execute(select(RequestTypeConfig).where(RequestTypeConfig.type == rtype))).scalar_one_or_none()


async def _supervisor(db: AsyncSession, user: User) -> Optional[User]:
    sup_id = user.direct_supervisor_id
    if not sup_id and user.department_id:
        dept = await db.get(Department, user.department_id)
        sup_id = dept.manager_id if dept else None
    if not sup_id or sup_id == user.id:
        return None
    sup = await db.get(User, sup_id)
    return sup if sup and sup.is_active else None


from sqlalchemy.orm.attributes import flag_modified


def _chain(rtype: RequestType, days: Optional[float], sup: Optional[User]) -> list[dict]:
    sup_step = {"label": "Supervisor", "approver_id": sup.id, "approver_role": None} if sup else None
    hr_step = {"label": "Recursos Humanos", "approver_id": None, "approver_role": UserRole.HR_ADMIN.value}

    # Vacaciones: vacaciones largas (>= VACATION_HR_APPROVAL_DAYS) requieren supervisor y RRHH
    if rtype == RequestType.VACATION:
        s = get_settings()
        if days and days >= s.VACATION_HR_APPROVAL_DAYS:
            return [sup_step, hr_step] if sup_step else [hr_step]
        return [sup_step] if sup_step else [hr_step]

    # Maternidad/Paternidad: supervisor y RRHH
    if rtype == RequestType.MATERNITY_PATERNITY:
        return [x for x in (sup_step, hr_step) if x]

    # Permiso personal y otros tipos con supervisor
    if rtype in (RequestType.PERSONAL_LEAVE, RequestType.OTHER):
        return [sup_step] if sup_step else [hr_step]

    # Por defecto (médico, cuenta bancaria, domicilio, incidencias): aprobación de RRHH
    return [hr_step]


def _sanitize_data(rtype: RequestType, data: dict) -> dict:
    data = dict(data or {})
    if rtype == RequestType.BANK_ACCOUNT_CHANGE:
        clabe = str(data.pop("clabe", ""))
        data["clabe_enc"] = encrypt_value(clabe)
        data["clabe_masked"] = mask_account(clabe)
    return data


async def _activate_step(db: AsyncSession, req: Request, step: ApprovalStep, cfg: Optional[RequestTypeConfig]) -> None:
    step.due_at = _now() + timedelta(hours=cfg.sla_hours if cfg else 48)
    who = req.requester.full_name if req.requester else "un empleado"
    prior_actors = {
        s.acted_by_id for s in (req.workflow.steps if req.workflow else [])
        if s.step_index < step.step_index and s.acted_by_id is not None
    }
    targets: list[int] = []
    if step.approver_id:
        targets = [step.approver_id]
    elif step.approver_role:
        q = select(User.id).where(User.role == UserRole(step.approver_role), User.is_active.is_(True), User.id != req.requester_id)
        targets = [uid for uid in (await db.execute(q)).scalars() if uid not in prior_actors]
    for uid in targets:
        await notify(db, uid, NotificationType.APPROVAL_PENDING, "Solicitud pendiente de tu aprobación",
                     f"{who} envió la solicitud {req.folio} ({req.title}).", req.id)


async def _freeze_document(db: AsyncSession, req: Request, requester: User) -> None:
    dept = await db.get(Department, requester.department_id) if requester.department_id else None
    dept_name = dept.name if dept else None
    data = dict(req.request_data or {})
    data["_doc_snapshot"] = documents.build_doc_snapshot(requester, dept_name)
    req.request_data = data
    flag_modified(req, "request_data")
    req.generated_document_html = documents.render_html(req, requester, dept_name)


async def _apply_effects(db: AsyncSession, req: Request) -> RequestStatus:
    requester = await db.get(User, req.requester_id)
    if req.type == RequestType.VACATION and req.days_requested:
        requester.vacation_balance = max(0.0, requester.vacation_balance - req.days_requested)
    elif req.type == RequestType.PERSONAL_LEAVE and req.days_requested:
        requester.personal_leave_balance = max(0.0, requester.personal_leave_balance - req.days_requested)
    elif req.type == RequestType.ADDRESS_CHANGE:
        d = req.request_data or {}
        requester.address = str(d.get("new_address", ""))[:300] or requester.address
        if d.get("phone"):
            requester.phone = str(d["phone"])[:30]
    elif req.type in (RequestType.CERTIFICATE_SALARY, RequestType.CERTIFICATE_EMPLOYMENT):
        await _freeze_document(db, req, requester)
    return RequestStatus.APPROVED if req.type in LEAVE_FINAL else RequestStatus.COMPLETED


async def _load(db: AsyncSession, request_id: int, lock: bool = False) -> Request:
    q = (select(Request).options(selectinload(Request.requester),
                                 selectinload(Request.workflow).selectinload(ApprovalWorkflow.steps).selectinload(ApprovalStep.approver),
                                 selectinload(Request.workflow).selectinload(ApprovalWorkflow.steps).selectinload(ApprovalStep.acted_by))
         .where(Request.id == request_id).execution_options(populate_existing=True))
    if lock:
        q = q.with_for_update(of=Request)
    req = (await db.execute(q)).scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Solicitud no encontrada")
    return req


async def precheck(db: AsyncSession, user: User, rtype: RequestType, start_date, end_date, description, data) -> tuple[Validation, Optional[float]]:
    rules = await evaluate_rules(db, user, rtype, start_date, end_date, data or {}, description)
    cfg = await get_config(db, rtype)
    v = await get_agent().validate(db, user, rtype, rules, description, data or {}, cfg)
    return v, rules.days


async def create_request(db: AsyncSession, user: User, rtype: RequestType, title: Optional[str], description: Optional[str],
                         start_date, end_date, data: dict, ip: Optional[str] = None) -> Request:
    cfg = await get_config(db, rtype)
    if cfg and not cfg.is_active:
        raise HTTPException(400, "Este tipo de solicitud está deshabilitado.")
    rules = await evaluate_rules(db, user, rtype, start_date, end_date, data or {}, description)
    validation = await get_agent().validate(db, user, rtype, rules, description, data or {}, cfg)
    if not validation.is_valid:
        raise RuleViolation(validation)

    start = date.fromisoformat(str(start_date)) if start_date else None
    end = date.fromisoformat(str(end_date)) if end_date else None
    req = Request(
        folio=generate_folio(rtype), requester_id=user.id, type=rtype, status=RequestStatus.PENDING_APPROVAL,
        priority=classify_priority(rtype, start), title=(title or TITLES[rtype])[:200], description=description,
        start_date=start, end_date=end, days_requested=rules.days, request_data=_sanitize_data(rtype, data),
        ai_validation_score=validation.score, ai_validation_notes=_notes(validation), ai_risk_level=validation.risk_level,
        due_at=_now() + timedelta(hours=cfg.sla_hours if cfg else 48), attached_files=[],
    )
    req.requester = user
    req.workflow = None  # evita carga perezosa (async) antes de crear el flujo
    db.add(req)
    await db.flush()

    if rtype in (RequestType.CERTIFICATE_EMPLOYMENT, RequestType.CERTIFICATE_SALARY) and not (cfg and cfg.requires_approval):
        await _freeze_document(db, req, user)
        await _finish(db, req, RequestStatus.COMPLETED, auto=True)
        await notify(db, user.id, NotificationType.REQUEST_COMPLETED, "Constancia lista",
                     f"Tu {req.title.lower()} ({req.folio}) ya está disponible para descargar.", req.id)
    elif validation.auto_approve:
        final = await _apply_effects(db, req)
        await _finish(db, req, final, auto=True)
        await notify(db, user.id, NotificationType.REQUEST_APPROVED, "Solicitud aprobada automáticamente",
                     f"{req.folio} cumple las reglas de auto-aprobación.", req.id)
        sup = await _supervisor(db, user)
        if sup:
            await notify(db, sup.id, NotificationType.SYSTEM, "Permiso aprobado automáticamente",
                         f"{user.full_name}: {req.title} ({req.start_date} a {req.end_date}).", req.id)
    else:
        sup = await _supervisor(db, user)
        chain = _chain(rtype, rules.days, sup)
        wf = ApprovalWorkflow(request_id=req.id, total_steps=len(chain), current_step_index=0)
        db.add(wf)
        await db.flush()
        steps = []
        for i, c in enumerate(chain):
            st = ApprovalStep(workflow_id=wf.id, step_index=i, label=c["label"], approver_id=c["approver_id"], approver_role=c["approver_role"])
            db.add(st)
            steps.append(st)
        await db.flush()
        await _activate_step(db, req, steps[0], cfg)
        if rtype == RequestType.MEDICAL_LEAVE and sup:
            await notify(db, sup.id, NotificationType.SYSTEM, "Ausencia médica registrada",
                         f"{user.full_name} registró un permiso médico ({req.folio}: ausente del {req.start_date} al {req.end_date}).", req.id)
        await notify(db, user.id, NotificationType.REQUEST_SUBMITTED, "Solicitud enviada",
                     f"{req.folio} fue enviada y está pendiente de aprobación.", req.id)

    audit(db, user.id, "Request", req.id, AuditAction.CREATE, f"Solicitud {req.folio} creada por {user.full_name}",
          {"type": rtype.value, "status": req.status.value, "risk": validation.risk_level, "ai": validation.used_ai}, ip)
    await db.flush()
    await cache.delete_prefix("analytics:")
    return await _load(db, req.id)


def _notes(v: Validation) -> str:
    parts = [v.notes] + [f"⚠ {w}" for w in v.warnings] + [f"→ {r}" for r in v.recommendations]
    return "\n".join(p for p in parts if p)[:2000]


async def _finish(db: AsyncSession, req: Request, status: RequestStatus, auto: bool = False) -> None:
    req.status = status
    req.completed_at = _now()
    req.auto_resolved = auto
    if req.workflow:
        req.workflow.completed_at = req.completed_at


def _already_approved_prior_step(step: ApprovalStep, actor: User, req: Request) -> bool:
    if not req.workflow:
        return False
    return any(
        s.step_index < step.step_index and s.status == StepStatus.APPROVED and s.acted_by_id == actor.id
        for s in req.workflow.steps
    )


def _can_act(step: ApprovalStep, actor: User, req: Request) -> bool:
    if actor.id == req.requester_id:
        return False  # nadie aprueba su propia solicitud
    if _already_approved_prior_step(step, actor, req):
        return False  # doble validación exige un segundo aprobador distinto
    if step.approver_id is not None:
        current_sup_id = req.requester.direct_supervisor_id if (step.label == "Supervisor" and req.requester) else None
        return actor.id in (step.approver_id, current_sup_id) or actor.role == UserRole.SYSTEM_ADMIN
    return actor.role.value == step.approver_role or actor.role == UserRole.SYSTEM_ADMIN


async def reassign_supervisor_steps(db: AsyncSession, employee_id: int, new_supervisor_id: Optional[int]) -> int:
    """Actualiza el aprobador de pasos 'Supervisor' pendientes cuando cambia el jefe del empleado."""
    q = (
        select(ApprovalStep)
        .join(ApprovalWorkflow, ApprovalStep.workflow_id == ApprovalWorkflow.id)
        .join(Request, ApprovalWorkflow.request_id == Request.id)
        .where(
            Request.requester_id == employee_id,
            Request.status.in_(ACTIVE_STATUSES),
            ApprovalStep.status == StepStatus.PENDING,
            ApprovalStep.label == "Supervisor",
        )
    )
    updated = 0
    for step in (await db.execute(q)).scalars():
        if new_supervisor_id and new_supervisor_id != employee_id:
            step.approver_id = new_supervisor_id
            step.approver_role = None
        else:
            step.approver_id = None
            step.approver_role = UserRole.HR_ADMIN.value
            step.label = "Recursos Humanos"
        updated += 1
    return updated


def current_step(req: Request) -> Optional[ApprovalStep]:
    if not req.workflow or req.status not in ACTIVE_STATUSES:
        return None
    return next((s for s in req.workflow.steps if s.step_index == req.workflow.current_step_index), None)


async def approve(db: AsyncSession, request_id: int, actor: User, comments: Optional[str], ip: Optional[str] = None) -> Request:
    req = await _load(db, request_id, lock=True)
    step = current_step(req)
    if not step:
        raise HTTPException(400, f"La solicitud está en estado {req.status.value} y no admite acciones.")
    if _already_approved_prior_step(step, actor, req):
        raise HTTPException(403, "Esta solicitud requiere doble validación: un segundo aprobador distinto debe autorizar este paso.")
    if not _can_act(step, actor, req):
        raise HTTPException(403, "No eres aprobador del paso actual de esta solicitud.")

    if req.type == RequestType.VACATION and req.days_requested and req.days_requested > req.requester.vacation_balance \
            and req.workflow.current_step_index + 1 >= req.workflow.total_steps:
        raise HTTPException(409, "El saldo de vacaciones del empleado ya no alcanza. Rechace o pida ajustar el saldo.")

    step.status, step.acted_by_id, step.action_date, step.comments = StepStatus.APPROVED, actor.id, _now(), comments
    wf = req.workflow
    if wf.current_step_index + 1 < wf.total_steps:
        wf.current_step_index += 1
        req.status = RequestStatus.IN_REVIEW
        nxt = next(s for s in wf.steps if s.step_index == wf.current_step_index)
        await _activate_step(db, req, nxt, await get_config(db, req.type))
    else:
        final = await _apply_effects(db, req)
        await _finish(db, req, final)
        await notify(db, req.requester_id, NotificationType.REQUEST_APPROVED, "¡Solicitud aprobada!",
                     f"{req.folio} fue aprobada por {actor.full_name}.", req.id)
    audit(db, actor.id, "Request", req.id, AuditAction.APPROVE, f"{req.folio} aprobada por {actor.full_name}",
          {"step": step.step_index, "comments": comments, "status": req.status.value}, ip)
    await db.flush()
    await cache.delete_prefix("analytics:")
    return await _load(db, req.id)


async def reject(db: AsyncSession, request_id: int, actor: User, comments: str, ip: Optional[str] = None) -> Request:
    if not comments or len(comments.strip()) < 5:
        raise HTTPException(400, "El rechazo requiere un motivo (mínimo 5 caracteres).")
    req = await _load(db, request_id, lock=True)
    step = current_step(req)
    if not step:
        raise HTTPException(400, f"La solicitud está en estado {req.status.value} y no admite acciones.")
    if not _can_act(step, actor, req):
        raise HTTPException(403, "No eres aprobador del paso actual de esta solicitud.")
    step.status, step.acted_by_id, step.action_date, step.comments = StepStatus.REJECTED, actor.id, _now(), comments
    await _finish(db, req, RequestStatus.REJECTED)
    await notify(db, req.requester_id, NotificationType.REQUEST_REJECTED, "Solicitud rechazada",
                 f"{req.folio} fue rechazada por {actor.full_name}. Motivo: {comments[:200]}", req.id)
    audit(db, actor.id, "Request", req.id, AuditAction.REJECT, f"{req.folio} rechazada por {actor.full_name}", {"comments": comments}, ip)
    await db.flush()
    await cache.delete_prefix("analytics:")
    return await _load(db, req.id)


async def cancel(db: AsyncSession, request_id: int, actor: User, ip: Optional[str] = None) -> Request:
    req = await _load(db, request_id, lock=True)
    is_owner = req.requester_id == actor.id
    if not is_owner and actor.role != UserRole.HR_ADMIN:
        raise HTTPException(403, "Solo el solicitante o Recursos Humanos pueden cancelar esta solicitud.")
    restore = req.status == RequestStatus.APPROVED and req.type in BALANCE_TYPES and req.start_date and req.start_date > date.today()
    if req.status not in ACTIVE_STATUSES and not restore:
        raise HTTPException(400, f"No se puede cancelar una solicitud en estado {req.status.value}.")
    if restore and req.days_requested:
        requester = await db.get(User, req.requester_id)
        if req.type == RequestType.VACATION:
            requester.vacation_balance += req.days_requested
        else:
            requester.personal_leave_balance += req.days_requested
    req.status, req.completed_at = RequestStatus.CANCELLED, _now()
    if req.workflow:
        req.workflow.completed_at = req.completed_at
    audit(db, actor.id, "Request", req.id, AuditAction.CANCEL, f"{req.folio} cancelada por {actor.full_name}", {"balance_restored": bool(restore)}, ip)
    await db.flush()
    await cache.delete_prefix("analytics:")
    return await _load(db, req.id)
