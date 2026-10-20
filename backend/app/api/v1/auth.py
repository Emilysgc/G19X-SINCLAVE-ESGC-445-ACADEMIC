"""Autenticación: asistente de primer uso, login local, Keycloak (OpenID Connect) y sesión."""
import hmac
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request as HttpRequest
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import client_ip, get_current_user
from app.api.serializers import user_public
from app.core.cache import cache, rate_limit
from app.core.config import get_settings
from app.core.database import get_db
from app.core.oidc import claims_to_identity, validate_oidc_token
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.models import AuditAction, Department, User, UserRole, UserStatus
from app.schemas.schemas import OidcLoginIn, LoginIn, PasswordChangeIn, SetupIn
from app.services.audit import audit
from app.services.utils import vacation_entitlement, years_of_service

router = APIRouter()
_DUMMY_HASH = hash_password("dummy-password-for-timing")
_oauth = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def _user_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(User))).scalar() or 0


def _session(user: User) -> dict:
    token, _, ttl = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"access_token": token, "token_type": "bearer", "expires_in": ttl, "user": user_public(user, full=True)}


@router.get("/config", summary="Configuración pública para el inicio de sesión")
async def public_config(db: AsyncSession = Depends(get_db)):
    s = get_settings()
    return {
        "company_name": s.COMPANY_NAME,
        "needs_setup": await _user_count(db) == 0,
        "setup_requires_token": bool(s.SETUP_TOKEN),
        "local_auth": s.local_auth_enabled,
        "oidc": {"enabled": True, "issuer": s.OIDC_ISSUER, "client_id": s.OIDC_CLIENT_ID, "provider_name": s.OIDC_PROVIDER_NAME} if s.oidc_enabled else {"enabled": False},
        "powerbi_report_url": s.POWERBI_REPORT_URL,
    }


@router.post("/setup", summary="Crea el primer administrador (solo si no hay usuarios)")
async def setup(body: SetupIn, request: HttpRequest, db: AsyncSession = Depends(get_db)):
    s = get_settings()
    await rate_limit(f"setup:{client_ip(request)}", 10, 300)
    if s.SETUP_TOKEN and not hmac.compare_digest(body.setup_token or "", s.SETUP_TOKEN):
        raise HTTPException(403, "Token de configuración inválido.")
    if not await cache.acquire_lock("setup:lock", 15):
        raise HTTPException(409, "Configuración en curso, intenta de nuevo.")
    if await _user_count(db) > 0:
        raise HTTPException(409, "El sistema ya fue configurado.")
    user = User(employee_id="EMP-0001", email=body.email.lower(), full_name=body.full_name.strip(), hashed_password=hash_password(body.password),
                role=UserRole.SYSTEM_ADMIN, job_title="Administrador del sistema", hire_date=None, vacation_balance=0, personal_leave_balance=6)
    db.add(user)
    await db.flush()
    audit(db, user.id, "System", "setup", AuditAction.CREATE, f"Primer administrador creado: {user.email}", ip=client_ip(request))
    return _session(user)


@router.post("/login", summary="Inicio de sesión con correo y contraseña")
async def login(body: LoginIn, request: HttpRequest, db: AsyncSession = Depends(get_db)):
    s = get_settings()
    if not s.local_auth_enabled:
        raise HTTPException(400, "El acceso con contraseña está deshabilitado; usa el inicio de sesión corporativo.")
    email = body.email.strip().lower()
    ip = client_ip(request)
    await rate_limit(f"login-ip:{ip}", 30, 60)
    await rate_limit(f"login-user:{email}", 8, 300)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    ok = verify_password(body.password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not ok:
        audit(db, None, "Auth", email, AuditAction.LOGIN, f"Intento fallido para {email}", ip=ip)
        await db.commit()
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    if not user.is_active or user.status != UserStatus.ACTIVE:
        raise HTTPException(403, "Cuenta inactiva o suspendida.")
    user.last_login = datetime.now(timezone.utc)
    audit(db, user.id, "Auth", user.id, AuditAction.LOGIN, f"Inicio de sesión de {user.email}", ip=ip)
    return _session(user)


@router.post("/oidc", summary="Intercambia un id_token de Keycloak por una sesión")
async def login_oidc(body: OidcLoginIn, request: HttpRequest, db: AsyncSession = Depends(get_db)):
    s = get_settings()
    ip = client_ip(request)
    await rate_limit(f"oidc-ip:{ip}", 30, 60)
    ident = claims_to_identity(await validate_oidc_token(body.id_token))
    user = None
    if ident["sub"]:
        user = (await db.execute(select(User).where(User.oidc_sub == ident["sub"]))).scalar_one_or_none()
    if not user:
        user = (await db.execute(select(User).where(User.email == ident["email"]))).scalar_one_or_none()
    if user:
        user.oidc_sub = user.oidc_sub or ident["sub"]
        if ident["role"]:  # los roles del realm de Keycloak son la fuente de verdad cuando existen
            user.role = UserRole(ident["role"])
    else:
        first = await _user_count(db) == 0 and not s.SETUP_TOKEN
        role = UserRole.SYSTEM_ADMIN if first else UserRole(ident["role"] or "EMPLOYEE")
        eid = f"SSO-{secrets.token_hex(5).upper()}"
        user = User(employee_id=eid, email=ident["email"], full_name=ident["name"], hashed_password=None,
                    auth_provider="oidc", oidc_sub=ident["sub"], role=role, vacation_balance=0)
        db.add(user)
        await db.flush()
        audit(db, user.id, "User", user.id, AuditAction.CREATE, f"Usuario aprovisionado desde Keycloak: {user.email}", ip=ip)
    if not user.is_active or user.status != UserStatus.ACTIVE:
        raise HTTPException(403, "Cuenta inactiva o suspendida.")
    user.last_login = datetime.now(timezone.utc)
    audit(db, user.id, "Auth", user.id, AuditAction.LOGIN, f"Inicio de sesión (Keycloak) de {user.email}", ip=ip)
    return _session(user)


@router.get("/me", summary="Perfil del usuario autenticado")
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    dept = await db.get(Department, user.department_id) if user.department_id else None
    sup = await db.get(User, user.direct_supervisor_id) if user.direct_supervisor_id else None
    return {**user_public(user, full=True), "department": dept.name if dept else None, "supervisor": sup.full_name if sup else None,
            "vacation_entitlement": vacation_entitlement(user.hire_date),
            "years_of_service": years_of_service(user.hire_date),
            "daily_wage": round((user.salary or 0) / 30.0, 2),
            "vacation_premium_estimated": round(((user.salary or 0) / 30.0) * vacation_entitlement(user.hire_date) * 0.25, 2),
            "continuous_days_requirement": 12}


@router.post("/logout", summary="Cierra la sesión (revoca el token)")
async def logout(request: HttpRequest, token: str = Depends(_oauth), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    payload = decode_access_token(token) or {}
    ttl = max(int(payload.get("exp", 0) - datetime.now(timezone.utc).timestamp()), 1)
    await cache.set_flag(f"revoked:{payload.get('jti')}", ttl)
    audit(db, user.id, "Auth", user.id, AuditAction.LOGOUT, f"Cierre de sesión de {user.email}", ip=client_ip(request))
    return {"message": "Sesión cerrada"}


@router.put("/password", summary="Cambiar contraseña (usuarios locales)")
async def change_password(body: PasswordChangeIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(400, "La contraseña actual es incorrecta.")
    user.hashed_password = hash_password(body.new_password)
    audit(db, user.id, "User", user.id, AuditAction.UPDATE, "Cambio de contraseña")
    return {"message": "Contraseña actualizada"}
