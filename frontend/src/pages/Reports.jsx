import React, { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Alert, Loading } from '../components/ui.jsx'
import { TYPE } from '../services/labels'

export const Trend = ({ data }) => {
  if (!data || !data.length) return null
  const max = Math.max(1, ...data.map((d) => Math.max(d.created || 0, d.resolved || 0)))
  return (
    <div className="trend">
      {data.map((d) => (
        <div key={d.date} title={`${d.date}: ${d.created} creadas, ${d.resolved} resueltas`}>
          <i style={{ height: `${(d.created / max) * 100}%` }} />
          <i className="r" style={{ height: `${(d.resolved / max) * 100}%` }} />
        </div>
      ))}
    </div>
  )
}

const Bars = ({ rows, label }) => { const max = Math.max(1, ...rows.map((r) => r.count)); return rows.map((r) => <div key={r[label.key]} style={{ marginBottom: 8 }}><div className="row between"><span>{label.fmt(r[label.key])}</span><b>{r.count}</b></div><div className="bar"><i style={{ width: `${(r.count / max) * 100}%` }} /></div></div>) }

export default function Reports() {
  const [a, setA] = useState(null)
  useEffect(() => { api.get('/analytics/overview').then(setA) }, [])
  if (!a) return <Loading />
  const s = a.summary
  return (<>
    <h1>Reportes y Power BI</h1><p className="muted">Indicadores operativos en tiempo casi real. El análisis histórico y los tableros ejecutivos se consultan en Power BI.</p>
    <div className="grid g4" style={{ marginBottom: 16 }}>
      {[['Solicitudes (12 meses)', s.total], ['Resueltas automáticamente', `${s.auto_resolved_pct}%`], ['Cumplimiento de SLA', s.sla_compliance_pct != null ? `${s.sla_compliance_pct}%` : '—'], ['Horas promedio de resolución', s.avg_resolution_hours ?? '—'], ['En trámite', s.active], ['Vencidas sin atender', s.overdue], ['Rechazadas', s.rejected], ['Canceladas', s.cancelled]].map(([l, v]) => <div className="card kpi" key={l}><div className="v">{v}</div><div className="l">{l}</div></div>)}
    </div>
    <div className="grid g2">
      <div className="card"><h2>Por tipo de solicitud</h2>{a.by_type.length ? <Bars rows={a.by_type} label={{ key: 'type', fmt: (v) => TYPE[v] }} /> : <p className="muted">Sin datos todavía.</p>}</div>
      <div className="card"><h2>Por departamento</h2>{a.by_department.length ? <Bars rows={a.by_department} label={{ key: 'department', fmt: (v) => v }} /> : <p className="muted">Sin datos todavía.</p>}</div>
    </div>
    <div className="card"><h2>Últimos 30 días</h2><Trend data={a.trend} /></div>
    {a.powerbi_report_url && (
      <div className="card">
        <h2>Tablero de Power BI</h2>
        <iframe title="Power BI" src={a.powerbi_report_url} style={{ width: '100%', height: 560, border: 0 }} allowFullScreen />
      </div>
    )}
  </>)
}
