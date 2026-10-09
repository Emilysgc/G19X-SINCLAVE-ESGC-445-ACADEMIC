from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Notification, User
from app.services import notifications as svc

router = APIRouter()


@router.get("", summary="Mis notificaciones")
async def list_notifications(unread_only: bool = False, limit: int = Query(30, le=100), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(limit)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))
    items = [{"id": n.id, "type": n.type.value, "title": n.title, "message": n.message, "is_read": n.is_read,
              "request_id": n.related_request_id, "created_at": n.created_at.isoformat()} for n in (await db.execute(q)).scalars()]
    return {"unread": await svc.unread_count(db, user.id), "items": items}


@router.post("/{notification_id}/read", summary="Marcar como leída")
async def read_one(notification_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(update(Notification).where(Notification.id == notification_id, Notification.user_id == user.id).values(is_read=True))
    if not res.rowcount:
        raise HTTPException(404, "Notificación no encontrada")
    return {"ok": True}


@router.post("/read-all", summary="Marcar todas como leídas")
async def read_all(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await svc.mark_all_read(db, user.id)
    return {"ok": True}
