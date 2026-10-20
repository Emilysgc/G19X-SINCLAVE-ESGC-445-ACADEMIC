import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Loading, StatusBadge, Empty, Alert, Icon, UserAvatar, Modal } from '../components/ui.jsx'
import { TYPE, ROLE, fmtDate } from '../services/labels'

export default function Dashboard() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [a, setA] = useState(null)
  const [recent, setRecent] = useState(null)
  const [pending, setPending] = useState(0)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [showVacationModal, setShowVacationModal] = useState(false)
  const [filterTab, setFilterTab] = useState('ALL')

  const approver = ['MANAGER', 'HR_ADMIN', 'SYSTEM_ADMIN'].includes(user.role)

  useEffect(() => {
    api.get('/analytics/overview').then(setA).catch((e) => setErr(e.message))
    api.get('/requests?limit=15').then((r) => setRecent(r.items)).catch(() => setRecent([]))
    if (approver) api.get('/approvals/pending').then((r) => setPending(r.length)).catch(() => {})
  }, [approver])

  if (!a && !err) return <Loading />
  const s = a?.summary

  const filteredRecent = recent ? recent.filter((r) => {
    const matchesSearch = !search || `${r.folio} ${r.title} ${TYPE[r.type]}`.toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false
    if (filterTab === 'DELIVERED') return r.status === 'COMPLETED' || r.status === 'APPROVED'
    if (filterTab === 'IN_TRANSIT') return r.status === 'IN_REVIEW' || r.status === 'PENDING_APPROVAL'
    if (filterTab === 'PENDING') return r.status === 'PENDING_APPROVAL'
    return true
  }) : []

  const totalReq = s?.total || (recent ? recent.length : 0) || 1
  const activeReq = s?.active ?? (recent?.filter(r => r.status === 'PENDING_APPROVAL' || r.status === 'IN_REVIEW').length || 0)
  const activePct = Math.min(100, Math.round((activeReq / totalReq) * 100))
  const resolvedPct = 100 - activePct

  const today = new Date()
  const dayNum = today.getDate()
  const dayNameWeekday = today.toLocaleDateString('es-MX', { weekday: 'short' })
  const dayNameMonth = today.toLocaleDateString('es-MX', { month: 'long' })

  return (
    <div className="atlas-dash">
      {err && <Alert kind="err">{err}</Alert>}
      {approver && pending > 0 && (
        <Alert kind="warn">
          <b>Tienes {pending} solicitud(es) pendiente(s) de tu decisión.</b>{' '}
          <Link to="/approvals">Ir a la bandeja de aprobación →</Link>
        </Alert>
      )}

      {/* 1. Barra de acciones Atlas: Fecha cuadrada | Botón Negro | Botón Contorno ... Botones derecha */}
      <div className="atlas-action-row">
        <div className="atlas-action-left">
          <div className="atlas-date-box">
            <span className="date-number">{dayNum}</span>
            <div className="date-meta">
              <span className="date-day">{dayNameWeekday},</span>
              <span className="date-month">{dayNameMonth}</span>
            </div>
          </div>

          <div className="atlas-v-divider" />

          <Link to="/requests/new" className="atlas-btn-black">
            <Icon name="plus" size={15} /> Nueva Solicitud
          </Link>
          <Link to="/requests" className="atlas-btn-pill">
            <Icon name="list" size={14} /> Mis Solicitudes
          </Link>
          {approver && (
            <Link to="/approvals" className="atlas-btn-pill">
              <Icon name="check" size={14} /> Bandeja ({pending})
            </Link>
          )}
        </div>

        <div className="atlas-action-right">
          <Link to="/reports" className="atlas-btn-pill">
            <Icon name="chart" size={14} /> Reportes Power BI
          </Link>
          <Link to="/calendar" className="atlas-btn-pill">
            <Icon name="calendar" size={14} /> Ver Calendario
          </Link>
        </div>
      </div>

      {/* 2. Cuadrícula superior: Eficiencia de Trámites, Cumplimiento de SLA, Saldos Disponibles */}
      <div className="atlas-top-grid">
        {/* Card 1: Eficiencia de Trámites */}
        <div className="atlas-card">
          <div className="atlas-card-header-row">
            <span className="atlas-card-title">Eficiencia de Trámites</span>
            <span className="atlas-select-pill">Anual ▾</span>
          </div>

          <div className="atlas-donut-layout">
            <div
              className="atlas-donut-chart"
              style={{
                background: `conic-gradient(#f97316 0% ${resolvedPct}%, #f87171 ${resolvedPct}% ${resolvedPct + Math.round(activePct / 2)}%, #e7e5e4 ${resolvedPct + Math.round(activePct / 2)}% 100%)`
              }}
            >
              <div className="atlas-donut-hole">
                <b>{totalReq}</b>
                <small>Total</small>
              </div>
            </div>

            <div className="atlas-donut-metrics">
              <div className="atlas-metric-big">
                <b>{resolvedPct || 100}%</b>
                <span className="atlas-trend-badge up">Tasa de resolución</span>
              </div>
              <div className="atlas-leader-list">
                <div className="atlas-leader-row">
                  <span className="dot dot-orange" />
                  <span className="leader-lbl">Resueltas</span>
                  <span className="leader-dots" />
                  <span className="leader-val">{totalReq - activeReq}</span>
                </div>
                <div className="atlas-leader-row">
                  <span className="dot dot-stone" />
                  <span className="leader-lbl">En trámite</span>
                  <span className="leader-dots" />
                  <span className="leader-val">{activeReq}</span>
                </div>
                <div className="atlas-leader-row">
                  <span className="dot dot-coral" />
                  <span className="leader-lbl">Pendientes</span>
                  <span className="leader-dots" />
                  <span className="leader-val">{pending || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Cumplimiento de SLA */}
        <div className="atlas-card">
          <div className="atlas-card-header-row">
            <span className="atlas-card-title"><span className="live-dot" /> Cumplimiento de SLA</span>
          </div>

          <div className="atlas-sla-layout">
            <div
              className="atlas-sla-ring"
              style={{
                background: `conic-gradient(#f97316 0% ${s?.sla_compliance_pct ?? 100}%, #fed7aa ${s?.sla_compliance_pct ?? 100}% 100%)`
              }}
            >
              <div className="atlas-sla-hole">
                <b>{s?.sla_compliance_pct ?? 100}%</b>
                <small>A tiempo</small>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10, textAlign: 'center' }}>
              Promedio: <b>{s?.avg_resolution_hours ?? 24} horas</b>
            </div>
          </div>
        </div>

        {/* Card 3: Saldos Disponibles */}
        <div className="atlas-card atlas-card-kpi-beige">
          <div className="atlas-card-header-row">
            <span className="atlas-card-title"><span className="live-dot" /> Saldos Disponibles</span>
          </div>
          <div className="atlas-truck-content">
            <div className="atlas-kpi-header-num">
              <span className="atlas-truck-big-val">{user.vacation_balance ?? 0}</span>
              <span className="atlas-trend-badge up">días vacaciones</span>
            </div>
            <div style={{ fontSize: 12, color: '#78716c', marginBottom: 12 }}>
              {user.personal_leave_balance ?? 0} días permiso con goce
            </div>
            <button className="atlas-btn-track" onClick={() => nav('/requests/new')}>
              Nueva Solicitud
            </button>
            <button
              type="button"
              className="btn sm"
              style={{ marginTop: 8, width: '100%', fontSize: 11, background: '#fff', border: '1px solid #cbd5e1' }}
              onClick={() => setShowVacationModal(true)}
            >
              ?? Ver c?lculo LFT y Prima Vacacional
            </button>
            <div className="atlas-truck-graphic" aria-hidden="true">
              <svg width="100" height="50" viewBox="0 0 100 50" fill="none">
                <rect x="10" y="10" width="70" height="30" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
                <circle cx="28" cy="38" r="6" fill="#334155" />
                <circle cx="62" cy="38" r="6" fill="#334155" />
                <path d="M22 22h30" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Gráfica de Tendencia & Trámites Frecuentes */}
      <div className="atlas-middle-grid">
        <div className="atlas-card atlas-chart-card">
          <div className="atlas-card-header-row">
            <span className="atlas-card-title">Tendencia de Solicitudes</span>
            <div className="row" style={{ gap: 8 }}>
              <span className="atlas-select-pill">Mensual ▾</span>
              <span className="atlas-select-pill">2026 ▾</span>
            </div>
          </div>

          <div className="atlas-chart-metric-row">
            <div className="atlas-chart-main-val">
              <span className="atlas-chart-big-amount">{totalReq} Trámites</span>
              <span className="atlas-trend-badge up">↗ En tiempo real</span>
            </div>
            <div className="atlas-chart-legend">
              <span className="legend-item"><span className="dot dot-orange" /> Este período</span>
              <span className="legend-item"><span className="dot dot-stone" /> Período anterior</span>
            </div>
          </div>

          {/* Curva SVG estilizada exacta Atlas con degradado naranja cálido */}
          <div className="atlas-chart-container">
            <svg viewBox="0 0 540 130" className="atlas-chart-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="atlasGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 0 95 Q 60 70 120 78 T 240 85 T 360 40 T 470 36 L 470 130 L 0 130 Z"
                fill="url(#atlasGrad)"
              />
              <path
                d="M 0 95 Q 60 70 120 78 T 240 85 T 360 40 T 470 36"
                fill="none"
                stroke="#f97316"
                strokeWidth="2.5"
              />
              <path
                d="M 0 102 Q 70 95 140 82 T 280 88 T 420 62 T 540 66"
                fill="none"
                stroke="#d6d3d1"
                strokeWidth="1.8"
                strokeDasharray="4 4"
              />
            </svg>
            <div className="atlas-chart-labels">
              <span>Ene</span><span>Feb</span><span>Mar</span><span>Abr</span><span>May</span><span>Jun</span><span>Jul</span><span>Ago</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dic</span>
            </div>
          </div>
        </div>

        {/* Trámites más frecuentes */}
        <div className="atlas-card">
          <div className="atlas-card-header-row">
            <span className="atlas-card-title">Trámites más frecuentes</span>
          </div>
          <div className="atlas-legend-row" style={{ fontSize: 11, marginBottom: 16 }}>
            <span className="dot dot-orange" /> Mayor
            <span className="dot dot-peach" style={{ marginLeft: 10 }} /> Medio
            <span className="dot dot-cream" style={{ marginLeft: 10 }} /> Menor
          </div>
          <div className="atlas-bars-list">
            {(a?.by_type?.length ? a.by_type : [
              { type: 'VACATION', count: 12 },
              { type: 'PERSONAL_LEAVE', count: 8 },
              { type: 'CERTIFICATE_EMPLOYMENT', count: 6 },
              { type: 'MEDICAL_LEAVE', count: 4 },
            ]).slice(0, 4).map((item, idx) => (
              <div key={item.type} className="atlas-bar-row">
                <span className="atlas-bar-name">{TYPE[item.type] || item.type}</span>
                <div className="atlas-bar-track">
                  <div
                    className="atlas-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(18, (item.count / 15) * 100))}%`,
                      backgroundColor: idx === 0 ? '#f97316' : idx === 1 ? '#fb923c' : idx === 2 ? '#fdba74' : '#fed7aa'
                    }}
                  />
                </div>
                <span className="atlas-bar-count">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Tabla de Solicitudes estilo Atlas */}
      <div className="atlas-card atlas-table-card">
        <div className="atlas-table-header-row">
          <div>
            <h3 className="atlas-card-title" style={{ fontSize: 16, margin: 0 }}>Resumen de Solicitudes</h3>
            <span className="atlas-tag-sub">Registro de actividad y trámites recientes</span>
          </div>

          <div className="atlas-table-controls">
            <div className="atlas-filter-pills-bar">
              <button className={filterTab === 'ALL' ? 'active' : ''} onClick={() => setFilterTab('ALL')}>Todas</button>
              <button className={filterTab === 'DELIVERED' ? 'active' : ''} onClick={() => setFilterTab('DELIVERED')}>Aprobadas</button>
              <button className={filterTab === 'IN_TRANSIT' ? 'active' : ''} onClick={() => setFilterTab('IN_TRANSIT')}>En revisión</button>
              <button className={filterTab === 'PENDING' ? 'active' : ''} onClick={() => setFilterTab('PENDING')}>Pendientes</button>
            </div>
            <div className="atlas-table-pagination">
              <span className="atlas-count-label">1-10 de {filteredRecent.length}</span>
              <button className="atlas-page-arrow">‹</button>
              <button className="atlas-page-arrow">›</button>
            </div>
          </div>
        </div>

        {!recent ? (
          <Loading />
        ) : filteredRecent.length === 0 ? (
          <Empty>No hay solicitudes registradas en esta categoría.</Empty>
        ) : (
          <table className="atlas-table">
            <thead>
              <tr>
                <th>Folio ⇅</th>
                <th>Solicitante ⇅</th>
                <th>Fecha de Registro ⇅</th>
                <th>Tipo de Trámite ⇅</th>
                <th>Días ⇅</th>
                <th>Estado ⇅</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRecent.map((r) => (
                <tr key={r.id} className="click" onClick={() => nav(`/requests/${r.id}`)}>
                  <td><span className="atlas-folio">{r.folio}</span></td>
                  <td><b>{r.requester?.full_name || user.full_name}</b></td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{TYPE[r.type] || r.type}</td>
                  <td>{r.days_requested ? `${r.days_requested} d` : '—'}</td>
                  <td><StatusBadge value={r.status} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="atlas-pill-btn">Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showVacationModal && (
        <Modal title="Desglose de Vacaciones y Prestaciones (LFT)" onClose={() => setShowVacationModal(false)}>
          <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: '#0f172a' }}>
                Expediente Vacacional de {user.full_name}
              </div>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                <div><b>Fecha de ingreso:</b> {user.hire_date || 'Pendiente de registrar por RRHH'}</div>
                <div><b>Antig?edad calculada:</b> {user.years_of_service ?? 0} a?o(s) de servicio</div>
                <div><b>D?as por ley al a?o:</b> <span className="status-badge approved" style={{ fontSize: 12 }}>{user.vacation_entitlement ?? 0} d?as</span></div>
                <div><b>D?as disponibles actuales:</b> <span className="status-badge pending" style={{ fontSize: 12 }}>{user.vacation_balance ?? 0} d?as</span></div>
                <div><b>D?as disfrutados este ciclo:</b> {Math.max(0, (user.vacation_entitlement ?? 0) - (user.vacation_balance ?? 0))} d?a(s)</div>
              </div>
            </div>

            <div style={{ background: '#ecfdf5', padding: 14, borderRadius: 8, marginBottom: 16, border: '1px solid #a7f3d0' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#065f46', marginBottom: 6 }}>
                ?? Prima Vacacional Legal (Art. 80 LFT - M?nimo 25%)
              </div>
              <div style={{ fontSize: 12, color: '#047857', marginBottom: 8, lineHeight: 1.5 }}>
                La Ley Federal del Trabajo exige que el patr?n pague al menos el <b>25% sobre el salario correspondiente a los d?as de vacaciones</b> disfrutados.
              </div>
              <div className="row" style={{ gap: 16, fontSize: 13, color: '#064e3b' }}>
                <div><b>Sueldo mensual:</b> ${(user.salary || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</div>
                <div><b>Salario diario base:</b> ${(user.daily_wage || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</div>
                <div><b>Prima vacacional anual estimada (25%):</b> <span style={{ fontWeight: 700, fontSize: 14 }}>${(user.vacation_premium_estimated || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span></div>
              </div>
            </div>

            <div style={{ background: '#eff6ff', padding: 14, borderRadius: 8, marginBottom: 16, border: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1e40af', marginBottom: 4 }}>
                ??? Regla de Vacaciones Continuas (Art. 78 LFT - Vacaciones Dignas)
              </div>
              <div style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.5 }}>
                La ley exige que los trabajadores disfruten de <b>al menos 12 d?as continuos</b> de vacaciones. Los d?as restantes pueden distribuirse en las fechas que acuerden el empleado y el patr?n a lo largo del a?o.
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                Tabla Oficial de Vacaciones por Antig?edad (Reforma LFT 2023)
              </div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>A?os de antig?edad</th>
                    <th style={{ padding: '8px 10px' }}>D?as de vacaciones</th>
                    <th style={{ padding: '8px 10px' }}>Estatus en tu expediente</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { y: '1 a?o', days: 12, match: user.years_of_service === 1 },
                    { y: '2 a?os', days: 14, match: user.years_of_service === 2 },
                    { y: '3 a?os', days: 16, match: user.years_of_service === 3 },
                    { y: '4 a?os', days: 18, match: user.years_of_service === 4 },
                    { y: '5 a?os', days: 20, match: user.years_of_service === 5 },
                    { y: '6 a 10 a?os', days: 22, match: user.years_of_service >= 6 && user.years_of_service <= 10 },
                    { y: '11 a 15 a?os', days: 24, match: user.years_of_service >= 11 && user.years_of_service <= 15 },
                    { y: '16 a 20 a?os', days: 26, match: user.years_of_service >= 16 && user.years_of_service <= 20 },
                    { y: '21 a 25 a?os', days: 28, match: user.years_of_service >= 21 && user.years_of_service <= 25 },
                    { y: '26 a 30 a?os', days: 30, match: user.years_of_service >= 26 && user.years_of_service <= 30 },
                  ].map((row, idx) => (
                    <tr key={idx} style={{ background: row.match ? '#dcfce7' : idx % 2 === 0 ? '#fff' : '#f8fafc', fontWeight: row.match ? 600 : 400 }}>
                      <td style={{ padding: '8px 10px' }}>{row.y}</td>
                      <td style={{ padding: '8px 10px' }}><b>{row.days} d?as</b></td>
                      <td style={{ padding: '8px 10px' }}>
                        {row.match ? <span style={{ color: '#15803d', fontWeight: 700 }}>? Tu nivel actual ({user.years_of_service} a?os)</span> : '?'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                * A partir del 6? a?o, los d?as de vacaciones aumentan 2 d?as por cada 5 a?os de servicio (art. 76 LFT).
              </p>
            </div>
          </div>
          <div className="row end" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => setShowVacationModal(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
