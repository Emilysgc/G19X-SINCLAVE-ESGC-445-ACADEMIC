import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Loading, Empty } from '../components/ui.jsx'
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
    const t = setTimeout(
      () =>
        api
          .get(`/requests?${p}`)
          .then(setData)
          .catch(() => setData({ total: 0, items: [] })),
      250
    )
    return () => clearTimeout(t)
  }, [q])

  const wide = user.role !== 'EMPLOYEE'
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value, offset: 0 })

  // Conteo de aprobadas y pendientes para las métricas estilo Imagen 4
  const items = data?.items || []
  const approvedCount = items.filter((r) => r.status === 'APPROVED').length
  const pendingCount = items.filter((r) => r.status === 'PENDING_SUPERVISOR' || r.status === 'PENDING_HR').length

  // Exportar solicitudes filtradas a CSV
  const handleExportCSV = () => {
    if (!items.length) return
    const headers = ['Folio', 'Solicitante', 'Tipo', 'Fecha Inicio', 'Fecha Fin', 'Prioridad', 'Estado']
    const rows = items.map((r) => [
      r.folio,
      r.requester?.full_name || user.full_name,
      TYPE[r.type] || r.type,
      r.start_date || '',
      r.end_date || '',
      r.priority,
      STATUS[r.status]?.[0] || r.status,
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((x) => `"${x}"`).join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `solicitudes_rrhh_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Estilo de píldora según Imagen 4 (Sent=Gold, Void=Grey, Paid=Cyan)
  const getStatusPill = (status) => {
    if (status === 'APPROVED') {
      return <span className="invoices-status-pill invoices-status-paid">Aprobada</span>
    }
    if (status === 'REJECTED' || status === 'CANCELLED') {
      return <span className="invoices-status-pill invoices-status-void">{status === 'REJECTED' ? 'Rechazada' : 'Cancelada'}</span>
    }
    return <span className="invoices-status-pill invoices-status-sent">{STATUS[status]?.[0] || 'En revisión'}</span>
  }

  return (
    <div className="invoices-container">
      {/* ── Encabezado estilo Imagen 4 ───────────────────────────────── */}
      <div className="invoices-header-row">
        <h1 className="invoices-page-title">
          <span>{wide ? 'SOLICITUDES' : 'MIS SOLICITUDES'}</span>
        </h1>
        <div className="invoices-brand-tag">PluriOne</div>
      </div>

      {/* ── Barra de Filtros horizontal estilo píldora (Imagen 4) ───── */}
      <div className="invoices-filter-bar">
        <div className="invoices-filter-item">
          <svg className="invoices-filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="invoices-filter-input"
            placeholder="Buscar por folio o asunto…"
            value={q.search}
            onChange={set('search')}
          />
        </div>

        <div className="invoices-filter-item">
          <svg className="invoices-filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <select className="invoices-filter-select" value={q.type} onChange={set('type')}>
            <option value="">Todos los tipos</option>
            {Object.entries(TYPE).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="invoices-filter-item">
          <svg className="invoices-filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <select className="invoices-filter-select" value={q.status} onChange={set('status')}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS).map(([k, [t]]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="invoices-btn-filter">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          <span>Filtrar</span>
        </button>
      </div>

      {/* ── Fila de Métricas / KPI + Botones de Acción (Imagen 4) ────── */}
      <div className="invoices-kpi-bar">
        <div className="invoices-kpi-group">
          <div className="invoices-kpi-item">
            <span className="invoices-kpi-label">Total Solicitudes</span>
            <span className="invoices-kpi-val">{data ? data.total : '—'}</span>
          </div>
          <div className="invoices-kpi-item">
            <span className="invoices-kpi-label">Aprobadas</span>
            <span className="invoices-kpi-val">{data ? approvedCount : '—'}</span>
          </div>
          <div className="invoices-kpi-item">
            <span className="invoices-kpi-label">En Revisión</span>
            <span className="invoices-kpi-val">{data ? pendingCount : '—'}</span>
          </div>
        </div>

        <div className="invoices-actions-group">
          <button type="button" className="invoices-btn-export" onClick={handleExportCSV}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Exportar CSV</span>
          </button>

          <Link to="/requests/new" className="invoices-btn-create">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Nueva Solicitud</span>
          </Link>
        </div>
      </div>

      {/* ── Tabla de Solicitudes con Filas Flotantes (Imagen 4) ──────── */}
      <div className="invoices-table-card">
        {!data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <Empty>No hay solicitudes registradas con los filtros seleccionados.</Empty>
        ) : (
          <>
            <table className="invoices-table">
              <thead>
                <tr>
                  <th className="invoices-th" style={{ width: 100 }}>No</th>
                  <th className="invoices-th">{wide ? 'Colaborador' : 'Solicitante'}</th>
                  <th className="invoices-th">Tipo</th>
                  <th className="invoices-th">Fecha Inicio</th>
                  <th className="invoices-th">Fecha Fin</th>
                  <th className="invoices-th">Prioridad</th>
                  <th className="invoices-th">Estado</th>
                  <th className="invoices-th" style={{ textAlign: 'center', width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="invoices-row"
                    onClick={() => nav(`/requests/${r.id}`)}
                  >
                    <td className="invoices-td">
                      <b>#{r.folio || idx + 1}</b>
                    </td>
                    <td className="invoices-td">
                      <span className="invoices-client-link">
                        {r.requester?.full_name || user.full_name}
                      </span>
                    </td>
                    <td className="invoices-td">{TYPE[r.type] || r.type}</td>
                    <td className="invoices-td">
                      {r.start_date ? fmtDate(r.start_date) : fmtDate(r.created_at)}
                    </td>
                    <td className="invoices-td">
                      {r.end_date ? fmtDate(r.end_date) : '—'}
                    </td>
                    <td className="invoices-td">
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{r.priority}</span>
                    </td>
                    <td className="invoices-td">{getStatusPill(r.status)}</td>
                    <td className="invoices-td" style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="invoices-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          nav(`/requests/${r.id}`)
                        }}
                        title="Ver detalle"
                      >
                        ⋮
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginación */}
            <div className="row between" style={{ marginTop: 20 }}>
              <span className="muted" style={{ fontSize: 13 }}>
                Mostrando {data.items.length} de {data.total} trámites
              </span>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn sm"
                  style={{ borderRadius: 20, padding: '6px 16px' }}
                  disabled={q.offset === 0}
                  onClick={() => setQ({ ...q, offset: Math.max(0, q.offset - limit) })}
                >
                  ← Anterior
                </button>
                <button
                  className="btn sm"
                  style={{ borderRadius: 20, padding: '6px 16px' }}
                  disabled={q.offset + limit >= data.total}
                  onClick={() => setQ({ ...q, offset: q.offset + limit })}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
