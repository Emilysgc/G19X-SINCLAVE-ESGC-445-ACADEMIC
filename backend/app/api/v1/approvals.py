"""Bandeja de aprobación."""
from fastapi import APIRouter, Depends, Request as HttpRequest
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import client_ip, get_current_user, require_roles
from app.api.serializers import request_out
from app.core.database import get_db
from app.models import ACTIVE_STATUSES, ApprovalStep, ApprovalWorkflow, Request, StepStatus, User, UserRole
from app.schemas.schemas import ApprovalIn
from app.services import workflow

router = APIRouter()
_approvers = require_roles(UserRole.MANAGER, UserRole.HR_ADMIN, UserRole.SYSTEM_ADMIN)


@router.get("/pending", summary="Solicitudes que requieren mi decisión")
async def pending(actor: User = Depends(_approvers), db: AsyncSession = Depends(get_db)):
    q = (select(ApprovalStep).join(ApprovalWorkflow, ApprovalStep.workflow_id == ApprovalWorkflow.id)
         .join(Request, ApprovalWorkflow.request_id == Request.id)
         .join(User, Request.requester_id == User.id)
         .where(ApprovalStep.status == StepStatus.PENDING, ApprovalStep.step_index == ApprovalWorkflow.current_step_index,
                Request.status.in_(ACTIVE_STATUSES), Request.requester_id != actor.id)
         .options(selectinload(ApprovalStep.workflow).selectinload(ApprovalWorkflow.request).selectinload(Request.requester),
                  selectinload(ApprovalStep.workflow).selectinload(ApprovalWorkflow.request).selectinload(Request.workflow).selectinload(ApprovalWorkflow.steps).selectinload(ApprovalStep.approver),
                  selectinload(ApprovalStep.workflow).selectinload(ApprovalWorkflow.request).selectinload(Request.workflow).selectinload(ApprovalWorkflow.steps).selectinload(ApprovalStep.acted_by))
         .order_by(Request.created_at))
    if actor.role != UserRole.SYSTEM_ADMIN:
        q = q.where(or_(
            ApprovalStep.approver_id == actor.id,
            and_(ApprovalStep.label == "Supervisor", User.direct_supervisor_id == actor.id),
            and_(ApprovalStep.approver_id.is_(None), ApprovalStep.approver_role == actor.role.value),
        ))
    items = []
    for step in (await db.execute(q)).scalars():
        r = step.workflow.request
        if not workflow._can_act(step, actor, r):
            continue
        items.append({**request_out(r, actor, detail=True), "step_label": step.label, "step_due_at": step.due_at.isoformat() if step.due_at else None,
                      "requester_balance": r.requester.vacation_balance})
    order = {"URGENT": 0, "HIGH": 1, "NORMAL": 2, "LOW": 3}
    items.sort(key=lambda x: (order.get(x["priority"], 2), x["created_at"]))
    return items


@router.post("/{request_id}/approve", summary="Aprobar")
async def approve(request_id: int, body: ApprovalIn, request: HttpRequest, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return request_out(await workflow.approve(db, request_id, actor, body.comments, client_ip(request)), actor, detail=True)


@router.post("/{request_id}/reject", summary="Rechazar (requiere motivo)")
async def reject(request_id: int, body: ApprovalIn, request: HttpRequest, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return request_out(await workflow.reject(db, request_id, actor, body.comments or "", client_ip(request)), actor, detail=True)
