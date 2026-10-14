import React, { useCallback, useEffect, useState } from 'react'
import { api, errorList } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Alert, Empty, Field, Loading, Modal } from '../components/ui.jsx'
import { AUDIT_ACTION, ROLE, TYPE, fmtDateTime } from '../services/labels'

function useLoad(path) { const [d, setD] = useState(null); const load = useCallback(() => api.get(path).then(setD).catch(() => setD([])), [path]); useEffect(() => { load() }, [load]); return [d, load] }

function Users() {
  const { user: me } = useAuth()
  const [list, load] = useLoad('/users?limit=500')
  const [depts] = useLoad('/users/departments')
  const [dir] = useLoad('/users/directory')
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState([])
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')
  if (!list || !depts || !dir) return <Loading />
  const blank = { email: '', full_name: '', role: 'EMPLOYEE', password: '', department_id: '', direct_supervisor_id: '', job_title: '', hire_date: '', salary: '' }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value })
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null).map(([k, v]) => [k, ['department_id', 'direct_supervisor_id', 'salary', 'vacation_balance', 'personal_leave_balance'].includes(k) ? Number(v) : v]))
  const save = async (e) => {
    e.preventDefault(); setErr([])
    try {
      if (edit.id) { const { email, id, employee_id, auth_provider, last_login, ...rest } = edit; await api.patch(`/users/${id}`, clean({ ...rest, new_password: rest.password, password: undefined })) }
      else await api.post('/users', clean(edit))
      setEdit(null); load()
    } catch (x) { setErr(errorList(x)) }
  }
  const importCsv = async (e) => { const f = e.target.files[0]; if (!f) return; try { const r = await api.upload('/users/import', f); setMsg(`${r.created} usuario(s) creado(s). ${r.errors.length ? 'Errores: ' + r.errors.map((x) => `fila ${x.row}: ${x.error}`).join(' | ') : ''}`); load() } catch (x) { setMsg(x.message) } e.target.value = '' }
  const rows = list.filter((u) => !search || `${u.full_name} ${u.email} ${u.employee_id}`.toLowerCase().includes(search.toLowerCase()))
  return (<>
    <div className="row between"><input style={{ maxWidth: 280 }} placeholder="Buscar empleado…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {me.role === 'SYSTEM_ADMIN' && (
        <div className="row">
          <label className="btn" style={{ margin: 0, fontWeight: 400, fontSize: 14 }}>Importar CSV<input type="file" accept=".csv" hidden onChange={importCsv} /></label>
          <button className="btn primary" onClick={() => { setErr([]); setEdit(blank) }}>+ Nuevo empleado</button>
        </div>
      )}
    </div>
    {msg && <Alert kind="info">{msg}</Alert>}
    <p className="muted" style={{ fontSize: 12 }}>Columnas del CSV: email, full_name, role, department_code, job_title, hire_date (AAAA-MM-DD), supervisor_email, salary, password (vacío = solo Keycloak).</p>
    {rows.length === 0 ? <Empty>No hay empleados todavía. Crea el primero o importa un CSV.</Empty> :
      <table><thead><tr><th>No.</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Vacaciones</th><th>Estado</th><th /></tr></thead><tbody>
        {rows.map((u) => <tr key={u.id}><td>{u.employee_id}</td><td>{u.full_name}<div className="muted" style={{ fontSize: 12 }}>{u.job_title}</div></td><td>{u.email}</td><td>{ROLE[u.role]}</td><td>{u.vacation_balance}</td><td>{u.status === 'ACTIVE' ? 'Activo' : u.status === 'SUSPENDED' ? 'Suspendido' : 'Inactivo'}</td>
          <td><button className="btn sm" onClick={() => { setErr([]); setEdit({ ...u, password: '', department_id: u.department_id ?? '', direct_supervisor_id: u.direct_supervisor_id ?? '', hire_date: u.hire_date ?? '', salary: '' }) }}>Editar</button></td></tr>)}
      </tbody></table>}
    {edit && <Modal title={edit.id ? 'Editar empleado' : 'Nuevo empleado'} onClose={() => setEdit(null)}><form onSubmit={save}>
      {err.length > 0 && <Alert kind="err" items={err} />}
      <Field label="Nombre completo"><input required minLength={3} value={edit.full_name} onChange={set('full_name')} /></Field>
      <Field label="Correo"><input required type="email" disabled={!!edit.id} value={edit.email} onChange={set('email')} /></Field>
      <div className="row"><div className="f1"><Field label="Rol"><select value={edit.role} onChange={set('role')}>{Object.entries(ROLE).filter(([k]) => k !== 'SYSTEM_ADMIN' || me.role === 'SYSTEM_ADMIN').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>
        <div className="f1"><Field label="Departamento"><select value={edit.department_id} onChange={set('department_id')}><option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></div></div>
      <div className="row"><div className="f1"><Field label="Supervisor directo"><select value={edit.direct_supervisor_id} onChange={set('direct_supervisor_id')}><option value="">— (aprueba RRHH)</option>{dir.filter((d) => d.id !== edit.id).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></Field></div>
        <div className="f1"><Field label="Puesto"><input value={edit.job_title || ''} onChange={set('job_title')} /></Field></div></div>
      <div className="row"><div className="f1"><Field label="Fecha de ingreso" hint="Define el saldo de vacaciones (LFT)."><input type="date" value={edit.hire_date} onChange={set('hire_date')} /></Field></div>
        <div className="f1"><Field label="Sueldo mensual bruto" hint={edit.id ? 'Vacío = no cambiar' : 'Para las constancias de sueldo'}><input type="number" min="0" step="0.01" value={edit.salary} onChange={set('salary')} /></Field></div></div>
      {edit.id && <div className="row"><div className="f1"><Field label="Saldo vacaciones (ajuste manual)"><input type="number" min="0" step="0.5" value={edit.vacation_balance ?? ''} onChange={set('vacation_balance')} /></Field></div>
        <div className="f1"><Field label="Estado"><select value={edit.status} onChange={set('status')}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option><option value="SUSPENDED">Suspendido</option></select></Field></div></div>}
      <Field label={edit.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} hint="Mínimo 10 caracteres. Déjala vacía si el empleado entrará solo con Keycloak (inicio de sesión corporativo)."><input type="password" minLength={10} autoComplete="new-password" value={edit.password} onChange={set('password')} /></Field>
      <div className="row" style={{ marginTop: 14 }}><button className="btn primary">Guardar</button></div></form></Modal>}
  </>)
}

function Departments() {
  const [list, load] = useLoad('/users/departments')
  const [dir] = useLoad('/users/directory')
  const [f, setF] = useState({ name: '', code: '', manager_id: '' })
  const [err, setErr] = useState([])
  if (!list || !dir) return <Loading />
  const add = async (e) => { e.preventDefault(); setErr([]); try { await api.post('/users/departments', { name: f.name, code: f.code, manager_id: f.manager_id ? Number(f.manager_id) : null }); setF({ name: '', code: '', manager_id: '' }); load() } catch (x) { setErr(errorList(x)) } }
  const setMgr = async (d, v) => { await api.put(`/users/departments/${d.id}`, { name: d.name, code: d.code, description: d.description, is_active: d.is_active, manager_id: v ? Number(v) : null }); load() }
  return (<>
    <form className="row" onSubmit={add} style={{ alignItems: 'flex-end' }}>
      <div className="f1"><Field label="Nombre"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
      <div style={{ width: 110 }}><Field label="Código"><input required maxLength={20} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field></div>
      <button className="btn primary">Agregar</button></form>
    {err.length > 0 && <Alert kind="err" items={err} />}
    {list.length === 0 ? <Empty>Crea los departamentos de la empresa.</Empty> : <table style={{ marginTop: 12 }}><thead><tr><th>Código</th><th>Nombre</th><th>Responsable (aprueba si el empleado no tiene supervisor)</th></tr></thead><tbody>
      {list.map((d) => <tr key={d.id}><td>{d.code}</td><td>{d.name}</td><td><select value={d.manager_id ?? ''} onChange={(e) => setMgr(d, e.target.value)}><option value="">—</option>{dir.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></td></tr>)}</tbody></table>}
  </>)
}

function Policies() {
  const [list, load] = useLoad('/admin/policies')
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState([])
  if (!list) return <Loading />
  const save = async (e) => { e.preventDefault(); setErr([]); try { edit.id ? await api.put(`/admin/policies/${edit.id}`, edit) : await api.post('/admin/policies', edit); setEdit(null); load() } catch (x) { setErr(errorList(x)) } }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (<>
    <Alert kind="info">Estas políticas son la base de conocimiento del agente de IA y del chat. La plantilla inicial es genérica: <b>revísala y ajústala</b> a las reglas reales de la empresa.</Alert>
    <button className="btn primary" onClick={() => { setErr([]); setEdit({ title: '', category: '', content: '', tags: '', version: '1.0', is_active: true }) }}>+ Nueva política</button>
    <table style={{ marginTop: 12 }}><thead><tr><th>Título</th><th>Categoría</th><th>Activa</th><th /></tr></thead><tbody>
      {list.map((p) => <tr key={p.id}><td>{p.title}</td><td>{p.category}</td><td>{p.is_active ? 'Sí' : 'No'}</td><td><button className="btn sm" onClick={() => { setErr([]); setEdit(p) }}>Editar</button> <button className="btn sm" onClick={async () => { if (window.confirm('¿Eliminar la política?')) { await api.del(`/admin/policies/${p.id}`); load() } }}>Eliminar</button></td></tr>)}</tbody></table>
    {edit && <Modal title={edit.id ? 'Editar política' : 'Nueva política'} onClose={() => setEdit(null)}><form onSubmit={save}>
      {err.length > 0 && <Alert kind="err" items={err} />}
      <Field label="Título"><input required value={edit.title} onChange={set('title')} /></Field>
      <Field label="Categoría"><input required value={edit.category} onChange={set('category')} /></Field>
      <Field label="Contenido"><textarea required minLength={10} style={{ minHeight: 150 }} value={edit.content} onChange={set('content')} /></Field>
      <Field label="Palabras clave (separadas por coma)"><input value={edit.tags || ''} onChange={set('tags')} /></Field>
      <label style={{ display: 'flex', gap: 8 }}><input style={{ width: 'auto' }} type="checkbox" checked={edit.is_active} onChange={set('is_active')} />Activa</label>
      <div className="row" style={{ marginTop: 14 }}><button className="btn primary">Guardar</button></div></form></Modal>}
  </>)
}

function Types() {
  const [list, load] = useLoad('/admin/request-types')
  const [saving, setSaving] = useState(null)
  const [msg, setMsg] = useState('')
  if (!list) return <Loading />

  const saveRow = async (c, sla, days, active) => {
    setSaving(c.type)
    setMsg('')
    try {
      await api.patch(`/admin/request-types/${c.type}`, {
        sla_hours: Number(sla),
        auto_approve_days: c.requires_approval ? Number(days) : null,
        is_active: Boolean(active)
      })
      setMsg(`Configuración de ${TYPE[c.type] || c.type} guardada con éxito.`)
      load()
    } catch (e) {
      alert(`Error al guardar: ${e.message}`)
    } finally {
      setSaving(null)
    }
  }

  return (<>
    <p className="muted">Ajusta el tiempo máximo de respuesta (SLA), la auto-aprobación y qué trámites están disponibles para los colaboradores.</p>
    {msg && <Alert kind="ok">{msg}</Alert>}
    <table>
      <thead>
        <tr>
          <th>Trámite</th>
          <th>SLA (horas)</th>
          <th>Auto-aprobar hasta (días)</th>
          <th>Disponible</th>
          <th>Acción</th>
        </tr>
      </thead>
      <tbody>
        {list.map((c) => {
          return <TypeRow key={c.type} c={c} onSave={saveRow} isSaving={saving === c.type} />
        })}
      </tbody>
    </table>
  </>)
}

function TypeRow({ c, onSave, isSaving }) {
  const [sla, setSla] = useState(c.sla_hours)
  const [days, setDays] = useState(c.auto_approve_days ?? 0)
  const [active, setActive] = useState(c.is_active)
  const hasChanges = sla !== c.sla_hours || days !== (c.auto_approve_days ?? 0) || active !== c.is_active

  return (
    <tr>
      <td><b>{TYPE[c.type] || c.type}</b></td>
      <td>
        <input
          type="number"
          min="1"
          max="720"
          style={{ width: 100 }}
          value={sla}
          onChange={(e) => setSla(e.target.value)}
        />
      </td>
      <td>
        {c.requires_approval ? (
          <input
            type="number"
            min="0"
            max="30"
            step="0.5"
            style={{ width: 100 }}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        ) : (
          <span className="muted">Siempre automático</span>
        )}
      </td>
      <td>
        <input
          type="checkbox"
          style={{ width: 'auto', cursor: 'pointer', transform: 'scale(1.2)' }}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      </td>
      <td>
        <button
          className={`btn sm ${hasChanges ? 'primary' : ''}`}
          disabled={isSaving || !hasChanges}
          onClick={() => onSave(c, sla, days, active)}
        >
          {isSaving ? 'Guardando…' : 'Guardar'}
        </button>
      </td>
    </tr>
  )
}

function Audit() {
  const [page, setPage] = useState(0)
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get(`/admin/audit?limit=30&offset=${page * 30}`).then(setD) }, [page])
  if (!d) return <Loading />
  return (<>
    <table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead><tbody>
      {d.items.map((a) => <tr key={a.id}><td>{fmtDateTime(a.timestamp)}</td><td>{a.user}</td><td>{AUDIT_ACTION[a.action]}</td><td>{a.description}</td><td>{a.ip}</td></tr>)}</tbody></table>
    <div className="row between" style={{ marginTop: 10 }}><span className="muted">{d.total} evento(s)</span><div className="row"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Anterior</button><button className="btn sm" disabled={(page + 1) * 30 >= d.total} onClick={() => setPage(page + 1)}>Siguiente →</button></div></div>
  </>)
}

function Integrations() {
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); try { setRes(await api.post('/admin/integrations/check')) } catch (e) { setRes([{ key: 'err', name: 'Error', ok: false, detail: e.message, fix: '', required: true }]) } finally { setBusy(false) } }
  const pending = res && res.filter((r) => r.required && r.ok === false).length
  return (<div style={{ marginTop: 18 }}>
    <div className="row between"><h2 style={{ margin: 0 }}>Integraciones obligatorias</h2><button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Probando…' : 'Probar integraciones ahora'}</button></div>
    <p className="muted">Hace llamadas reales a la IA (Groq / Ollama), Keycloak, PostgreSQL, Redis y Power BI (puede tardar unos segundos).</p>
    {res && <Alert kind={pending ? 'warn' : 'ok'}>{pending ? `Faltan ${pending} integración(es) obligatoria(s) por resolver.` : 'Todas las integraciones obligatorias están operativas.'}</Alert>}
    {res && <table><tbody>{res.map((r) => <tr key={r.key}><td style={{ width: 28 }}>{r.ok === true ? '✅' : r.ok === false ? '❌' : 'ℹ️'}</td><td><b>{r.name}</b>{!r.required && <span className="muted"> (opcional)</span>}<div>{r.detail}</div>{r.ok === false && r.fix && <div className="muted">→ {r.fix}</div>}</td></tr>)}</tbody></table>}
  </div>)
}

function System() {
  const [s, load] = useLoad('/admin/system')
  const [r, setR] = useState(null)
  if (!s || Array.isArray(s)) return <Loading />
  const Row = ({ l, ok, t }) => <tr><td>{l}</td><td><span className={`badge ${ok ? 'green' : 'amber'}`}>{t}</span></td></tr>
  return (<>
    <table><tbody>
      <Row l="Base de datos" ok={s.database.ok} t={s.database.ok ? `PostgreSQL conectado` : 'Sin conexión'} />
      <Row l="Redis (caché, sesiones, límites)" ok={s.redis.backend === 'redis'} t={s.redis.backend === 'redis' ? 'Conectado' : 'No disponible (memoria local)'} />
      <Row l="Agentes de IA (Groq → Ollama)" ok={s.ai.mode === 'llm'} t={s.ai.mode === 'llm' ? `Configurado: ${s.ai.providers.join(' → ')}${s.ai.last_provider ? ` (último usado: ${s.ai.last_provider})` : ''}` : 'No configurado: se usa el motor de reglas'} />
      <Row l="Inicio de sesión corporativo" ok={s.auth.oidc} t={s.auth.oidc ? `${s.auth.provider} activo` : 'No configurado'} />
      <Row l="Notificaciones por correo" ok={s.notifications.email} t={s.notifications.email ? 'Activo' : 'No configurado'} />
      <Row l="Notificaciones en Teams" ok={s.notifications.teams} t={s.notifications.teams ? 'Activo' : 'No configurado'} />
      <Row l="Power BI (reporte incrustado)" ok={s.powerbi.report_configured} t={s.powerbi.report_configured ? 'Configurado' : 'No configurado'} />
      <Row l="Agente de SLA (escalamiento)" ok={s.sla_scheduler} t={s.sla_scheduler ? 'Activo' : 'Desactivado'} />
    </tbody></table>
    <Integrations />
    <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={async () => setR(await api.post('/admin/sla/run'))}>Ejecutar agente de SLA ahora</button>{r && <span>{r.reminded} recordatorio(s), {r.escalated} escalamiento(s).</span>}<span className="muted">Versión {s.version}</span></div>
  </>)
}

const ALL_TABS = [
  ['users', 'Empleados', Users],
  ['depts', 'Departamentos', Departments],
  ['types', 'Trámites y SLA', Types],
  ['policies', 'Políticas', Policies],
  ['audit', 'Auditoría', Audit]
]

export default function Admin() {
  const [tab, setTab] = useState('users')
  const Comp = (ALL_TABS.find((t) => t[0] === tab) || ALL_TABS[0])[2]

  return (<>
    <div className="page-header">
      <div>
        <h1>Administración</h1>
        <p className="muted">Empleados, departamentos, reglas del flujo y configuración.</p>
      </div>
    </div>
    <div className="tabs">
      {ALL_TABS.map(([k, l]) => (
        <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
      ))}
    </div>
    <div className="card"><Comp /></div>
  </>)
}
