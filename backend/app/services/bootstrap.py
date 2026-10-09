"""Arranque: configuración base (NO datos de demostración) y primer administrador opcional.

Se crean solo parámetros que el sistema necesita para operar (tipos de solicitud con su SLA y una plantilla
inicial de políticas editable por RRHH). No se crean empleados, solicitudes ni saldos de ejemplo."""
import logging
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import AuditAction, HRPolicy, RequestType, RequestTypeConfig, User, UserRole
from app.services.audit import audit

logger = logging.getLogger("hr.bootstrap")

# (tipo, nombre, descripción, requiere_aprobación, auto_aprobar_hasta_días, sla_horas)
REQUEST_TYPES = [
    (RequestType.VACATION, "Vacaciones", "Solicitud de días de vacaciones", True, 0, 48),
    (RequestType.PERSONAL_LEAVE, "Permiso personal", "Ausencia por asuntos personales", True, 1, 24),
    (RequestType.MEDICAL_LEAVE, "Permiso médico", "Incapacidad o cita médica", True, 0, 24),
    (RequestType.MATERNITY_PATERNITY, "Maternidad / paternidad", "Licencia por nacimiento o adopción", True, 0, 72),
    (RequestType.CERTIFICATE_EMPLOYMENT, "Constancia laboral", "Se genera al instante", False, 0, 1),
    (RequestType.CERTIFICATE_SALARY, "Constancia de sueldo", "Se genera al instante", False, 0, 1),
    (RequestType.ADDRESS_CHANGE, "Cambio de domicilio", "Actualización de datos de contacto", True, 0, 48),
    (RequestType.BANK_ACCOUNT_CHANGE, "Cambio de cuenta bancaria", "Cuenta para depósito de nómina", True, 0, 48),
    (RequestType.PAYROLL_INCIDENT, "Incidencia de nómina", "Aclaraciones y correcciones de pago", True, 0, 24),
    (RequestType.OTHER, "Otra solicitud", "Cualquier otra gestión de RRHH", True, 0, 72),
]

_NOTE = " (Plantilla inicial: RRHH debe revisarla y ajustarla a la política real de la empresa.)"
POLICIES = [
    # ── VACACIONES ──
    ("Vacaciones: requisitos y saldo", "Vacaciones",
     "Las vacaciones se solicitan con al menos 3 días naturales de anticipación. No pueden exceder el saldo disponible del empleado. "
     "El máximo por solicitud es de 15 días hábiles consecutivos. Solo se cuentan días hábiles (lunes a viernes). "
     "Se valida que no se traslape con otras ausencias aprobadas y que el equipo conserve al menos 50% de cobertura. "
     "El saldo de vacaciones se calcula conforme a a la LFT: 2 días por cada 6 meses trabajados, acumulándose progresivamente. "
     "Al aprobarse una vacación, los días se descuentan automáticamente del saldo." + _NOTE,
     "vacaciones,descanso,saldo,dias,anticipacion,balances,disponible"),
    ("Vacaciones: calendario y restricciones", "Vacaciones",
     "No se aprueban vacaciones en días no laborables (sábados, domingos o días festivos). "
     "Si la solicitud abarca un periodo donde menos del 50% del equipo estaría presente, se genera una advertencia de cobertura para el aprobador. "
     "Las vacaciones no pueden iniciarse en una fecha pasada. En caso de fuerza mayor, RRHH puede autorizar excepciones." + _NOTE,
     "vacaciones,calendario,cobertura,equipo,festivos,restricciones"),
    
    # ── PERMISOS ──
    ("Permisos personales", "Permisos",
     "Los permisos personales descuentan del saldo de permisos del año (6 días por defecto). "
     "Los permisos de 1 día hábil pueden aprobarse automáticamente por el sistema si el empleado tiene saldo disponible. "
     "Los permisos de 2 o más días requieren aprobación del supervisor directo. "
     "Los permisos personales no son acumulables con vacaciones ni con otros permisos en el mismo periodo." + _NOTE,
     "permiso,personal,ausencia,asuntos,saldo,disponible"),
    ("Permisos médicos e incapacidades", "Permisos",
     "Las ausencias médicas de más de 2 días requieren comprobante médica (recibo, constancia o incapacidad). "
     "Pueden registrarse de forma retroactiva hasta 30 días naturales después de la fecha de inicio. "
     "Las ausencias médicas son revisadas por RRHH y se notifica al supervisor directo. "
     "No descuentan del saldo de permisos personales. Si superan 30 días, se tramita como incapacidad ante el IMSS." + _NOTE,
     "medico,incapacidad,enfermedad,comprobante,salud,imss,retroactivo"),
    ("Licencias de maternidad y paternidad", "Permisos",
     "La licencia de maternidad es de 12 semanas (84 días naturales) conforme a la LFT. "
     "La licencia de paternidad es de 5 días laborables. Ambas requieren aprobación del supervisor y de RRHH. "
     "No descuentan de ningún saldo. Se requiere documento oficial (acta de nacimiento o constancia médica) para el trámite." + _NOTE,
     "maternidad,paternidad,licencia,nacimiento,adopcion,lft"),
    
    # ── CONSTANCIAS ──
    ("Constancias laborales y de sueldo", "Constancias",
     "Las constancias laborales y de sueldo se emiten automáticamente en PDF al enviar la solicitud, "
     "con los datos vigentes del expediente (nombre, puesto, fecha de ingreso, antigüedad y sueldo). "
     "No requieren aprobación. La constancia de sueldo incluye el sueldo mensual bruto y la antigüedad. "
     "Si el empleado no tiene fecha de ingreso o sueldo registrado, RRHH debe completar el expediente antes de emitir la constancia." + _NOTE,
     "constancia,laboral,sueldo,ingresos,carta,comprobante,antiguedad"),
    
    # ── EXPEDIENTE ──
    ("Cambios de datos personales y bancarios", "Expediente",
     "Los cambios de domicilio y de cuenta bancaria requieren validación de RRHH. "
     "La cuenta de depósito debe ser una CLABE interbancaria válida (18 dígitos con dígito verificador correcto) y estar a nombre del empleado. "
     "El cambio de domicilio debe incluir calle, número, colonia, alcaldía/municipio, C.P. y estado. "
     "RRHH puede solicitar un comprobante de domicilio reciente (no mayor a 3 meses). "
     "Los cambios de cuenta bancaria surten efecto en la siguiente nómina después de la validación." + _NOTE,
     "domicilio,direccion,cuenta,banco,clabe,deposito,expediente,contacto"),
    
    # ── NÓMINA ──
    ("Incidencias de nómina", "Nómina",
     "Las incidencias de nómina (pagos faltantes, descuentos indebidos, errores en percepciones) se reportan indicando el periodo afectado y se atienden en un máximo de 24 horas hábiles. "
     "Se requiere indicar el periodo de nómina específico (quincena o mes) y el concepto con la discrepancia. "
     "Si la incidencia ya fue corregida en una nómina posterior, se indica en la descripción para cancelar el reporte." + _NOTE,
     "nomina,pago,descuento,error,incidencia,sueldo,periodo,quincena"),
    
    # ── PROCESO ──
    ("Tiempos de respuesta (SLA)", "Proceso",
     "Cada aprobador tiene un tiempo límite por solicitud según el tipo: "
     "vacaciones 48 horas hábiles, permisos personales 24 horas, permisos médicos 24 horas, "
     "constancias 1 hora (automático), cambios de datos 48 horas, incidencias de nómina 24 horas. "
     "Si se vence el SLA, se envía un recordatorio automático al aprobador. "
     "Si continúa sin atención después de 24 horas adicionales, la solicitud se escala automáticamente a RRHH." + _NOTE,
     "sla,tiempo,respuesta,escalamiento,aprobacion,vencimiento"),
    
    ("Flujo de aprobación multinivel", "Proceso",
     "Las solicitudes de vacaciones de 10 días o más requieren doble aprobación: primero el supervisor directo y luego RRHH. "
     "Las licencias de maternidad y paternidad siempre requieren supervisor y RRHH. "
     "Los permisos médicos, cambios de datos y incidencias de nómina requieren solo RRHH. "
     "El supervisor aprueba solo las solicitudes de sus subordinados directos. "
     "RRHH y el administrador del sistema pueden aprobar cualquier solicitud." + _NOTE,
     "aprobacion,flujo,multinivel,supervisor,rrhh,jefe,cadena"),
    
    ("Roles y permisos del sistema", "Proceso",
     "EMPLOYEE: puede crear solicitudes, ver sus saldos, chatear con el asistente y descargar sus constancias. "
     "MANAGER: puede ver y aprobar/rechazar solicitudes de sus subordinados directos. "
     "HR_ADMIN: puede gestionar empleados, departamentos, políticas, ver reportes y aprobar cualquier solicitud. "
     "SYSTEM_ADMIN: acceso total, configuración del sistema y gestión de integraciones. "
     "Todos los accesos se realizan mediante Keycloak (inicio de sesión corporativo)." + _NOTE,
     "roles,permisos,acceso,empleado,supervisor,rrhh,administrador"),
]


async def ensure_defaults(db: AsyncSession) -> None:
    existing = set((await db.execute(select(RequestTypeConfig.type))).scalars())
    for t, name, desc, appr, auto, sla in REQUEST_TYPES:
        if t not in existing:
            db.add(RequestTypeConfig(type=t, display_name=name, description=desc, requires_approval=appr, auto_approve_days=auto, sla_hours=sla))
    if (await db.execute(select(func.count()).select_from(HRPolicy))).scalar() == 0:
        for title, cat, content, tags in POLICIES:
            db.add(HRPolicy(title=title, category=cat, content=content, tags=tags))
    await db.flush()


async def ensure_first_admin(db: AsyncSession) -> None:
    s = get_settings()
    if not (s.FIRST_ADMIN_EMAIL and s.FIRST_ADMIN_PASSWORD):
        return
    if (await db.execute(select(func.count()).select_from(User))).scalar():
        return
    if len(s.FIRST_ADMIN_PASSWORD) < 10:
        logger.error("FIRST_ADMIN_PASSWORD debe tener al menos 10 caracteres; se omite la creación.")
        return
    u = User(employee_id="EMP-0001", email=s.FIRST_ADMIN_EMAIL.lower(), full_name=s.FIRST_ADMIN_NAME, hashed_password=hash_password(s.FIRST_ADMIN_PASSWORD),
             role=UserRole.SYSTEM_ADMIN, job_title="Administrador del sistema")
    db.add(u)
    await db.flush()
    audit(db, u.id, "System", "bootstrap", AuditAction.CREATE, f"Administrador inicial creado desde variables de entorno: {u.email}")
    logger.info("Administrador inicial creado: %s", u.email)


async def apply_powerbi_views(engine: AsyncEngine) -> None:
    """Crea/actualiza las vistas analíticas (solo PostgreSQL) y, opcionalmente, el rol de solo lectura."""
    s = get_settings()
    if not s.is_postgresql:
        return
    sql_path = Path(__file__).resolve().parents[2] / "sql" / "powerbi_views.sql"
    if not sql_path.exists():
        logger.warning("No se encontró %s", sql_path)
        return
    lines = [ln for ln in sql_path.read_text(encoding="utf-8").splitlines() if not ln.strip().startswith("--")]
    statements = [st.strip() for st in "\n".join(lines).split(";\n") if st.strip()]
    try:
        async with engine.begin() as conn:
            for st in statements:
                await conn.execute(text(st))
            if s.POWERBI_DB_PASSWORD:
                user = s.POWERBI_DB_USER
                exists = (await conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :u"), {"u": user})).scalar()
                verb = "ALTER" if exists else "CREATE"
                ddl = (await conn.execute(text(f"SELECT format('{verb} ROLE %I LOGIN PASSWORD %L', CAST(:u AS text), CAST(:p AS text))"),
                                          {"u": user, "p": s.POWERBI_DB_PASSWORD})).scalar()
                await conn.exec_driver_sql(ddl)
                views = (await conn.execute(text("SELECT format('%I', viewname) FROM pg_views WHERE schemaname='public' AND (viewname LIKE 'vw\\_%' OR viewname LIKE 'dim\\_%')"))).scalars().all()
                db_name = (await conn.execute(text("SELECT current_database()"))).scalar()
                await conn.exec_driver_sql(f'GRANT CONNECT ON DATABASE "{db_name}" TO "{user}"')
                await conn.exec_driver_sql(f'GRANT USAGE ON SCHEMA public TO "{user}"')
                for v in views:
                    await conn.exec_driver_sql(f'GRANT SELECT ON {v} TO "{user}"')
                logger.info("Rol de solo lectura '%s' listo para Power BI (%d vistas).", user, len(views))
        logger.info("Vistas analíticas para Power BI actualizadas.")
    except Exception as exc:  # noqa: BLE001
        logger.warning("No se pudieron aplicar las vistas de Power BI: %s", exc)
