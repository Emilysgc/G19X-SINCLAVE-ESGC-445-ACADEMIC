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
    (RequestType.CERTIFICATE_SALARY, "Constancia de sueldo", "Requiere visto bueno de RRHH", True, 0, 24),
    (RequestType.ADDRESS_CHANGE, "Cambio de domicilio", "Actualización de datos de contacto", True, 0, 48),
    (RequestType.BANK_ACCOUNT_CHANGE, "Cambio de cuenta bancaria", "Cuenta para depósito de nómina (doble validación)", True, 0, 48),
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
     "El saldo de vacaciones se calcula conforme a la LFT: 2 días por cada 6 meses trabajados, acumulándose progresivamente. "
     "Al aprobarse una vacación, los días se descuentan automáticamente del saldo." + _NOTE,
     "vacaciones,descanso,saldo,dias,anticipacion,balances,disponible"),
    ("Vacaciones: calendario y restricciones", "Vacaciones",
     "No se aprueban vacaciones en días no laborables (sábados, domingos o días festivos). "
     "Si la solicitud abarca un periodo donde menos del 50% del equipo estaría presente, se genera una advertencia de cobertura para el aprobador. "
     "Las vacaciones no pueden iniciarse en una fecha pasada. En caso de fuerza mayor, RRHH puede autorizar excepciones." + _NOTE,
     "vacaciones,calendario,cobertura,equipo,festivos,restricciones"),

    # ── PERMISOS Y SALIDAS ANTICIPADAS ──
    ("Permisos personales", "Permisos",
     "Los permisos personales descuentan del saldo de permisos del año (6 días por defecto). "
     "Los permisos de 1 día hábil pueden aprobarse automáticamente por el sistema si el empleado tiene saldo disponible. "
     "Los permisos de 2 o más días requieren aprobación del supervisor directo. "
     "Los permisos personales no son acumulables con vacaciones ni con otros permisos en el mismo periodo." + _NOTE,
     "permiso,personal,ausencia,asuntos,saldo,disponible"),
    ("Salidas anticipadas y permisos por asuntos urgentes", "Permisos",
     "Si un empleado necesita salir temprano o ausentarse durante la jornada por un asunto urgente o imprevisto personal/familiar, "
     "debe dar aviso inmediato a su supervisor directo y registrar un 'Permiso personal' en la sección 'Nueva solicitud' indicando en la descripción "
     "la hora de salida y el motivo general (ej. urgencia familiar o trámite urgente). "
     "Si la ausencia es menor a media jornada (menos de 4 horas), el supervisor puede autorizar la reposición de horas en la misma semana sin descontar día completo; "
     "si abarca media jornada o el día completo, se descuenta del saldo de permisos personales." + _NOTE,
     "salir,temprano,salida,anticipada,urgente,urgencia,imprevisto,asunto,emergencia,pase,horas,permiso,personal"),
    ("Malestar o enfermedad durante la jornada laboral", "Permisos",
     "Si un empleado se enferma o se siente mal durante su horario de trabajo y necesita salir temprano o ausentarse, "
     "debe notificar de inmediato a su jefe directo y a RRHH para retirarse a valoración médica. "
     "Posteriormente (el mismo día o de forma retroactiva hasta 30 días), debe registrar un 'Permiso médico' desde 'Nueva solicitud' "
     "y adjuntar su comprobante de consulta médica, receta o incapacidad del IMSS. "
     "Por privacidad, el jefe directo solo verá el periodo de ausencia ('Ausente del X al Y') y únicamente RRHH revisará el motivo y el comprobante médico. "
     "Las salidas o ausencias médicas justificadas NO descuentan del saldo de vacaciones ni de permisos personales." + _NOTE,
     "enferme,enfermo,enfermedad,siento,mal,malestar,dolor,salud,salir,temprano,medico,consulta,incapacidad,cita,retirarme"),
    ("Permisos por motivos religiosos, culturales o compromisos importantes", "Permisos",
     "La empresa respeta la libertad de culto, diversidad religiosa y compromisos personales importantes de los colaboradores. "
     "Si surge una reunión religiosa, festividad de culto, ceremonia o compromiso personal relevante (ya sea de día completo o para salir temprano), "
     "el empleado puede solicitar un 'Permiso personal' desde 'Nueva solicitud' indicando en los comentarios que se trata de un compromiso religioso o personal. "
     "Si es de 1 día y cuenta con saldo de permisos personales disponible, el sistema puede aprobarlo automáticamente; "
     "si solo requiere salir unas horas antes, puede acordar con su supervisor directo la salida anticipada con reposición de horas o con cargo a su saldo de permisos personales." + _NOTE,
     "religion,religiosa,religioso,reunion,culto,iglesia,fe,celebracion,compromiso,importante,salir,temprano,permiso,personal"),
    ("Permisos médicos e incapacidades", "Permisos",
     "Las ausencias médicas de más de 2 días requieren comprobante médico adjunto (recibo, constancia o incapacidad). "
     "Pueden registrarse de forma retroactiva hasta 30 días naturales después de la fecha de inicio. "
     "Las ausencias médicas son revisadas únicamente por RRHH (la descripción médica y los adjuntos son confidenciales frente al supervisor) y se notifica al supervisor directo solo el rango de fechas. "
     "No descuentan del saldo de permisos personales. Si superan 30 días, se tramita como incapacidad ante el IMSS." + _NOTE,
     "medico,incapacidad,enfermedad,comprobante,salud,imss,retroactivo"),
    ("Licencias de maternidad y paternidad", "Permisos",
     "La licencia de maternidad es de 12 semanas (84 días naturales) conforme a la LFT. "
     "La licencia de paternidad es de 5 días laborables. Ambas requieren aprobación del supervisor y de RRHH. "
     "No descuentan de ningún saldo. Se requiere documento oficial (acta de nacimiento o constancia médica) para el trámite." + _NOTE,
     "maternidad,paternidad,licencia,nacimiento,adopcion,lft"),

    # ── CONSTANCIAS ──
    ("Constancias laborales y de sueldo", "Constancias",
     "La constancia laboral se emite automáticamente en PDF al enviar la solicitud. "
     "La constancia de sueldo requiere visto bueno de RRHH antes de su emisión e incluye firma del representante legal y copia congelada inmutable con los datos del expediente al momento de aprobarse. "
     "Por confidencialidad salarial, las constancias de sueldo solo son visibles para el empleado solicitante y RRHH (nunca para el supervisor)." + _NOTE,
     "constancia,laboral,sueldo,ingresos,carta,comprobante,antiguedad"),

    # ── EXPEDIENTE ──
    ("Cambios de datos personales y bancarios", "Expediente",
     "Los cambios de domicilio requieren validación de RRHH. "
     "Los cambios de cuenta bancaria exigen doble validación por dos aprobadores distintos de RRHH. "
     "La cuenta de depósito debe ser una CLABE interbancaria válida (18 dígitos con dígito verificador correcto) y estar a nombre del empleado. "
     "El cambio de domicilio debe incluir calle, número, colonia, alcaldía/municipio, C.P. y estado. "
     "Los cambios de cuenta bancaria surten efecto en la siguiente nómina después de la segunda validación." + _NOTE,
     "domicilio,direccion,cuenta,banco,clabe,deposito,expediente,contacto"),

    # ── NÓMINA ──
    ("Incidencias de nómina", "Nómina",
     "Las incidencias de nómina (pagos faltantes, descuentos indebidos, errores en percepciones) se reportan indicando el periodo afectado y se atienden en un máximo de 24 horas hábiles. "
     "Se requiere indicar el periodo de nómina específico (quincena o mes) y el concepto con la discrepancia. "
     "Requieren revisión del supervisor y de RRHH." + _NOTE,
     "nomina,pago,descuento,error,incidencia,sueldo,periodo,quincena"),

    # ── PROCESO ──
    ("Tiempos de respuesta (SLA)", "Proceso",
     "Cada aprobador tiene un tiempo límite por solicitud según el tipo: "
     "vacaciones 48 horas hábiles, permisos personales 24 horas, permisos médicos 24 horas, "
     "constancia laboral 1 hora (automático), constancia de sueldo 24 horas, cambios de datos 48 horas, incidencias de nómina 24 horas. "
     "Si se vence el SLA, se envía un recordatorio automático al aprobador. "
     "Si continúa sin atención después de 24 horas adicionales, la solicitud se escala automáticamente a RRHH." + _NOTE,
     "sla,tiempo,respuesta,escalamiento,aprobacion,vencimiento"),

    ("Flujo de aprobación multinivel", "Proceso",
     "Las solicitudes de vacaciones menores a 5 días requieren solo al supervisor directo; de 5 días o más requieren supervisor y RRHH. "
     "Las licencias de maternidad/paternidad e incidencias de nómina siempre requieren supervisor y RRHH. "
     "Los cambios de cuenta bancaria requieren doble aprobación por dos integrantes distintos de RRHH. "
     "Los permisos médicos, cambios de domicilio y constancias de sueldo requieren aprobación de RRHH. "
     "Si el supervisor de un empleado cambia mientras una solicitud está pendiente, el paso se reasigna automáticamente al nuevo supervisor." + _NOTE,
     "aprobacion,flujo,multinivel,supervisor,rrhh,jefe,cadena"),

    ("Roles y permisos del sistema", "Proceso",
     "EMPLOYEE: puede crear solicitudes, ver sus saldos, chatear con el asistente y descargar sus constancias. "
     "MANAGER: puede ver y aprobar/rechazar solicitudes de sus subordinados directos (sin acceso a constancias de sueldo ni a motivos/adjuntos médicos). "
     "HR_ADMIN: puede gestionar empleados (sin autoeditarse ni asignar roles administrativos), departamentos, políticas, ver reportes y aprobar solicitudes. "
     "SYSTEM_ADMIN: acceso total, asignación de roles HR_ADMIN/SYSTEM_ADMIN, configuración del sistema y gestión de integraciones. "
     "Todos los accesos se realizan mediante Keycloak (inicio de sesión corporativo)." + _NOTE,
     "roles,permisos,acceso,empleado,supervisor,rrhh,administrador"),
]


async def ensure_defaults(db: AsyncSession) -> None:
    existing_cfgs = {c.type: c for c in (await db.execute(select(RequestTypeConfig))).scalars()}
    for t, name, desc, appr, auto, sla in REQUEST_TYPES:
        if t not in existing_cfgs:
            db.add(RequestTypeConfig(type=t, display_name=name, description=desc, requires_approval=appr, auto_approve_days=auto, sla_hours=sla))
        elif t == RequestType.CERTIFICATE_SALARY and not existing_cfgs[t].requires_approval:
            existing_cfgs[t].requires_approval = True
            existing_cfgs[t].sla_hours = max(existing_cfgs[t].sla_hours, 24)
            existing_cfgs[t].description = desc

    existing_policies = {p.title: p for p in (await db.execute(select(HRPolicy))).scalars()}
    for title, cat, content, tags in POLICIES:
        if title not in existing_policies:
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
