import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Loading, StatusBadge, PriorityBadge, Empty } from '../components/ui.jsx'
import { STATUS, TYPE, fmtDate } from '../services/labels'

export default function Requests() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [q, setQ] = useState({ status: '', type: '', search: '', offset: 0 })
  const [data, setData] = useState(null)
  const limit = 25
  useEffect(() => {
    const p = new URLSearchParams({ limit, offset: q.offset })
    ;['status', 'type', 'search'].forEach((k) => q[k] && p.set(k, q[k]))
    setData(null)
    const t = setTimeout(() => api.get(`/requests?${p}`).then(setData).catch(() => setData({ total: 0, items: [] })), 250)
    return () => clearTimeout(t)
  }, [q])
  const wide = user.role !== 'EMPLOYEE'
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value, offset: 0 })
  return (<>
    <div className="row between"><div><h1>{wide ? 'Solicitudes' : 'Mis solicitudes'}</h1><p className="muted">{wide ? 'Las tuyas y las de las personas que te corresponden.' : 'Historial y estado de tus trámites.'}</p></div><Link className="btn primary" to="/requests/new">+ Nueva solicitud</Link></div>
    <div className="card"><div className="row">
      <input className="f1" placeholder="Buscar por folio o título…" value={q.search} onChange={set('search')} />
      <select className="f1" value={q.status} onChange={set('status')}><option value="">Todos los estados</option>{Object.entries(STATUS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select>
      <select className="f1" value={q.type} onChange={set('type')}><option value="">Todos los tipos</option>{Object.entries(TYPE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
    </div></div>
    <div className="card">{!data ? <Loading /> : data.items.length === 0 ? <Empty>No hay solicitudes con esos filtros.</Empty> : <>
      <table><thead><tr><th>Folio</th>{wide && <th>Solicitante</th>}<th>Tipo</th><th>Fechas</th><th>Prioridad</th><th>Estado</th></tr></thead><tbody>
        {data.items.map((r) => <tr key={r.id} className="click" onClick={() => nav(`/requests/${r.id}`)}><td>{r.folio}</td>{wide && <td>{r.requester?.full_name}</td>}<td>{TYPE[r.type]}</td>
          <td>{r.start_date ? `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` : fmtDate(r.created_at)}</td><td><PriorityBadge value={r.priority} /></td><td><StatusBadge value={r.status} /></td></tr>)}
      </tbody></table>
      <div className="row between" style={{ marginTop: 12 }}><span className="muted">{data.total} resultado(s)</span><div className="row">
        <button className="btn sm" disabled={q.offset === 0} onClick={() => setQ({ ...q, offset: Math.max(0, q.offset - limit) })}>← Anterior</button>
        <button className="btn sm" disabled={q.offset + limit >= data.total} onClick={() => setQ({ ...q, offset: q.offset + limit })}>Siguiente →</button></div></div></>}
    </div>
  </>)
}
