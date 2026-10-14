import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { Empty, Loading, PriorityBadge, RiskBadge } from '../components/ui.jsx'
import { TYPE, fmtDate, fmtDateTime } from '../services/labels'

export default function Approvals() {
  const nav = useNavigate()
  const [items, setItems] = useState(null)
  useEffect(() => { api.get('/approvals/pending').then(setItems).catch(() => setItems([])) }, [])
  return (<>
    <h1>Bandeja de aprobación</h1><p className="muted">Solicitudes que esperan tu decisión, ordenadas por urgencia.</p>
    <div className="card">{!items ? <Loading /> : items.length === 0 ? <Empty>No tienes solicitudes pendientes. 🎉</Empty> :
      <table><thead><tr><th>Folio</th><th>Solicitante</th><th>Tipo</th><th>Periodo</th><th>Prioridad</th><th>Riesgo IA</th><th>Vence</th></tr></thead><tbody>
        {items.map((r) => <tr key={r.id} className="click" onClick={() => nav(`/requests/${r.id}`)}><td>{r.folio}</td><td>{r.requester?.full_name}</td><td>{TYPE[r.type]}<div className="muted" style={{ fontSize: 12 }}>{r.step_label}</div></td>
          <td>{r.start_date ? `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` : '—'}</td><td><PriorityBadge value={r.priority} /></td><td><RiskBadge value={r.ai_risk_level} /></td><td>{fmtDateTime(r.step_due_at)}</td></tr>)}
      </tbody></table>}</div>
  </>)
}
