"""Solicitudes de RRHH."""
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request as HttpRequest, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import HR_ROLES, client_ip, get_current_user
from app.api.serializers import request_out
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decrypt_value
from app.models import (
    ApprovalStep, ApprovalWorkflow, AuditAction, Department, Request, RequestStatus, RequestType, RequestTypeConfig, User, UserRole,
)
from app.schemas.schemas import RequestIn
from app.services import documents, workflow
from app.services.audit import audit

router = APIRouter()
_SIGNATURES = {".pdf": b"%PDF", ".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff"}


def _scope(q, actor: User):
    if actor.role in HR_ROLES:
        return q
    if actor.role == UserRole.MANAGER:
        team = select(User.id).where(User.direct_supervisor_id == actor.id)
        return q.where(or_(
            Request.requester_id == actor.id,
            and_(Request.requester_id.in_(team), Request.type != RequestType.CERTIFICATE_SALARY),
        ))
    return q.where(Request.requester_id == actor.id)


async def _load_visible(db: AsyncSession, request_id: int, actor: User) -> Request:
    req = (await db.execute(
        select(Request).options(selectinload(Request.requester),
                                selectinload(Request.workflow).selectinload(ApprovalWorkflow.steps).selectinload(ApprovalStep.approver),
                                selectinload(Request.workflow).selectinload(ApprovalWorkflow.steps).selectinload(ApprovalStep.acted_by))
        .where(Request.id == request_id))).scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Solicitud no encontrada")
    if req.type == RequestType.CERTIFICATE_SALARY and req.requester_id != actor.id and actor.role not in HR_ROLES:
        raise HTTPException(404, "Solicitud no encontrada")
    allowed = (req.requester_id == actor.id or actor.role in HR_ROLES
               or (actor.role == UserRole.MANAGER and req.requester.direct_supervisor_id == actor.id)
               or (req.workflow and any(s.approver_id == actor.id for s in req.workflow.steps)))
    if not allowed:
        raise HTTPException(404, "Solicitud no encontrada")  # 404 para no revelar su existencia
    return req


@router.get("/types", summary="Tipos de solicitud disponibles")
async def request_types(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(RequestTypeConfig).where(RequestTypeConfig.is_active.is_(True)).order_by(RequestTypeConfig.id))).scalars()
    return [{"type": c.type.value, "name": c.display_name, "description": c.description, "sla_hours": c.sla_hours,
             "requires_approval": c.requires_approval} for c in rows]


@router.get("", summary="Listar solicitudes (según el rol)")
async def list_requests(status: Optional[RequestStatus] = None, type: Optional[RequestType] = None, search: Optional[str] = Query(None, max_length=60),
                        limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
                        actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    base = _scope(select(Request), actor)
    if status:
        base = base.where(Request.status == status)
    if type:
        base = base.where(Request.type == type)
    if search:
        like = f"%{search.strip()}%"
        base = base.where(or_(Request.folio.ilike(like), Request.title.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.options(selectinload(Request.requester), selectinload(Request.workflow).selectinload(ApprovalWorkflow.steps))
                             .order_by(Request.created_at.desc()).limit(limit).offset(offset))).scalars()
    return {"total": total, "items": [request_out(r, actor) for r in rows]}


@router.post("", status_code=201, summary="Crear solicitud (validación automática + flujo)")
async def create_request(body: RequestIn, request: HttpRequest, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        req = await workflow.create_request(db, actor, body.type, body.title, body.description, body.start_date, body.end_date,
                                            body.request_data, client_ip(request))
    except workflow.RuleViolation as rv:
        v = rv.validation
        await db.rollback()
        return JSONResponse(status_code=422, content={"detail": "La solicitud incumple las políticas.", "errors": v.errors,
                                                      "warnings": v.warnings, "recommendations": v.recommendations})
    return request_out(req, actor, detail=True)


@router.get("/{request_id}", summary="Detalle de solicitud")
async def get_request(request_id: int, request: HttpRequest, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    req = await _load_visible(db, request_id, actor)
    out = request_out(req, actor, detail=True)
    enc = (req.request_data or {}).get("clabe_enc")
    if enc and actor.role in HR_ROLES and req.status in (RequestStatus.PENDING_APPROVAL, RequestStatus.IN_REVIEW):
        out["sensitive"] = {"clabe": decrypt_value(enc)}
        audit(db, actor.id, "Request", req.id, AuditAction.VIEW_SENSITIVE, f"Consulta de CLABE en {req.folio}", ip=client_ip(request))
    return out


@router.post("/{request_id}/cancel", summary="Cancelar solicitud")
async def cancel_request(request_id: int, request: HttpRequest, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    req = await workflow.cancel(db, request_id, actor, client_ip(request))
    return request_out(req, actor, detail=True)


async def _doc_owner(db: AsyncSession, request_id: int, actor: User) -> tuple[Request, User, Optional[str]]:
    req = await _load_visible(db, request_id, actor)
    if req.requester_id != actor.id and actor.role not in HR_ROLES:
        raise HTTPException(403, "Solo el solicitante y RRHH pueden descargar o visualizar las constancias.")
    if not req.generated_document_html:
        raise HTTPException(404, "Esta solicitud aún no tiene documento generado (requiere aprobación de RRHH).")
    owner = req.requester
    dept = await db.get(Department, owner.department_id) if owner.department_id else None
    return req, owner, dept.name if dept else None


@router.get("/{request_id}/document", summary="Constancia en HTML")
async def document_html(request_id: int, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    req, _, _ = await _doc_owner(db, request_id, actor)
    return HTMLResponse(req.generated_document_html, headers={"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"})


@router.get("/{request_id}/document.pdf", summary="Constancia en PDF")
async def document_pdf(request_id: int, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    req, owner, dept = await _doc_owner(db, request_id, actor)
    return Response(documents.render_pdf(req, owner, dept), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{req.folio}.pdf"'})


@router.post("/{request_id}/attachments", status_code=201, summary="Adjuntar comprobante (PDF/PNG/JPG)")
async def add_attachment(request_id: int, file: UploadFile = File(...), actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = get_settings()
    req = await _load_visible(db, request_id, actor)
    if req.requester_id != actor.id and actor.role not in HR_ROLES:
        raise HTTPException(403, "Solo el solicitante puede adjuntar archivos.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _SIGNATURES:
        raise HTTPException(400, "Formato no permitido. Usa PDF, PNG o JPG.")
    content = await file.read(s.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1)
    if len(content) > s.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, f"El archivo excede {s.MAX_UPLOAD_SIZE_MB} MB.")
    if not content.startswith(_SIGNATURES[ext]):
        raise HTTPException(400, "El contenido del archivo no coincide con su extensión.")
    if len(req.attached_files or []) >= 3:
        raise HTTPException(400, "Máximo 3 archivos por solicitud.")
    att_id = uuid.uuid4().hex
    folder = Path(s.UPLOAD_DIR) / req.folio
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{att_id}{ext}").write_bytes(content)
    req.attached_files = [*(req.attached_files or []), {"id": att_id, "name": Path(file.filename).name[:120], "size": len(content), "ext": ext}]
    flag_modified(req, "attached_files")
    audit(db, actor.id, "Request", req.id, AuditAction.UPDATE, f"Archivo adjunto en {req.folio}: {Path(file.filename).name[:80]}")
    return {"id": att_id, "name": Path(file.filename).name, "size": len(content)}


@router.get("/{request_id}/attachments/{att_id}", summary="Descargar adjunto")
async def get_attachment(request_id: int, att_id: str, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    req = await _load_visible(db, request_id, actor)
    if req.type == RequestType.MEDICAL_LEAVE and req.requester_id != actor.id and actor.role not in HR_ROLES:
        raise HTTPException(403, "Solo el solicitante y RRHH pueden descargar los comprobantes médicos.")
    att = next((a for a in (req.attached_files or []) if a["id"] == att_id), None)
    if not att:
        raise HTTPException(404, "Archivo no encontrado")
    path = Path(get_settings().UPLOAD_DIR) / req.folio / f"{att['id']}{att['ext']}"
    if not path.exists():
        raise HTTPException(404, "Archivo no disponible")
    return FileResponse(path, filename=att["name"])


