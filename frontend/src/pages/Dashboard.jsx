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
                background: `conic-gradient(#06b6d4 0% ${resolvedPct}%, #22d3ee ${resolvedPct}% ${resolvedPct + Math.round(activePct / 2)}%, #e2e8f0 ${resolvedPct + Math.round(activePct / 2)}% 100%)`
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
                  <span className="dot" style={{ backgroundColor: "#06b6d4" }} />
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
                background: `conic-gradient(#06b6d4 0% ${s?.sla_compliance_pct ?? 100}%, #a5f3fc ${s?.sla_compliance_pct ?? 100}% 100%)`
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
            <span className="atlas-card-title"><span className="live-dot" /> Mis Vacaciones y Saldos</span>
          </div>
          <div className="atlas-truck-content">
            <div className="atlas-kpi-header-num">
              <span className="atlas-truck-big-val">{user.vacation_balance ?? 0}</span>
              <span className="atlas-trend-badge up">días disponibles</span>
            </div>
            <div style={{ fontSize: 12, color: '#44403c', marginTop: 4, marginBottom: 10, lineHeight: 1.4 }}>
              <b>{user.vacation_entitlement ?? 0} días por ley</b> ({user.years_of_service ?? 0} {user.years_of_service === 1 ? 'año' : 'años'} de antigüedad)
              <br />
              <span style={{ color: '#78716c' }}>
                {user.personal_leave_balance ?? 0} días permiso personal
              </span>
            </div>
            <button className="atlas-btn-track" onClick={() => nav('/requests/new')}>
              Nueva Solicitud
            </button>
            <button
              type="button"
              className="btn sm"
              style={{ marginTop: 8, width: '100%', fontSize: 11.5, background: '#fff', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 600 }}
              onClick={() => setShowVacationModal(true)}
            >
              🌴 Ver días por antigüedad y LFT
            </button>
            <div className="atlas-truck-graphic" aria-hidden="true">
              <svg width="100" height="50" viewBox="0 0 100 50" fill="none">
                <rect x="10" y="10" width="70" height="30" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
                <circle cx="28" cy="38" r="6" fill="#334155" />
                <circle cx="62" cy="38" r="6" fill="#334155" />
                <path d="M22 22h30" stroke="#06b6d4" strokeWidth="3" strokeLinecap="round" />
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
              <span className="legend-item"><span className="dot" style={{ backgroundColor: "#06b6d4" }} /> Este período</span>
              <span className="legend-item"><span className="dot dot-stone" /> Período anterior</span>
            </div>
          </div>

          {/* Curva SVG estilizada exacta Atlas con degradado naranja cálido */}
          <div className="atlas-chart-container">
            <svg viewBox="0 0 540 130" className="atlas-chart-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="atlasGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 0 95 Q 60 70 120 78 T 240 85 T 360 40 T 470 36 L 470 130 L 0 130 Z"
                fill="url(#atlasGrad)"
              />
              <path
                d="M 0 95 Q 60 70 120 78 T 240 85 T 360 40 T 470 36"
                fill="none"
                stroke="#06b6d4"
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
            <span className="dot" style={{ backgroundColor: "#06b6d4" }} /> Mayor
            <span className="dot" style={{ backgroundColor: "#22d3ee", marginLeft: 10 }} /> Medio
            <span className="dot" style={{ backgroundColor: "#a5f3fc", marginLeft: 10 }} /> Menor
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
                      backgroundColor: idx === 0 ? '#06b6d4' : idx === 1 ? '#22d3ee' : idx === 2 ? '#67e8f9' : '#a5f3fc'
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
        <Modal title="Días de Vacaciones y Antigüedad Laboral (LFT)" onClose={() => setShowVacationModal(false)}>
          <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 }}>
            {/* Tarjeta de resumen del empleado */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 10, marginBottom: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 10 }}>
                👤 Expediente del Colaborador: {user.full_name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
                <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11 }}>Fecha de ingreso</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{user.hire_date || 'Pendiente de registrar por RRHH'}</div>
                </div>
                <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11 }}>Antigüedad laboral</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#2563eb' }}>{user.years_of_service ?? 0} {user.years_of_service === 1 ? 'año' : 'años'} de servicio</div>
                </div>
                <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11 }}>Días correspondientes al año</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#16a34a' }}>{user.vacation_entitlement ?? 0} días por ley</div>
                </div>
                <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11 }}>Saldo actual disponible</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#ea580c' }}>{user.vacation_balance ?? 0} días restantes</div>
                </div>
                <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11 }}>Días disfrutados este ciclo</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{Math.max(0, (user.vacation_entitlement ?? 0) - (user.vacation_balance ?? 0))} días</div>
                </div>
              </div>
            </div>

            {/* Banner de Prima Vacacional */}
            <div style={{ background: '#ecfdf5', padding: 14, borderRadius: 8, marginBottom: 16, border: '1px solid #a7f3d0' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#065f46', marginBottom: 4 }}>
                💵 Prima Vacacional Legal (Art. 80 LFT - Mínimo 25%)
              </div>
              <div style={{ fontSize: 12, color: '#047857', marginBottom: 8, lineHeight: 1.5 }}>
                La Ley Federal del Trabajo exige que el patrón pague al trabajador al menos el <b>25% sobre el salario correspondiente a los días de vacaciones</b> disfrutados.
              </div>
              <div className="row" style={{ gap: 16, fontSize: 13, color: '#064e3b', flexWrap: 'wrap' }}>
                <div><b>Sueldo mensual:</b> ${(user.salary || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</div>
                <div><b>Salario diario base:</b> ${(user.daily_wage || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</div>
                <div><b>Prima vacacional anual estimada (25%):</b> <span style={{ fontWeight: 700, fontSize: 14, color: '#047857' }}>${(user.vacation_premium_estimated || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span></div>
              </div>
            </div>

            {/* Regla de vacaciones continuas */}
            <div style={{ background: '#eff6ff', padding: 14, borderRadius: 8, marginBottom: 16, border: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e40af', marginBottom: 4 }}>
                🏖️ Regla de Vacaciones Continuas (Art. 78 LFT - Vacaciones Dignas)
              </div>
              <div style={{ fontSize: 12.5, color: '#1e3a8a', lineHeight: 1.5 }}>
                La ley exige que los trabajadores disfruten de <b>al menos 12 días continuos</b> de vacaciones. Los días restantes pueden distribuirse en las fechas que acuerden libremente el colaborador y la empresa a lo largo del año.
              </div>
            </div>

            {/* Tabla LFT */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#0f172a' }}>
                📋 Tabla Oficial de Vacaciones por Años de Antigüedad (LFT México)
              </div>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '9px 12px' }}>Años de antigüedad</th>
                    <th style={{ padding: '9px 12px' }}>Días de vacaciones</th>
                    <th style={{ padding: '9px 12px' }}>Estatus en tu expediente</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { y: '1 año', days: 12, match: user.years_of_service === 1 },
                    { y: '2 años', days: 14, match: user.years_of_service === 2 },
                    { y: '3 años', days: 16, match: user.years_of_service === 3 },
                    { y: '4 años', days: 18, match: user.years_of_service === 4 },
                    { y: '5 años', days: 20, match: user.years_of_service === 5 },
                    { y: '6 a 10 años', days: 22, match: user.years_of_service >= 6 && user.years_of_service <= 10 },
                    { y: '11 a 15 años', days: 24, match: user.years_of_service >= 11 && user.years_of_service <= 15 },
                    { y: '16 a 20 años', days: 26, match: user.years_of_service >= 16 && user.years_of_service <= 20 },
                    { y: '21 a 25 años', days: 28, match: user.years_of_service >= 21 && user.years_of_service <= 25 },
                    { y: '26 a 30 años', days: 30, match: user.years_of_service >= 26 && user.years_of_service <= 30 },
                  ].map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        background: row.match ? '#dcfce7' : idx % 2 === 0 ? '#fff' : '#f8fafc',
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      <td style={{ padding: '9px 12px', fontWeight: row.match ? 700 : 400 }}>{row.y}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: row.match ? '#15803d' : '#0f172a' }}>{row.days} días</td>
                      <td style={{ padding: '9px 12px' }}>
                        {row.match ? (
                          <span style={{ color: '#15803d', fontWeight: 700, background: '#bbf7d0', padding: '3px 8px', borderRadius: 12, fontSize: 11.5 }}>
                            ✓ Tu nivel actual ({user.years_of_service} {user.years_of_service === 1 ? 'año' : 'años'})
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.4 }}>
                * <i>Conforme al artículo 76 de la Ley Federal del Trabajo:</i> A partir del 6º año de servicio, el periodo de vacaciones aumentará en 2 días por cada 5 años de servicio.
              </p>
            </div>
          </div>
          <div className="row end" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => setShowVacationModal(false)}>
              Entendido
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
