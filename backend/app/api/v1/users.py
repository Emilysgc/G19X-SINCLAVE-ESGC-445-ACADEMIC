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
from app.models import AuditAction, CalendarNote, Department, User, UserRole, UserStatus
from app.schemas.schemas import CalendarNoteIn, DepartmentIn, ProfileUpdateIn, UserCreateIn, UserUpdateIn
from app.services.audit import audit
from app.services.keycloak import get_keycloak_service
from app.services.utils import vacation_entitlement

router = APIRouter()


from app.services import workflow

SUPERVISOR_ROLES = (UserRole.MANAGER, UserRole.HR_ADMIN, UserRole.SYSTEM_ADMIN)
PRIVILEGED_ROLES = (UserRole.HR_ADMIN, UserRole.SYSTEM_ADMIN)


async def _validate_supervisor(db: AsyncSession, sup_id: int | None, user_id: int | None = None) -> User | None:
    if sup_id is None:
        return None
    if user_id is not None and sup_id == user_id:
        raise HTTPException(400, "Un usuario no puede ser su propio supervisor.")
    sup = await db.get(User, sup_id)
    if not sup or not sup.is_active or sup.status != UserStatus.ACTIVE:
        raise HTTPException(400, "El supervisor seleccionado no existe o no está activo.")
    if sup.role not in SUPERVISOR_ROLES:
        raise HTTPException(400, "El supervisor debe tener rol de Supervisor (MANAGER), RRHH o Administrador.")
    visited: set[int] = {user_id} if user_id is not None else set()
    curr_id: int | None = sup.id
    while curr_id is not None:
        if curr_id in visited:
            raise HTTPException(400, "Asignación inválida: se detectó un ciclo en la jerarquía de supervisores.")
        visited.add(curr_id)
        curr_u = sup if curr_id == sup.id else await db.get(User, curr_id)
        curr_id = curr_u.direct_supervisor_id if curr_u else None
    return sup


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
    if body.manager_id is not None:
        await _validate_supervisor(db, body.manager_id)
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
    if body.manager_id is not None:
        await _validate_supervisor(db, body.manager_id)
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


@router.get("/directory", summary="Directorio mínimo (para elegir supervisores activos con rol válido)")
async def directory(actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(User.id, User.full_name, User.role)
        .where(User.is_active.is_(True), User.status == UserStatus.ACTIVE, User.role.in_(SUPERVISOR_ROLES))
        .order_by(User.full_name)
    )).all()
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
    if body.direct_supervisor_id is not None:
        await _validate_supervisor(db, body.direct_supervisor_id)
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
    if actor.role not in (UserRole.HR_ADMIN, UserRole.SYSTEM_ADMIN):
        raise HTTPException(403, "No tienes permisos para registrar usuarios.")
    if body.role in (UserRole.HR_ADMIN, UserRole.SYSTEM_ADMIN) and actor.role != UserRole.SYSTEM_ADMIN:
        raise HTTPException(403, "Solo el administrador del sistema puede crear o asignar roles de administración (HR_ADMIN o SYSTEM_ADMIN).")
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
            if role in PRIVILEGED_ROLES and actor.role != UserRole.SYSTEM_ADMIN:
                raise ValueError("solo el administrador del sistema (SYSTEM_ADMIN) puede asignar el rol HR_ADMIN o SYSTEM_ADMIN")
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
            try:
                await _validate_supervisor(db, sup.id, user_id=u.id)
                u.direct_supervisor_id = sup.id
            except HTTPException as exc:
                errors.append({"row": u.email, "error": exc.detail})
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
    if u.id == actor.id:
        raise HTTPException(403, "No puedes autoeditar tu propio expediente administrativo (usa /me/profile para tus datos de contacto).")
    changes = body.model_dump(exclude_unset=True)
    if (u.role in PRIVILEGED_ROLES or changes.get("role") in PRIVILEGED_ROLES) and actor.role != UserRole.SYSTEM_ADMIN:
        raise HTTPException(403, "Solo el administrador del sistema (SYSTEM_ADMIN) puede asignar el rol HR_ADMIN o modificar cuentas de RRHH/Administradores.")
    if changes.pop("new_password", None):
        raise HTTPException(400, "No se permite establecer una contraseña directamente. Utiliza el restablecimiento por enlace de Keycloak (/users/{id}/reset-password).")
    if "direct_supervisor_id" in changes:
        await _validate_supervisor(db, changes["direct_supervisor_id"], user_id=u.id)

    old_sup_id = u.direct_supervisor_id
    old_salary = u.salary

    for k, v in changes.items():
        setattr(u, k, v)
    if "status" in changes:
        u.is_active = u.status == UserStatus.ACTIVE

    await db.flush()
    if "direct_supervisor_id" in changes and u.direct_supervisor_id != old_sup_id:
        await workflow.reassign_supervisor_steps(db, u.id, u.direct_supervisor_id)

    audit_details = {k: (v.value if hasattr(v, "value") else str(v)) for k, v in changes.items()}
    if "salary" in changes:
        audit_details["salary_previous"] = str(old_salary)
        audit_details["salary_new"] = str(u.salary)
    desc = f"Usuario actualizado: {u.email}" + (f" (sueldo: {old_salary} -> {u.salary})" if "salary" in changes else "")
    audit(db, actor.id, "User", u.id, AuditAction.UPDATE, desc, audit_details, client_ip(request))
    return user_public(u, full=True)


@router.post("/{user_id}/reset-password", summary="Enviar enlace de restablecimiento de contraseña por Keycloak")
async def reset_user_password_keycloak(user_id: int, request: HttpRequest, actor: User = Depends(require_hr), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    if u.id == actor.id:
        raise HTTPException(400, "Usa la opción de perfil o Keycloak para gestionar tu propia contraseña.")
    if u.role in PRIVILEGED_ROLES and actor.role != UserRole.SYSTEM_ADMIN:
        raise HTTPException(403, "Solo el administrador del sistema puede solicitar el restablecimiento para cuentas HR_ADMIN o SYSTEM_ADMIN.")
    kc = get_keycloak_service()
    try:
        res = await kc.send_password_reset(u.email)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"No se pudo gestionar el restablecimiento en Keycloak: {exc}") from exc
    audit(db, actor.id, "User", u.id, AuditAction.UPDATE, f"Restablecimiento de contraseña por enlace de Keycloak solicitado para {u.email}", ip=client_ip(request))
    return {"ok": True, **res}


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
        if u.auth_provider == "oidc" or not u.hashed_password:
            raise HTTPException(403, "Tu cuenta usa inicio de sesión corporativo (SSO). No se permite crear ni establecer una contraseña local.")
        if not body.current_password:
            raise HTTPException(400, "Debes proporcionar tu contraseña actual para cambiarla.")
        if not verify_password(body.current_password, u.hashed_password):
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


_IMAGE_EXT_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


@router.post("/me/avatar", summary="Subir imagen de perfil")
async def upload_avatar(file: UploadFile = File(...), actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import os
    import uuid
    from pathlib import Path

    ext = Path(file.filename or "").suffix.lower()
    if ext not in _IMAGE_EXT_MAP:
        raise HTTPException(400, "Formato no permitido. Usa JPG, PNG, WEBP o GIF.")

    content = await file.read(2_097_153)
    if len(content) > 2_097_152:
        raise HTTPException(413, "La imagen no debe pesar más de 2 MB.")

    # Validar firma del archivo (número mágico) contra contenido real
    valid = False
    if ext in (".jpg", ".jpeg") and content.startswith(b"\xff\xd8\xff"):
        valid = True
        ext = ".jpg"
    elif ext == ".png" and (content.startswith(b"\x89PNG\r\n\x1a\n") or content.startswith(b"\x89PNG")):
        valid = True
    elif ext == ".webp" and content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP":
        valid = True
    elif ext == ".gif" and (content.startswith(b"GIF87a") or content.startswith(b"GIF89a")):
        valid = True

    if not valid:
        raise HTTPException(400, "El contenido del archivo no coincide con su extensión o está corrupto.")

    settings = get_settings()
    avatars_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    filename = f"avatar_{actor.id}_{uuid.uuid4().hex[:8]}{ext}"
    upload_path = os.path.join(avatars_dir, filename)
    with open(upload_path, "wb") as f:
        f.write(content)

    u = await db.get(User, actor.id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")

    avatar_url = f"/uploads/avatars/{filename}"
    u.avatar_url = avatar_url
    await db.flush()
    return {"avatar_url": avatar_url, "user": user_public(u, full=True)}





# ── Notas y Actividades de Calendario ───────────────────────────────────────
@router.get("/me/calendar-notes", summary="Listar notas y actividades de calendario del usuario")
async def list_calendar_notes(actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    notes = (
        await db.execute(
            select(CalendarNote)
            .where(CalendarNote.user_id == actor.id)
            .order_by(CalendarNote.date.desc(), CalendarNote.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": f"act_{n.id}",
            "note_db_id": n.id,
            "title": n.title,
            "start_date": str(n.date),
            "end_date": str(n.date),
            "type": n.type,
            "description": n.description or "",
            "isCustomActivity": True,
            "requester": {"full_name": actor.full_name},
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notes
    ]


@router.post("/me/calendar-notes", status_code=201, summary="Crear nota o actividad en calendario")
async def create_calendar_note(
    body: CalendarNoteIn,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = CalendarNote(
        user_id=actor.id,
        title=body.title.strip(),
        date=body.date,
        type=body.type.strip() if body.type else "Actividad",
        description=body.description.strip() if body.description else None,
    )
    db.add(note)
    await db.flush()
    return {
        "id": f"act_{note.id}",
        "note_db_id": note.id,
        "title": note.title,
        "start_date": str(note.date),
        "end_date": str(note.date),
        "type": note.type,
        "description": note.description or "",
        "isCustomActivity": True,
        "requester": {"full_name": actor.full_name},
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.put("/me/calendar-notes/{note_id}", summary="Actualizar nota o actividad de calendario")
async def update_calendar_note(
    note_id: str,
    body: CalendarNoteIn,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_id = note_id.replace("act_", "")
    try:
        numeric_id = int(raw_id)
    except ValueError:
        raise HTTPException(400, "ID de nota inválido")

    note = await db.get(CalendarNote, numeric_id)
    if not note or note.user_id != actor.id:
        raise HTTPException(404, "Nota o actividad no encontrada")

    note.title = body.title.strip()
    note.date = body.date
    note.type = body.type.strip() if body.type else "Actividad"
    note.description = body.description.strip() if body.description else None
    await db.flush()
    return {
        "id": f"act_{note.id}",
        "note_db_id": note.id,
        "title": note.title,
        "start_date": str(note.date),
        "end_date": str(note.date),
        "type": note.type,
        "description": note.description or "",
        "isCustomActivity": True,
        "requester": {"full_name": actor.full_name},
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.delete("/me/calendar-notes/{note_id}", summary="Eliminar nota o actividad de calendario")
async def delete_calendar_note(
    note_id: str,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_id = note_id.replace("act_", "")
    try:
        numeric_id = int(raw_id)
    except ValueError:
        raise HTTPException(400, "ID de nota inválido")

    note = await db.get(CalendarNote, numeric_id)
    if not note or note.user_id != actor.id:
        raise HTTPException(404, "Nota o actividad no encontrada")

    await db.delete(note)
    await db.flush()
    return {"ok": True}
