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

POLICIES = [
    # ── VACACIONES ──
    ("Vacaciones: requisitos y saldo", "Vacaciones",
     "En PluriOne S.A. de C.V. las vacaciones se solicitan con al menos 3 días naturales de anticipación y no pueden exceder el saldo disponible del colaborador. "
     "El máximo por solicitud es de 15 días hábiles consecutivos (solo se cuentan días hábiles de lunes a viernes). "
     "Se valida que no exista traslape con otras ausencias aprobadas y que el equipo conserve al menos el 50% de cobertura operativa. "
     "El derecho anual se calcula conforme a la LFT (12 días el primer año y +2 días por cada año subsecuente hasta llegar a 20, luego +2 cada 5 años). "
     "Al aprobarse la solicitud, los días se descuentan automáticamente del saldo.",
     "vacaciones,descanso,saldo,dias,anticipacion,balances,disponible"),
    ("Vacaciones: calendario y restricciones", "Vacaciones",
     "En PluriOne S.A. de C.V. no se descuentan días inhábiles (sábados, domingos ni días festivos oficiales). "
     "Si una solicitud abarca un periodo donde menos del 50% del equipo estaría activo, el sistema genera una alerta de cobertura para el supervisor. "
     "Las vacaciones no pueden registrarse con fecha de inicio en el pasado; ante situaciones de fuerza mayor, RRHH puede autorizar excepciones.",
     "vacaciones,calendario,cobertura,equipo,festivos,restricciones"),
    ("Vacaciones y calendario de lanzamientos", "Vacaciones",
     "En PluriOne S.A. de C.V. las vacaciones se coordinan con el calendario de lanzamientos y entregas del equipo. "
     "Se evitan durante la semana de release o despliegue a producción. Antes de ausentarse, el colaborador debe dejar documentado su trabajo en curso "
     "y un compañero de respaldo asignado. Los periodos largos (5 días hábiles o más) se solicitan con al menos 15 días naturales de anticipación.",
     "vacaciones,lanzamiento,lanzamientos,release,entrega,entregas,sprint,respaldo,cobertura,cierre,congelamiento,temporada"),

    # ── JORNADA ──
    ("Trabajo remoto e híbrido", "Jornada",
     "En PluriOne S.A. de C.V. los puestos de desarrollo y tecnología pueden trabajar de 2 a 3 días remotos por semana, previo acuerdo con su líder directo. "
     "El esquema híbrido/remoto consta por escrito en el expediente e incluye el domicilio declarado de trabajo, el equipo asignado y el apoyo mensual de teletrabajo "
     "por consumo de energía eléctrica e internet conforme al tabulador vigente de RRHH ($650 MXN mensuales). "
     "El colaborador puede solicitar volver a modalidad presencial en cualquier momento. Durante los días remotos debe mantenerse localizable en el horario base "
     "de 10:00 a 16:00 horas y asistir puntualmente a las ceremonias y reuniones del equipo.",
     "remoto,remota,home,office,casa,teletrabajo,hibrido,oficina,presencial,trabajar,internet,luz"),
    ("Horario flexible y desconexión digital", "Jornada",
     "En PluriOne S.A. de C.V. la jornada laboral es de 8 horas diarias con ventana de entrada flexible entre las 8:00 y las 10:00 horas. "
     "Fuera de la jornada laboral se respeta el derecho a la desconexión digital: no se espera respuesta a mensajes ni correos electrónicos, salvo que el colaborador "
     "tenga guardia (on-call) asignada. No se programan reuniones fuera del horario base (10:00 a 16:00 h) y los líderes no envían mensajes de trabajo en fin de semana salvo incidentes críticos.",
     "horario,flexible,entrada,jornada,desconexion,mensajes,correo,reuniones,fines,semana,disponibilidad,descanso"),
    ("Guardias (on-call) e incidentes fuera de horario", "Jornada",
     "En PluriOne S.A. de C.V. las guardias técnicas se asignan por rotación con al menos 1 semana de aviso previo y un máximo de 1 de cada 4 semanas por persona. "
     "Quien está de guardia atiende alertas críticas dentro de los primeros 15 minutos. La guardia se compensa con bono de disponibilidad en nómina o día de descanso compensatorio "
     "acordado con el líder. Tras atender un incidente nocturno de más de 2 horas, el colaborador tiene derecho a iniciar su jornada más tarde al día siguiente para descansar, "
     "dando aviso a su líder sin necesidad de trámite adicional.",
     "guardia,guardias,incidente,incidentes,produccion,alerta,alertas,rotacion,nocturno,soporte,oncall,disponible"),
    ("Horas extra y tiempo compensatorio", "Jornada",
     "En PluriOne S.A. de C.V. el tiempo extra requiere autorización previa por escrito del líder directo y se registra en el sistema. "
     "Se paga conforme a los límites y porcentajes de la Ley Federal del Trabajo (LFT) o se canjea por tiempo compensatorio hora por hora previo acuerdo con RRHH. "
     "No se acumulan horas extra sin autorización previa. En cierres de proyecto o sprints, el líder debe priorizar y ajustar el alcance antes que alargar las jornadas.",
     "extra,horas,tiempo,compensatorio,sobretiempo,autorizacion,cierre,entrega,lanzamiento,trasnochar,pago"),

    # ── PERMISOS Y SOLUCIONES DE SALIDA ANTICIPADA ──
    ("Permisos personales", "Permisos",
     "En PluriOne S.A. de C.V. cada colaborador cuenta con 6 días anuales de permisos personales con goce de sueldo. "
     "Los permisos de 1 día hábil se aprueban automáticamente si el colaborador tiene saldo disponible y sin alertas de cobertura. "
     "Los permisos de 2 o más días requieren aprobación del supervisor directo. "
     "No son acumulables entre años ni combinables de forma consecutiva con periodos vacacionales.",
     "permiso,personal,ausencia,asuntos,saldo,disponible"),
    ("Salidas anticipadas y permisos por asuntos urgentes", "Permisos",
     "En PluriOne S.A. de C.V., si necesitas salir temprano o ausentarse de emergencia (ej. familiar en el hospital, urgencia doméstica o trámite impostergable), "
     "tienes 3 opciones de solución según el tiempo que requieras: "
     "1) Salida menor a 4 horas (pase de salida): avisa por mensaje directo a tu supervisor y acuerda reponer las horas durante la misma semana (usando la flexibilidad de horario de 8:00 a 10:00 h) para no descontar de tu saldo. "
     "2) Ausencia de media jornada o día completo: entra a 'Nueva solicitud' → 'Permiso personal', selecciona el día de hoy e indica en comentarios la urgencia; si es de 1 día y tienes saldo disponible, se aprueba de inmediato. "
     "3) Si la urgencia es de salud propia o requiere atención médica, regístralo como 'Permiso médico' para que no descuente de tus días personales.",
     "salir,temprano,salida,anticipada,urgente,urgencia,imprevisto,asunto,emergencia,hospital,familiar,pase,horas,permiso,personal"),
    ("Malestar o enfermedad durante la jornada laboral", "Permisos",
     "En PluriOne S.A. de C.V., si te enfermas o te sientes mal durante tu jornada laboral y necesitas salir temprano: "
     "1) Avisa de inmediato a tu supervisor directo y a RRHH para retirarte a consulta médica o descansar. "
     "2) Registra en 'Nueva solicitud' → 'Permiso médico' (puedes hacerlo hoy mismo o hasta 30 días después de forma retroactiva). "
     "3) Adjunta tu receta, comprobante de consulta o incapacidad del IMSS desde el detalle de la solicitud. "
     "Tu jefe solo verá 'Ausente del X al Y' por privacidad médica, y la salida médica NO descuenta de tus vacaciones ni de tus permisos personales.",
     "enferme,enfermo,enfermedad,siento,mal,malestar,dolor,salud,salir,temprano,medico,consulta,incapacidad,cita,retirarme"),
    ("Permisos por motivos religiosos, culturales o compromisos importantes", "Permisos",
     "PluriOne S.A. de C.V. respeta la libertad religiosa y los compromisos personales importantes de su equipo. "
     "Si tienes una reunión religiosa, ceremonia o evento personal importante, tienes estas soluciones: "
     "1) Si solo necesitas salir unas horas antes: acuerda con tu líder directo ajustar tu horario de entrada ese día (entrando a las 8:00 h bajo el esquema de horario flexible) o reponer las horas en la semana sin perder días de saldo. "
     "2) Si requieres el día completo: solicita un 'Permiso personal' en 'Nueva solicitud' (1 día se auto-aprueba si cuentas con saldo disponible).",
     "religion,religiosa,religioso,reunion,culto,iglesia,fe,celebracion,compromiso,importante,salir,temprano,permiso,personal"),
    ("Permisos médicos e incapacidades", "Permisos",
     "En PluriOne S.A. de C.V. las ausencias médicas de más de 2 días requieren adjuntar comprobante médico (recibo, receta o incapacidad). "
     "Pueden registrarse hasta 30 días naturales después de la fecha de inicio. "
     "Son validadas únicamente por RRHH (la descripción médica y adjuntos están protegidos y ocultos para el supervisor). "
     "No descuentan del saldo de permisos personales. Si superan 3 días o requieren incapacidad oficial, se tramitan con certificado del IMSS.",
     "medico,incapacidad,enfermedad,comprobante,salud,imss,retroactivo"),
    ("Licencias de maternidad y paternidad", "Permisos",
     "En PluriOne S.A. de C.V. la licencia de maternidad es de 12 semanas (84 días naturales) y la de paternidad es de 5 días laborables con goce íntegro de sueldo conforme a la LFT. "
     "Ambas requieren validación del supervisor y de RRHH, no descuentan de ningún saldo y requieren adjuntar constancia médica o acta de nacimiento.",
     "maternidad,paternidad,licencia,nacimiento,adopcion,lft"),

    # ── RECURSOS, SEGURIDAD, LEGAL, DESARROLLO Y CULTURA ──
    ("Equipo de cómputo y activos", "Recursos",
     "PluriOne S.A. de C.V. entrega laptop corporativa y accesorios según el puesto mediante responsiva firmada. "
     "Es responsabilidad del colaborador cuidarlos y reportar cualquier pérdida, daño o robo a TI y RRHH en un máximo de 24 horas. "
     "Al concluir la relación laboral, el equipo debe devolverse en un plazo máximo de 3 días hábiles. "
     "Queda prohibido instalar software sin licencia autorizada o prestar el equipo corporativo a terceros.",
     "equipo,laptop,computadora,activo,activos,monitor,accesorios,perdida,robo,devolucion,software,licencia"),
    ("Seguridad de la información y accesos", "Seguridad",
     "En PluriOne S.A. de C.V. es obligatorio el uso de autenticación multifactor (MFA), SSO con Keycloak y gestor de contraseñas corporativo. "
     "Las credenciales, tokens y secretos nunca se guardan en repositorios de código ni se comparten por chat o correo. "
     "El acceso a entornos de producción y datos de clientes se otorga bajo el principio de mínimo privilegio y se audita cada trimestre. "
     "Cualquier incidente de seguridad o intento de phishing debe reportarse de inmediato a seguridad@plurione.com. "
     "Los dispositivos personales solo pueden acceder si cumplen con las políticas de seguridad definidas por TI.",
     "seguridad,informacion,contrasena,contrasenas,acceso,accesos,mfa,vpn,secretos,repositorio,credenciales,incidente,phishing,dispositivos"),
    ("Uso de IA generativa y herramientas externas", "Seguridad",
     "En PluriOne S.A. de C.V. solo se utilizan herramientas de Inteligencia Artificial aprobadas por TI (como el asistente interno con Groq/Ollama). "
     "Está estrictamente prohibido ingresar en herramientas externas código fuente propietario de PluriOne, datos de clientes, información personal (PII) o credenciales. "
     "Cada colaborador es responsable de revisar, probar y responder por cualquier código o texto asistido por IA. "
     "Las librerías de código abierto y de terceros deben validarse en su licencia antes de incorporarse a proyectos.",
     "inteligencia,artificial,chatgpt,copilot,ia,generativa,herramientas,codigo,datos,clientes,licencias,prompt"),
    ("Propiedad intelectual, confidencialidad y proyectos externos", "Legal",
     "Todo el código fuente, diseños, documentación y entregables desarrollados en el ejercicio del puesto son propiedad exclusiva de PluriOne S.A. de C.V. conforme al contrato individual de trabajo. "
     "La información técnica, comercial y de clientes es estrictamente confidencial incluso después de concluida la relación laboral. "
     "Para participar en proyectos externos, docencia o actividades freelance se debe solicitar autorización previa a RRHH mediante 'Otra solicitud', "
     "y no se permiten cuando impliquen conflicto de interés, compitan con el giro de PluriOne S.A. de C.V. o utilicen horario o equipos de la empresa.",
     "propiedad,intelectual,confidencialidad,confidencial,freelance,externo,proyectos,paralelo,conflicto,interes,nda,codigo"),
    ("Altas, bajas y cambios de puesto (accesos)", "Proceso",
     "En PluriOne S.A. de C.V., RRHH notifica a TI el mismo día en que se registra un alta, baja o cambio de puesto. "
     "Los accesos a Keycloak SSO, repositorios, correo y VPN se crean, ajustan o revocan en un plazo máximo de 24 horas. "
     "En los procesos de baja (offboarding) se coordina la devolución del equipo de cómputo y la transferencia documentada de conocimiento al equipo durante un periodo de aviso recomendado de 15 días.",
     "alta,baja,onboarding,offboarding,ingreso,renuncia,despido,accesos,cambio,puesto,transferencia,conocimiento,induccion"),
    ("Capacitación y certificaciones", "Desarrollo",
     "Cada colaborador de PluriOne S.A. de C.V. cuenta con un presupuesto anual de hasta $15,000 MXN y hasta 40 horas laborales al año para cursos, talleres o certificaciones "
     "relacionadas con su puesto, previa aprobación de su líder directo y de RRHH (solicitándolo desde 'Otra solicitud'). "
     "En certificaciones de alto costo financiadas al 100% por la empresa se firma carta compromiso de permanencia conforme a la LFT, y el colaborador comparte los aprendizajes en sesión interna con su equipo.",
     "capacitacion,certificacion,certificaciones,curso,cursos,formacion,aprendizaje,presupuesto,conferencia,estudiar,desarrollo"),
    ("Conducta, acoso y canal de denuncia", "Cultura",
     "En PluriOne S.A. de C.V. se prohíbe estrictamente toda forma de acoso laboral o sexual, discriminación y trato hostil, tanto de forma presencial como en chats y videollamadas. "
     "Las denuncias o reportes éticos se envían al canal confidencial etica@plurione.com o directamente a Dirección de RRHH, pueden presentarse de manera confidencial "
     "y se investigan en un plazo máximo de 10 días hábiles con garantía total de cero represalias. "
     "La empresa evalúa y atiende permanentemente los factores de riesgo psicosocial en cumplimiento con la NOM-035-STPS.",
     "acoso,conducta,discriminacion,denuncia,hostigamiento,respeto,etica,riesgos,psicosociales,queja,represalias,clima,nom035"),

    # ── CONSTANCIAS, EXPEDIENTE, NÓMINA Y FLUJO ──
    ("Constancias laborales y de sueldo", "Constancias",
     "En PluriOne S.A. de C.V. la constancia laboral se emite automáticamente en PDF al enviar la solicitud. "
     "La constancia de sueldo requiere visto bueno de RRHH (SLA 24 h), incluye firma del Representante Legal y se guarda como copia fija inmutable. "
     "Por confidencialidad salarial, las constancias de sueldo solo son visibles para el empleado solicitante y RRHH.",
     "constancia,laboral,sueldo,ingresos,carta,comprobante,antiguedad"),
    ("Cambios de datos personales y bancarios", "Expediente",
     "En PluriOne S.A. de C.V. los cambios de domicilio son revisados por RRHH. "
     "Los cambios de cuenta bancaria para depósito de nómina requieren una CLABE de 18 dígitos a nombre del colaborador y pasan por doble validación obligatoria "
     "(dos aprobadores distintos de RRHH). Surten efecto en el siguiente periodo de nómina tras la segunda aprobación.",
     "domicilio,direccion,cuenta,banco,clabe,deposito,expediente,contacto"),
    ("Incidencias de nómina", "Nómina",
     "Las incidencias de nómina en PluriOne S.A. de C.V. (pagos faltantes, descuentos indebidos, ajustes de bono de guardia o percepciones) se registran en 'Nueva solicitud' → 'Incidencia de nómina' "
     "indicando la quincena o periodo afectado y el detalle de la discrepancia. Pasan por revisión del supervisor y de RRHH con un SLA máximo de 24 horas hábiles.",
     "nomina,nominas,incidencia,incidencias,indices,pago,descuento,error,sueldo,periodo,quincena,aclaracion"),
    ("Tiempos de respuesta (SLA)", "Proceso",
     "En PluriOne S.A. de C.V. cada trámite tiene un SLA (tiempo máximo de respuesta en horas) y un umbral opcional de auto-aprobación en días configurables desde 'Administración → Trámites y SLA': "
     "Vacaciones 48 h, Permiso personal 24 h (auto-aprobable hasta 1 día), Permiso médico 24 h, Constancia laboral 1 h (automática), Constancia de sueldo 24 h, "
     "Cambios de domicilio/cuenta bancaria 48 h e Incidencias de nómina 24 h. Si un paso vence su SLA, envía recordatorio al aprobador y, si persiste sin atención, se escala automáticamente a RRHH.",
     "sla,tiempo,respuesta,escalamiento,aprobacion,vencimiento,auto,aprobar,tramites"),
    ("Flujo de aprobación multinivel", "Proceso",
     "En PluriOne S.A. de C.V.: 1) Vacaciones menores a 5 días las aprueba el supervisor directo; de 5 días o más requieren supervisor + RRHH. "
     "2) Maternidad/paternidad e incidencias de nómina requieren supervisor + RRHH. "
     "3) Cambio de cuenta bancaria requiere doble validación por dos integrantes distintos de RRHH. "
     "4) Permisos médicos, cambio de domicilio y constancia de sueldo los aprueba únicamente RRHH.",
     "aprobacion,flujo,multinivel,supervisor,rrhh,jefe,cadena"),
    ("Roles y permisos del sistema", "Proceso",
     "Roles en PluriOne S.A. de C.V.: EMPLOYEE (crea solicitudes, consulta saldos, usa el asistente IA y descarga sus constancias); "
     "MANAGER (aprueba solicitudes de su equipo sin ver motivos/adjuntos médicos ni constancias de sueldo); "
     "HR_ADMIN (gestiona empleados sin autoeditarse, valida trámites de RRHH, configura políticas/SLA y consulta reportes); "
     "SYSTEM_ADMIN (acceso total, alta de usuarios y asignación de roles HR_ADMIN/SYSTEM_ADMIN).",
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
        if title in existing_policies:
            p = existing_policies[title]
            p.category = cat
            p.content = content
            p.tags = tags
            p.is_active = True
        else:
            db.add(HRPolicy(title=title, category=cat, content=content, tags=tags, is_active=True))
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
