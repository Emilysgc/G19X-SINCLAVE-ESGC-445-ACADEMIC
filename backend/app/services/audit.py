from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditAction, AuditLog


def audit(db: AsyncSession, user_id: Optional[int], entity_type: str, entity_id: Any, action: AuditAction,
          description: str, details: Optional[dict] = None, ip: Optional[str] = None) -> None:
    db.add(AuditLog(user_id=user_id, entity_type=entity_type, entity_id=str(entity_id) if entity_id is not None else None,
                    action=action, description=description[:500], details=details, ip_address=ip))
