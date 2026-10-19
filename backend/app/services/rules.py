"""Motor de reglas de negocio DETERMINISTA. Es la fuente de verdad; la IA solo complementa."""
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import LEAVE_TYPES, Priority, Request, RequestStatus, RequestType, User
from app.services.utils import calendar_days, clabe_is_valid, working_days


@dataclass
class RuleResult:
    errors: list[str] = field(default_factory=list)            # bloquean la solicitud
    warnings: list[str] = field(default_factory=list)          # pasan a revisión humana
    recommendations: list[str] = field(default_factory=list)
    days: Optional[float] = None
    facts: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.errors


def _parse(value) -> Optional[date]:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


async def _overlap_count(db: AsyncSession, user_id: int, start: date, end: date) -> int:
    live = (RequestStatus.PENDING_APPROVAL, RequestStatus.IN_REVIEW, RequestStatus.APPROVED, RequestStatus.COMPLETED)
    q = select(func.count()).select_from(Request).where(
        Request.requester_id == user_id, Request.type.in_(LEAVE_TYPES), Request.status.in_(live),
        Request.start_date <= end, Request.end_date >= start,
    )
    return (await db.execute(q)).scalar() or 0


async def _team_absence(db: AsyncSession, user: User, start: date, end: date) -> tuple[int, int]:
    """(compañeros ausentes en el periodo, tamaño del equipo sin contar al solicitante)."""
    if user.direct_supervisor_id:
        cond = User.direct_supervisor_id == user.direct_supervisor_id
    elif user.department_id:
        cond = User.department_id == user.department_id
    else:
        return 0, 0
    team_ids = [r for r in (await db.execute(select(User.id).where(cond, User.id != user.id, User.is_active.is_(True)))).scalars()]
    if not team_ids:
        return 0, 0
    live = (RequestStatus.PENDING_APPROVAL, RequestStatus.IN_REVIEW, RequestStatus.APPROVED)
    q = select(func.count(func.distinct(Request.requester_id))).where(
        Request.requester_id.in_(team_ids), Request.type.in_(LEAVE_TYPES), Request.status.in_(live),
        Request.start_date <= end, Request.end_date >= start,
    )
    return (await db.execute(q)).scalar() or 0, len(team_ids)


async def evaluate_rules(db: AsyncSession, user: User, rtype: RequestType, start_date, end_date, data: dict,
                         description: Optional[str]) -> RuleResult:
    s = get_settings()
    r = RuleResult()
    data = data or {}
    today = date.today()
    start, end = _parse(start_date), _parse(end_date)

    if rtype in LEAVE_TYPES:
        if not start or not end:
            r.errors.append("Indique la fecha de inicio y la fecha de fin.")
            return r
        if end < start:
            r.errors.append("La fecha de fin no puede ser anterior a la de inicio.")
            return r
        if rtype == RequestType.MATERNITY_PATERNITY:
            kind = data.get("kind")
            if kind not in ("maternity", "paternity"):
                r.errors.append("Indique si es licencia de maternidad o de paternidad.")
                return r
            r.days = calendar_days(start, end) if kind == "maternity" else working_days(start, end)
            ref = 84 if kind == "maternity" else 5
            if r.days != ref:
                r.warnings.append(f"La duración ({r.days:g} días) difiere de la referencia legal de {ref} días (LFT); RRHH validará.")
        else:
            r.days = working_days(start, end)
        if r.days <= 0:
            r.errors.append("El periodo seleccionado no incluye días laborables.")
            return r

        if rtype != RequestType.MEDICAL_LEAVE and start < today:
            r.errors.append("La fecha de inicio no puede estar en el pasado.")
        if rtype == RequestType.MEDICAL_LEAVE and start < today - timedelta(days=30):
            r.errors.append("Los permisos médicos retroactivos solo pueden registrarse hasta 30 días después.")
        if await _overlap_count(db, user.id, start, end):
            r.errors.append("Ya tienes otra solicitud de ausencia que coincide con estas fechas.")

        if rtype == RequestType.VACATION:
            r.facts["balance"] = user.vacation_balance
            if r.days > user.vacation_balance:
                r.errors.append(f"Saldo de vacaciones insuficiente: solicitas {r.days:g} y tienes {user.vacation_balance:g} días.")
            if (start - today).days < s.VACATION_MIN_NOTICE_DAYS:
                r.errors.append(f"Las vacaciones requieren al menos {s.VACATION_MIN_NOTICE_DAYS} días de anticipación.")
            if r.days > s.VACATION_MAX_CONSECUTIVE_DAYS:
                r.errors.append(f"El máximo por solicitud es de {s.VACATION_MAX_CONSECUTIVE_DAYS} días hábiles consecutivos.")
            absent, size = await _team_absence(db, user, start, end)
            r.facts["team_absent"], r.facts["team_size"] = absent, size
            if size and (absent + 1) / (size + 1) > s.TEAM_MAX_ABSENT_RATIO:
                r.warnings.append(f"Cobertura del equipo: {absent} de {size} compañeros ya estarían ausentes en esas fechas.")
            if r.days >= s.VACATION_HR_APPROVAL_DAYS:
                r.recommendations.append("Por su duración, la solicitud también será revisada por RRHH.")
        elif rtype == RequestType.PERSONAL_LEAVE:
            r.facts["balance"] = user.personal_leave_balance
            if r.days > user.personal_leave_balance:
                r.errors.append(f"Saldo de permisos insuficiente: solicitas {r.days:g} y tienes {user.personal_leave_balance:g} días.")
        elif rtype == RequestType.MEDICAL_LEAVE:
            if r.days > s.MEDICAL_CERT_REQUIRED_DAYS:
                r.warnings.append(f"Más de {s.MEDICAL_CERT_REQUIRED_DAYS} días requieren comprobante médico adjunto.")
                r.recommendations.append("Adjunte el comprobante médico desde el detalle de la solicitud.")

    elif rtype == RequestType.CERTIFICATE_EMPLOYMENT:
        if not user.hire_date:
            r.errors.append("No hay fecha de ingreso registrada; contacta a RRHH para completar tu expediente.")
    elif rtype == RequestType.CERTIFICATE_SALARY:
        if not user.salary:
            r.errors.append("No hay sueldo registrado en tu expediente; contacta a RRHH.")
        if not user.hire_date:
            r.errors.append("No hay fecha de ingreso registrada; contacta a RRHH.")
    elif rtype == RequestType.ADDRESS_CHANGE:
        if len((data.get("new_address") or "").strip()) < 10:
            r.errors.append("Escribe el domicilio completo (calle, número, colonia, ciudad, C.P.).")
        r.recommendations.append("RRHH puede solicitar un comprobante de domicilio reciente.")
    elif rtype == RequestType.BANK_ACCOUNT_CHANGE:
        if not (data.get("bank_name") or "").strip():
            r.errors.append("Indica el nombre del banco.")
        if not clabe_is_valid(str(data.get("clabe", ""))):
            r.errors.append("La CLABE no es válida (18 dígitos con dígito verificador correcto).")
        r.warnings.append("Cambio de cuenta de nómina: RRHH debe validar la titularidad.")
    elif rtype in (RequestType.PAYROLL_INCIDENT, RequestType.OTHER):
        if len((description or "").strip()) < 15:
            r.errors.append("Describe el caso con al menos 15 caracteres.")
        if rtype == RequestType.PAYROLL_INCIDENT and not data.get("period"):
            r.warnings.append("No se indicó el periodo de nómina afectado.")
    return r


def classify_priority(rtype: RequestType, start: Optional[date]) -> Priority:
    if start and rtype in LEAVE_TYPES:
        delta = (start - date.today()).days
        if delta <= 1:
            return Priority.URGENT
        if delta <= 3:
            return Priority.HIGH
    if rtype in (RequestType.PAYROLL_INCIDENT, RequestType.MEDICAL_LEAVE, RequestType.BANK_ACCOUNT_CHANGE):
        return Priority.HIGH
    if rtype in (RequestType.CERTIFICATE_EMPLOYMENT, RequestType.CERTIFICATE_SALARY):
        return Priority.LOW
    return Priority.NORMAL

