"""Dependencias comunes: usuario autenticado, control de acceso por rol y utilidades de petición."""
from typing import Optional

from fastapi import Depends, HTTPException, Request as HttpRequest, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import User, UserRole, UserStatus

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
HR_ROLES = (UserRole.HR_ADMIN, UserRole.SYSTEM_ADMIN)


def client_ip(request: HttpRequest) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada", headers={"WWW-Authenticate": "Bearer"})
    if not token:
        raise exc
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise exc
    if await cache.has_flag(f"revoked:{payload.get('jti')}"):
        raise exc
    user = (await db.execute(select(User).where(User.id == int(payload["sub"])))).scalar_one_or_none()
    if not user or not user.is_active or user.status != UserStatus.ACTIVE:
        raise exc
    return user


def require_roles(*roles: UserRole):
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permisos para esta acción")
        return user
    return _dep


require_hr = require_roles(*HR_ROLES)
