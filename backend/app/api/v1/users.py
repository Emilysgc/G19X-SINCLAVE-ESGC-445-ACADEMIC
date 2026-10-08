"""Usuarios y departamentos."""
import csv
import io
from datetime import date

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request as HttpRequest, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import HR_ROLES, client_ip, get_current_user, require_hr
from app.api.serializers import user_public
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.models import AuditAction, Department, User, UserRole, UserStatus
from app.schemas.schemas import DepartmentIn, ProfileUpdateIn, UserCreateIn, UserUpdateIn
from app.services.audit import audit
from app.services.keycloak import get_keycloak_service
from app.services.utils import vacation_entitlement

router = APIRouter()


def _dept(d: Department) -> dict:
    return {"id": d.id, "name": d.name, "code": d.code, "description": d.description, "manager_id": d.manager_id, "is_active": d.is_active}


# ── Departamentos ─────────────────────────────────────────────────────────
@router.get("/departments", summary="Listar departamentos")
async def list_departments(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return [_dept(d) for d in (await db.execute(select(Department).order_by(Department.name))).scalars()]


@router.post("/departments", status_code=201, summary="Crear departamento")
async def create_department(body: DepartmentIn, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(Department).where(or_(Department.name == body.name, Department.code == body.code.upper())))).scalar_one_or_none():
        raise HTTPException(409, "Ya existe un departamento con ese nombre o código.")
    d = Department(name=body.name.strip(), code=body.code.strip().upper(), description=body.description, manager_id=body.manager_id)
    db.add(d)
    await db.flush()
    audit(db, actor.id, "Department", d.id, AuditAction.CREATE, f"Departamento creado: {d.name}")
    return _dept(d)


@router.put("/departments/{dept_id}", summary="Actualizar departamento")
async def update_department(dept_id: int, body: DepartmentIn, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    d = await db.get(Department, dept_id)
    if not d:
        raise HTTPException(404, "Departamento no encontrado")
    d.name, d.code, d.description, d.manager_id, d.is_active = body.name.strip(), body.code.strip().upper(), body.description, body.manager_id, body.is_active
    audit(db, actor.id, "Department", d.id, AuditAction.UPDATE, f"Departamento actualizado: {d.name}")
    return _dept(d)


# ── Usuarios ──────────────────────────────────────────────────────────────
@router.get("", summary="Listar usuarios")
async def list_users(search: str | None = Query(None, max_length=80), role: UserRole | None = None, limit: int = Query(100, le=500), offset: int = 0,
                     actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(User).order_by(User.full_name).limit(limit).offset(offset)
    if actor.role not in HR_ROLES:
        if actor.role != UserRole.MANAGER:
            raise HTTPException(403, "No tienes permisos para listar usuarios.")
        q = q.where(User.direct_supervisor_id == actor.id)
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(User.full_name.ilike(like), User.email.ilike(like), User.employee_id.ilike(like)))
    if role:
        q = q.where(User.role == role)
    return [user_public(u, full=actor.role in HR_ROLES) for u in (await db.execute(q)).scalars()]


@router.get("/directory", summary="Directorio mínimo (para elegir supervisores)")
async def directory(actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(User.id, User.full_name, User.role).where(User.is_active.is_(True)).order_by(User.full_name))).all()
    return [{"id": r.id, "full_name": r.full_name, "role": r.role.value} for r in rows]


async def _next_employee_id(db: AsyncSession) -> str:
    n = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    while True:
        n += 1
        eid = f"EMP-{n:04d}"
        if not (await db.execute(select(User.id).where(User.employee_id == eid))).scalar_one_or_none():
            return eid


async def _create_user(db: AsyncSession, body: UserCreateIn) -> User:
    email = body.email.lower()
    if (await db.execute(select(User.id).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(409, f"Ya existe un usuario con el correo {email}.")
    eid = body.employee_id or await _next_employee_id(db)
    if (await db.execute(select(User.id).where(User.employee_id == eid))).scalar_one_or_none():
        raise HTTPException(409, f"El número de empleado {eid} ya existe.")
    u = User(employee_id=eid, email=email, full_name=body.full_name.strip(), role=body.role, department_id=body.department_id, job_title=body.job_title,
             direct_supervisor_id=body.direct_supervisor_id, hire_date=body.hire_date, phone=body.phone, salary=body.salary,
             hashed_password=hash_password(body.password) if body.password else None, auth_provider="local" if body.password else "oidc",
             vacation_balance=body.vacation_balance if body.vacation_balance is not None else vacation_entitlement(body.hire_date),
             personal_leave_balance=body.personal_leave_balance if body.personal_leave_balance is not None else 6.0)
    db.add(u)
    await db.flush()
    return u


@router.post("", status_code=201, summary="Crear usuario")
async def create_user(body: UserCreateIn, request: HttpRequest, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if actor.role != UserRole.SYSTEM_ADMIN:
        raise HTTPException(403, "Solo el administrador del sistema (con acceso total) puede registrar nuevos usuarios.")
    # Crear el usuario en Keycloak primero (si hay contraseña o siempre para OIDC)
    kc = get_keycloak_service()
    try:
        await kc.create_user(
            email=body.email,
            full_name=body.full_name,
            role=body.role.value,
            password=body.password,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Error al crear el usuario en Keycloak: {exc}") from exc
    # Crear el perfil en la base de datos local
    u = await _create_user(db, body)
    u.auth_provider = "oidc" if not body.password else "local"
    audit(db, actor.id, "User", u.id, AuditAction.CREATE, f"Usuario creado: {u.email} ({body.role.value})", ip=client_ip(request))
    return user_public(u, full=True)


@router.post("/import", summary="Importación masiva desde CSV")
async def import_users(file: UploadFile = File(...), actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    """Columnas: email, full_name, role, department_code, job_title, hire_date (AAAA-MM-DD), supervisor_email, salary, password (opcional)."""
    raw = (await file.read(1_000_001))
    if len(raw) > 1_000_000:
        raise HTTPException(413, "El archivo excede 1 MB.")
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    depts = {d.code: d.id for d in (await db.execute(select(Department))).scalars()}
    created, errors = 0, []
    pending_sup: list[tuple[User, str]] = []
    for i, row in enumerate(rows, start=2):
        try:
            role = UserRole((row.get("role") or "EMPLOYEE").strip().upper())
            if role == UserRole.SYSTEM_ADMIN and actor.role != UserRole.SYSTEM_ADMIN:
                raise ValueError("solo un administrador del sistema puede crear administradores")
            code = (row.get("department_code") or "").strip().upper()
            if code and code not in depts:
                raise ValueError(f"departamento '{code}' no existe")
            pwd = (row.get("password") or "").strip() or None
            body = UserCreateIn(email=row["email"].strip(), full_name=row["full_name"].strip(), role=role, department_id=depts.get(code),
                                job_title=(row.get("job_title") or None), password=pwd,
                                hire_date=date.fromisoformat(row["hire_date"].strip()) if (row.get("hire_date") or "").strip() else None,
                                salary=float(row["salary"]) if (row.get("salary") or "").strip() else None)
            async with db.begin_nested():
                u = await _create_user(db, body)
            created += 1
            if (row.get("supervisor_email") or "").strip():
                pending_sup.append((u, row["supervisor_email"].strip().lower()))
        except Exception as exc:  # noqa: BLE001
            errors.append({"row": i, "error": str(getattr(exc, "detail", exc))})
    for u, sup_email in pending_sup:
        sup = (await db.execute(select(User).where(User.email == sup_email))).scalar_one_or_none()
        if sup:
            u.direct_supervisor_id = sup.id
        else:
            errors.append({"row": u.email, "error": f"supervisor '{sup_email}' no encontrado"})
    audit(db, actor.id, "User", "import", AuditAction.CREATE, f"Importación CSV: {created} creados, {len(errors)} errores")
    return {"created": created, "errors": errors}


@router.get("/{user_id}", summary="Detalle de usuario")
async def get_user(user_id: int, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    return user_public(u, full=True)


@router.patch("/{user_id}", summary="Actualizar usuario")
async def update_user(user_id: int, body: UserUpdateIn, request: HttpRequest, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    changes = body.model_dump(exclude_unset=True)
    if (u.role == UserRole.SYSTEM_ADMIN or changes.get("role") == UserRole.SYSTEM_ADMIN) and actor.role != UserRole.SYSTEM_ADMIN:
        raise HTTPException(403, "Solo un administrador del sistema puede modificar administradores.")
    if u.id == actor.id and (changes.get("role") not in (None, u.role) or changes.get("status") not in (None, u.status)):
        raise HTTPException(400, "No puedes cambiar tu propio rol o estado.")
    if changes.get("direct_supervisor_id") == u.id:
        raise HTTPException(400, "Un usuario no puede ser su propio supervisor.")
    new_pwd = changes.pop("new_password", None)
    if new_pwd:
        u.hashed_password = hash_password(new_pwd)
        if u.auth_provider == "oidc":
            u.auth_provider = "local"
    for k, v in changes.items():
        setattr(u, k, v)
    if "status" in changes:
        u.is_active = u.status == UserStatus.ACTIVE
    audit(db, actor.id, "User", u.id, AuditAction.UPDATE, f"Usuario actualizado: {u.email}",
          {k: (v.value if hasattr(v, "value") else str(v)) for k, v in changes.items() if k != "salary"}, client_ip(request))
    return user_public(u, full=True)


@router.get("/me/team", summary="Mi equipo (subordinados directos)")
async def my_team(actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(User).where(User.direct_supervisor_id == actor.id, User.is_active.is_(True)).order_by(User.full_name))).scalars()
    return [user_public(u) for u in rows]


@router.patch("/me/profile", summary="Actualizar mi propio perfil y contraseña")
async def update_my_profile(body: ProfileUpdateIn, request: HttpRequest, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, actor.id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    
    # Si desea cambiar la contraseña
    if body.new_password:
        # Si tiene contraseña local, validar contraseña actual
        if u.hashed_password and not body.current_password:
            raise HTTPException(400, "Debes proporcionar tu contraseña actual para cambiarla.")
        if u.hashed_password and body.current_password and not verify_password(body.current_password, u.hashed_password):
            raise HTTPException(400, "La contraseña actual es incorrecta.")
        
        u.hashed_password = hash_password(body.new_password)
        # Sincronizar con Keycloak si existe
        kc = get_keycloak_service()
        try:
            await kc.reset_password(u.email, body.new_password)
        except Exception:
            pass  # Si falla Keycloak en dev, la contraseña local queda actualizada

    if body.full_name:
        u.full_name = body.full_name.strip()
        kc = get_keycloak_service()
        try:
            await kc.update_user(u.email, full_name=u.full_name)
        except Exception:
            pass

    if body.phone is not None:
        u.phone = body.phone.strip() if body.phone else None
    if body.address is not None:
        u.address = body.address.strip() if body.address else None

    audit(db, u.id, "User", u.id, AuditAction.UPDATE, f"Perfil actualizado por el usuario: {u.email}", ip=client_ip(request))
    return user_public(u, full=True)


@router.post("/me/avatar", summary="Subir imagen de perfil")
async def upload_avatar(file: UploadFile = File(...), actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(400, "Formato no válido. Usa JPG, PNG, WEBP o GIF.")
    
    content = await file.read(2_097_153)
    if len(content) > 2_097_152:
        raise HTTPException(413, "La imagen no debe pesar más de 2 MB.")
    
    import os
    import uuid
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    filename = f"avatar_{actor.id}_{uuid.uuid4().hex[:8]}{ext}"
    settings = get_settings()
    upload_path = os.path.join(settings.UPLOAD_DIR, filename)
    with open(upload_path, "wb") as f:
        f.write(content)
    
    u = await db.get(User, actor.id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    
    avatar_url = f"/uploads/{filename}"
    u.avatar_url = avatar_url
    await db.flush()
    return {"avatar_url": avatar_url, "user": user_public(u, full=True)}



