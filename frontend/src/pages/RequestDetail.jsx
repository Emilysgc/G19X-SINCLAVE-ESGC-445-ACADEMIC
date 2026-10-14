import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useOutletContext } from 'react-router-dom'
import { api, errorList } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Alert, Loading, Modal, PriorityBadge, RiskBadge, StatusBadge } from '../components/ui.jsx'
import { STEP, TYPE, fmtDate, fmtDateTime } from '../services/labels'

const DATA_LABELS = { kind: 'Tipo', purpose: 'Motivo', addressed_to: 'Dirigida a', new_address: 'Nuevo domicilio', phone: 'Teléfono', bank_name: 'Banco', clabe_masked: 'Cuenta', period: 'Periodo', has_medical_certificate: 'Con comprobante médico' }

export default function RequestDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user, refreshUser } = useAuth()
  const { reloadNotes } = useOutletContext()
  const [r, setR] = useState(null)
  const [err, setErr] = useState([])
  const [dlg, setDlg] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef(null)
  const load = useCallback(() => api.get(`/requests/${id}`).then(setR).catch((e) => setErr([e.message])), [id])
  useEffect(() => { load() }, [load])
  if (!r) return err.length ? <Alert kind="err" items={err} /> : <Loading />

  const act = async (fn) => { setBusy(true); setErr([]); try { await fn(); setDlg(null); setComment(''); await load(); await refreshUser(); reloadNotes() } catch (e) { setErr(errorList(e)) } finally { setBusy(false) } }
  const mine = r.requester?.id === user.id
  const canCancel = (mine || ['HR_ADMIN', 'SYSTEM_ADMIN'].includes(user.role)) && (['PENDING_APPROVAL', 'IN_REVIEW'].includes(r.status) || (r.status === 'APPROVED' && ['VACATION', 'PERSONAL_LEAVE'].includes(r.type) && r.start_date > new Date().toISOString().slice(0, 10)))
  const data = Object.entries(r.request_data || {}).filter(([k]) => DATA_LABELS[k])

  return (<>
    <a href="#" onClick={(e) => { e.preventDefault(); nav(-1) }}>← Volver</a>
    <div className="row between" style={{ margin: '8px 0 14px' }}>
      <div><h1>{r.title}</h1><span className="muted">{r.folio} · {TYPE[r.type]}</span></div>
      <div className="row"><PriorityBadge value={r.priority} /><StatusBadge value={r.status} /></div>
    </div>
    {err.length > 0 && <Alert kind="err" items={err} />}
    {r.auto_resolved && <Alert kind="ok">Resuelta automáticamente por el sistema.</Alert>}
    {r.can_act && <div className="card row between"><b>Esta solicitud espera tu decisión.</b><div className="row"><button className="btn danger" onClick={() => setDlg('reject')}>Rechazar</button><button className="btn ok" onClick={() => setDlg('approve')}>Aprobar</button></div></div>}
    <div className="grid g2">
      <div className="card"><h2>Datos</h2>
        <table><tbody>
          <tr><th>Solicitante</th><td>{r.requester?.full_name} ({r.requester?.employee_id})</td></tr>
          {r.start_date && <tr><th>Periodo</th><td>{fmtDate(r.start_date)} – {fmtDate(r.end_date)} ({r.days_requested} día(s) hábil(es))</td></tr>}
          <tr><th>Creada</th><td>{fmtDateTime(r.created_at)}</td></tr>
          {r.due_at && <tr><th>Límite (SLA)</th><td>{fmtDateTime(r.due_at)}</td></tr>}
          {r.completed_at && <tr><th>Resuelta</th><td>{fmtDateTime(r.completed_at)}</td></tr>}
          {data.map(([k, v]) => <tr key={k}><th>{DATA_LABELS[k]}</th><td>{typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v)}</td></tr>)}
          {r.sensitive?.clabe && <tr><th>CLABE completa</th><td><b>{r.sensitive.clabe}</b> <span className="muted">(consulta registrada en auditoría)</span></td></tr>}
          {r.description && <tr><th>Comentarios</th><td>{r.description}</td></tr>}
        </tbody></table>
        {r.has_document && <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => api.file(`/requests/${r.id}/document.pdf`, `${r.folio}.pdf`)}>Descargar PDF</button>
          <button className="btn" onClick={() => api.file(`/requests/${r.id}/document`, '', true)}>Vista previa</button></div>}
      </div>
      <div className="card"><h2>Revisión automática (agente de IA)</h2>
        <div className="row"><span>Riesgo:</span><RiskBadge value={r.ai_risk_level} /><span className="muted">Puntaje: {r.ai_validation_score ?? '—'}</span></div>
        <pre className="n" style={{ marginTop: 10 }}>{r.ai_validation_notes || 'Sin observaciones.'}</pre>
      </div>
    </div>
    {r.steps?.length > 0 && <div className="card"><h2>Flujo de aprobación</h2><div className="steps">
      {r.steps.map((s) => <div key={s.step_index} className={`step ${s.status}`}><b>{s.step_index + 1}. {s.label}</b> — {STEP[s.status]}{s.escalated && ' (escalado por SLA)'}
        <div className="muted">{s.approver ? `Asignado: ${s.approver}` : ''}{s.acted_by ? ` · Resolvió: ${s.acted_by}` : ''}{s.action_date ? ` · ${fmtDateTime(s.action_date)}` : s.due_at ? ` · Vence ${fmtDateTime(s.due_at)}` : ''}</div>
        {s.comments && <div>“{s.comments}”</div>}</div>)}</div></div>}
    {(mine || ['HR_ADMIN', 'SYSTEM_ADMIN'].includes(user.role) || r.can_act) && <div className="card"><h2>Archivos adjuntos</h2>
      {r.attachments.length === 0 && <p className="muted">Sin adjuntos.</p>}
      {r.attachments.map((a) => <div key={a.id}><a href="#" onClick={(e) => { e.preventDefault(); api.file(`/requests/${r.id}/attachments/${a.id}`, a.name) }}>{a.name}</a> <span className="muted">({Math.round(a.size / 1024)} KB)</span></div>)}
      {mine && r.attachments.length < 5 && <><input ref={file} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && act(() => api.upload(`/requests/${r.id}/attachments`, e.target.files[0]))} />
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => file.current.click()}>+ Adjuntar PDF / imagen</button></>}</div>}
    {canCancel && <button className="btn" disabled={busy} onClick={() => window.confirm('¿Cancelar esta solicitud?') && act(() => api.post(`/requests/${r.id}/cancel`))}>Cancelar solicitud</button>}
    {dlg && <Modal title={dlg === 'approve' ? 'Aprobar solicitud' : 'Rechazar solicitud'} onClose={() => setDlg(null)}>
      <label>{dlg === 'approve' ? 'Comentario (opcional)' : 'Motivo del rechazo (obligatorio)'}</label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} autoFocus />
      <div className="row" style={{ marginTop: 14 }}><button className={`btn ${dlg === 'approve' ? 'ok' : 'danger'}`} disabled={busy || (dlg === 'reject' && comment.trim().length < 5)}
        onClick={() => act(() => api.post(`/approvals/${r.id}/${dlg}`, { comments: comment || null }))}>{dlg === 'approve' ? 'Confirmar aprobación' : 'Confirmar rechazo'}</button></div></Modal>}
  </>)
}
