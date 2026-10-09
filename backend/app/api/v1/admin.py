"""Administración: tipos de solicitud, políticas, auditoría, SLA y estado del sistema."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_hr
from app.core.cache import cache, rate_limit
from app.core.config import get_settings
from app.core.database import get_db
from app.models import AuditAction, AuditLog, HRPolicy, RequestType, RequestTypeConfig, User
from app.schemas.schemas import PolicyIn, RequestTypeConfigIn
from app.services.ai_agent import get_agent
from app.services.audit import audit
from app.services.integrations import check_all
from app.services.sla import run_sla_cycle

router = APIRouter()


def _policy(p: HRPolicy) -> dict:
    return {"id": p.id, "title": p.title, "category": p.category, "content": p.content, "tags": p.tags, "version": p.version,
            "is_active": p.is_active, "updated_at": p.updated_at.isoformat() if p.updated_at else None}


# ── Políticas ─────────────────────────────────────────────────────────────
@router.get("/policies", summary="Políticas de RRHH")
async def list_policies(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return [_policy(p) for p in (await db.execute(select(HRPolicy).order_by(HRPolicy.category, HRPolicy.title))).scalars()]


@router.post("/policies", status_code=201, summary="Crear política")
async def create_policy(body: PolicyIn, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    p = HRPolicy(**body.model_dump(), updated_by_id=actor.id)
    db.add(p)
    await db.flush()
    audit(db, actor.id, "HRPolicy", p.id, AuditAction.CREATE, f"Política creada: {p.title}")
    return _policy(p)


@router.put("/policies/{policy_id}", summary="Actualizar política")
async def update_policy(policy_id: int, body: PolicyIn, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    p = await db.get(HRPolicy, policy_id)
    if not p:
        raise HTTPException(404, "Política no encontrada")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    p.updated_by_id = actor.id
    audit(db, actor.id, "HRPolicy", p.id, AuditAction.UPDATE, f"Política actualizada: {p.title}")
    return _policy(p)


@router.delete("/policies/{policy_id}", summary="Eliminar política")
async def delete_policy(policy_id: int, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    p = await db.get(HRPolicy, policy_id)
    if not p:
        raise HTTPException(404, "Política no encontrada")
    audit(db, actor.id, "HRPolicy", p.id, AuditAction.DELETE, f"Política eliminada: {p.title}")
    await db.delete(p)
    return {"ok": True}


# ── Tipos de solicitud ────────────────────────────────────────────────────
@router.get("/request-types", summary="Configuración de tipos de solicitud")
async def list_type_configs(_: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    return [{"type": c.type.value, "name": c.display_name, "description": c.description, "requires_approval": c.requires_approval,
             "auto_approve_days": c.auto_approve_days, "sla_hours": c.sla_hours, "is_active": c.is_active}
            for c in (await db.execute(select(RequestTypeConfig).order_by(RequestTypeConfig.id))).scalars()]


@router.patch("/request-types/{rtype}", summary="Ajustar SLA, auto-aprobación o habilitación")
async def update_type_config(rtype: RequestType, body: RequestTypeConfigIn, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(RequestTypeConfig).where(RequestTypeConfig.type == rtype))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Tipo no encontrado")
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(c, k, v)
    audit(db, actor.id, "RequestTypeConfig", rtype.value, AuditAction.UPDATE, f"Configuración de {c.display_name} actualizada", changes)
    return {"type": c.type.value, "requires_approval": c.requires_approval, "auto_approve_days": c.auto_approve_days, "sla_hours": c.sla_hours, "is_active": c.is_active}


# ── Auditoría ─────────────────────────────────────────────────────────────
@router.get("/audit", summary="Bitácora de auditoría")
async def audit_log(entity_type: Optional[str] = None, action: Optional[AuditAction] = None, user_id: Optional[int] = None,
                    limit: int = Query(50, le=200), offset: int = 0, _: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    q = select(AuditLog, User.full_name).join(User, User.id == AuditLog.user_id, isouter=True).order_by(AuditLog.timestamp.desc())
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if action:
        q = q.where(AuditLog.action == action)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    total = (await db.execute(select(func.count()).select_from(q.order_by(None).subquery()))).scalar() or 0
    rows = (await db.execute(q.limit(limit).offset(offset))).all()
    return {"total": total, "items": [{"id": a.id, "timestamp": a.timestamp.isoformat(), "user": name or "Sistema", "entity_type": a.entity_type,
                                       "entity_id": a.entity_id, "action": a.action.value, "description": a.description, "ip": a.ip_address}
                                      for a, name in rows]}


# ── Operación ─────────────────────────────────────────────────────────────
@router.post("/sla/run", summary="Ejecutar ahora el agente de SLA")
async def sla_run(_: User = Depends(require_hr)):
    return await run_sla_cycle()


@router.post("/integrations/check", summary="Probar de verdad cada integración (IA, Keycloak, Power BI, Redis…)")
async def integrations_check(actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    await rate_limit(f"int-check:{actor.id}", 10, 60)
    return await check_all(db)


@router.get("/system", summary="Estado de los componentes")
async def system_status(_: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    s = get_settings()
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:  # noqa: BLE001
        db_ok = False
    a = get_agent()
    return {"version": s.APP_VERSION, "environment": s.ENVIRONMENT,
            "database": {"ok": db_ok, "engine": "postgresql" if s.is_postgresql else "sqlite"},
            "redis": {"backend": cache.backend}, "ai": {"mode": "llm" if a.is_ai_enabled else "rules_engine", "providers": [p.name for p in a.providers], "last_provider": a.last_provider},
            "auth": {"local": s.local_auth_enabled, "oidc": s.oidc_enabled, "provider": s.OIDC_PROVIDER_NAME},
            "notifications": {"email": bool(s.SMTP_HOST), "teams": bool(s.TEAMS_WEBHOOK_URL)},
            "powerbi": {"report_configured": bool(s.POWERBI_REPORT_URL), "readonly_role": s.POWERBI_DB_USER if s.POWERBI_DB_PASSWORD else None},
            "sla_scheduler": s.SLA_SCHEDULER_ENABLED}
