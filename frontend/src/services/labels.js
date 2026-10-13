export const STATUS = {
  PENDING_APPROVAL: ['Pendiente de aprobación', 'amber'], IN_REVIEW: ['En revisión', 'blue'], APPROVED: ['Aprobada', 'green'],
  COMPLETED: ['Completada', 'green'], REJECTED: ['Rechazada', 'red'], CANCELLED: ['Cancelada', 'gray'],
}
export const PRIORITY = { LOW: ['Baja', 'gray'], NORMAL: ['Normal', 'blue'], HIGH: ['Alta', 'amber'], URGENT: ['Urgente', 'red'] }
export const RISK = { LOW: ['Bajo', 'green'], MEDIUM: ['Medio', 'amber'], HIGH: ['Alto', 'red'] }
export const ROLE = { EMPLOYEE: 'Empleado', MANAGER: 'Supervisor', HR_ADMIN: 'Recursos Humanos', SYSTEM_ADMIN: 'Administrador del sistema' }
export const TYPE = {
  VACATION: 'Vacaciones', PERSONAL_LEAVE: 'Permiso personal', MEDICAL_LEAVE: 'Permiso médico', MATERNITY_PATERNITY: 'Maternidad / paternidad',
  CERTIFICATE_EMPLOYMENT: 'Constancia laboral', CERTIFICATE_SALARY: 'Constancia de sueldo', ADDRESS_CHANGE: 'Cambio de domicilio',
  BANK_ACCOUNT_CHANGE: 'Cambio de cuenta bancaria', PAYROLL_INCIDENT: 'Incidencia de nómina', OTHER: 'Otra solicitud',
}
export const STEP = { PENDING: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado', SKIPPED: 'Omitido' }
export const AUDIT_ACTION = {
  CREATE: 'Creación', UPDATE: 'Modificación', DELETE: 'Eliminación', APPROVE: 'Aprobación', REJECT: 'Rechazo', CANCEL: 'Cancelación',
  LOGIN: 'Inicio de sesión', LOGOUT: 'Cierre de sesión', VIEW_SENSITIVE: 'Consulta de dato sensible', ESCALATE: 'Escalamiento', SYSTEM: 'Sistema',
}
export const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
