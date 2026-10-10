-- =====================================================================================
-- Modelo analítico para Power BI (PostgreSQL). Se aplica automáticamente al iniciar el backend.
-- Convenciones: prefijo dim_ = dimensión, vw_ = hechos/agregados. Sin datos sensibles (sin sueldo, CLABE ni adjuntos).
-- =====================================================================================

DROP VIEW IF EXISTS vw_auditoria CASCADE;
DROP VIEW IF EXISTS vw_resumen_diario CASCADE;
DROP VIEW IF EXISTS vw_ausencias CASCADE;
DROP VIEW IF EXISTS vw_aprobaciones CASCADE;
DROP VIEW IF EXISTS vw_solicitudes CASCADE;
DROP VIEW IF EXISTS dim_empleados CASCADE;
DROP VIEW IF EXISTS dim_departamentos CASCADE;

CREATE VIEW dim_departamentos AS
SELECT d.id AS departamento_id, d.code AS codigo, d.name AS departamento, d.is_active AS activo
FROM departments d;

CREATE VIEW dim_empleados AS
SELECT u.id AS empleado_id, u.employee_id AS numero_empleado, u.full_name AS nombre, u.job_title AS puesto,
       u.role::text AS rol, u.status::text AS estatus, u.auth_provider::text AS proveedor_acceso,
       d.name AS departamento, s.full_name AS supervisor, u.hire_date AS fecha_ingreso,
       CASE WHEN u.hire_date IS NULL THEN NULL ELSE DATE_PART('year', AGE(CURRENT_DATE, u.hire_date))::int END AS antiguedad_anios,
       u.vacation_balance AS saldo_vacaciones, u.personal_leave_balance AS saldo_permisos
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN users s ON s.id = u.direct_supervisor_id;

CREATE VIEW vw_solicitudes AS
SELECT r.id AS solicitud_id, r.folio, r.type::text AS tipo, c.display_name AS tipo_nombre, r.status::text AS estado,
       r.priority::text AS prioridad, r.requester_id AS empleado_id, d.name AS departamento,
       r.start_date AS fecha_inicio, r.end_date AS fecha_fin, r.days_requested AS dias_solicitados,
       r.created_at AS fecha_creacion, r.created_at::date AS fecha_creacion_dia, r.due_at AS fecha_limite_sla, r.completed_at AS fecha_resolucion,
       CASE WHEN r.completed_at IS NOT NULL AND r.status::text <> 'CANCELLED'
            THEN ROUND((EXTRACT(EPOCH FROM (r.completed_at - r.created_at)) / 3600)::numeric, 2) END AS horas_resolucion,
       CASE WHEN r.completed_at IS NULL OR r.due_at IS NULL OR r.status::text = 'CANCELLED' THEN NULL
            WHEN r.completed_at <= r.due_at THEN 1 ELSE 0 END AS cumplio_sla,
       CASE WHEN r.completed_at IS NULL AND r.due_at < NOW() THEN 1 ELSE 0 END AS vencida_abierta,
       CASE WHEN r.auto_resolved THEN 1 ELSE 0 END AS auto_resuelta,
       r.ai_validation_score AS score_ia, r.ai_risk_level AS riesgo_ia,
       1 AS solicitudes
FROM requests r
JOIN users u ON u.id = r.requester_id
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN request_type_configs c ON c.type = r.type;

CREATE VIEW vw_aprobaciones AS
SELECT st.id AS paso_id, r.id AS solicitud_id, r.folio, r.type::text AS tipo, st.step_index + 1 AS numero_paso, st.label AS etapa,
       st.status::text AS estado_paso, st.escalated AS escalado, st.approver_role AS rol_aprobador,
       COALESCE(a.full_name, st.approver_role) AS aprobador_asignado, ab.full_name AS resuelto_por,
       st.due_at AS fecha_limite, st.action_date AS fecha_accion,
       CASE WHEN st.action_date IS NOT NULL
            THEN ROUND((EXTRACT(EPOCH FROM (st.action_date - r.created_at)) / 3600)::numeric, 2) END AS horas_desde_solicitud
FROM approval_steps st
JOIN approval_workflows w ON w.id = st.workflow_id
JOIN requests r ON r.id = w.request_id
LEFT JOIN users a ON a.id = st.approver_id
LEFT JOIN users ab ON ab.id = st.acted_by_id;

CREATE VIEW vw_ausencias AS
SELECT r.id AS solicitud_id, r.folio, r.requester_id AS empleado_id, d.name AS departamento, r.type::text AS tipo,
       r.status::text AS estado, g.dia::date AS fecha
FROM requests r
JOIN users u ON u.id = r.requester_id
LEFT JOIN departments d ON d.id = u.department_id
CROSS JOIN LATERAL generate_series(r.start_date::timestamp, r.end_date::timestamp, interval '1 day') AS g(dia)
WHERE r.type::text IN ('VACATION', 'PERSONAL_LEAVE', 'MEDICAL_LEAVE', 'MATERNITY_PATERNITY')
  AND r.status::text IN ('APPROVED', 'COMPLETED')
  AND r.start_date IS NOT NULL AND r.end_date IS NOT NULL
  AND EXTRACT(ISODOW FROM g.dia) < 6;

CREATE VIEW vw_resumen_diario AS
SELECT r.created_at::date AS fecha, r.type::text AS tipo, COUNT(*) AS solicitudes_creadas,
       COUNT(*) FILTER (WHERE r.completed_at IS NOT NULL AND r.status::text <> 'CANCELLED') AS solicitudes_resueltas,
       COUNT(*) FILTER (WHERE r.auto_resolved) AS auto_resueltas,
       COUNT(*) FILTER (WHERE r.status::text = 'REJECTED') AS rechazadas,
       ROUND(AVG(EXTRACT(EPOCH FROM (r.completed_at - r.created_at)) / 3600)
             FILTER (WHERE r.completed_at IS NOT NULL AND r.status::text <> 'CANCELLED')::numeric, 2) AS horas_promedio
FROM requests r
GROUP BY r.created_at::date, r.type::text;

CREATE VIEW vw_auditoria AS
SELECT a.id AS evento_id, a.timestamp AS fecha, a.entity_type AS entidad, a.entity_id AS entidad_id, a.action::text AS accion,
       COALESCE(u.full_name, 'Sistema') AS usuario, a.description AS descripcion
FROM audit_logs a
LEFT JOIN users u ON u.id = a.user_id;
