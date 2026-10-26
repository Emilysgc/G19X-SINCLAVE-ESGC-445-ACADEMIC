import React, { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Loading, Alert } from '../components/ui.jsx'
import { TYPE } from '../services/labels'

export default function Reports() {
  const [a, setA] = useState(null)
  const [err, setErr] = useState('')
  const [viewPeriod, setViewPeriod] = useState('months') // 'months' | 'days'

  useEffect(() => {
    api.get('/analytics/overview')
      .then(setA)
      .catch((e) => setErr(e.message))
  }, [])

  if (!a && !err) return <Loading />
  if (err) return <Alert kind="err">{err}</Alert>

  const s = a?.summary

  // Datos para la gráfica según el selector de período real
  const chartData = viewPeriod === 'months'
    ? (a.monthly_trend || [])
    : (a.trend || []).map((t) => ({
        label: t.date.slice(5),
        created: t.created || t.count || 0,
        resolved: t.completed || t.resolved || 0,
      }))

  const maxVal = Math.max(1, ...chartData.map((d) => Math.max(d.created || 0, d.resolved || 0)))
  const totalChartActivity = chartData.reduce((acc, d) => acc + (d.created || 0) + (d.resolved || 0), 0)

  // Desglose de estado para la barra de estado operativa
  const approvedTotal = (s?.approved || 0) + (s?.completed || 0)
  const activeTotal = s?.active || 0
  const rejectedTotal = s?.rejected || 0
  const grandTotal = s?.total || 0

  const approvedPct = grandTotal > 0 ? Math.round((approvedTotal / grandTotal) * 100) : 0
  const activePct = grandTotal > 0 ? Math.round((activeTotal / grandTotal) * 100) : 0
  const rejectedPct = grandTotal > 0 ? Math.max(0, 100 - approvedPct - activePct) : 0

  return (
    <div className="rep-container">
      {/* ── Encabezado de la Sección ─────────────────────────────────── */}
      <div className="rep-header-block">
        <h1 className="rep-main-title">
          Reportes y Power BI
        </h1>
        <p className="rep-main-subtitle">
          Indicadores analíticos oficiales obtenidos en tiempo real de la base de datos de Recursos Humanos.
        </p>
      </div>

      {/* ── 4 Tarjetas de Métricas (100% Datos Reales) ───────────────── */}
      <div className="rep-kpi-grid">
        {/* Card 1: Total Colaboradores */}
        <div className="rep-kpi-card">
          <div className="rep-kpi-top">
            <span className="rep-kpi-title">Colaboradores Activos</span>
            <div className="rep-icon-badge purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <div className="rep-kpi-main">
            <span className="rep-kpi-num">
              {s?.total_employees != null ? s.total_employees : 'Sin datos'}
            </span>
          </div>
          <span className="rep-kpi-sub">Total en plantilla activa</span>
        </div>

        {/* Card 2: Solicitudes en Trámite */}
        <div className="rep-kpi-card">
          <div className="rep-kpi-top">
            <span className="rep-kpi-title">En Trámite Activo</span>
            <div className="rep-icon-badge teal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="rep-kpi-main">
            <span className="rep-kpi-num">{s?.active ?? 0}</span>
          </div>
          <span className="rep-kpi-sub">Pendientes de supervisor o RRHH</span>
        </div>

        {/* Card 3: Trámites Concluidos */}
        <div className="rep-kpi-card">
          <div className="rep-kpi-top">
            <span className="rep-kpi-title">Trámites Concluidos</span>
            <div className="rep-icon-badge purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
          <div className="rep-kpi-main">
            <span className="rep-kpi-num">{approvedTotal}</span>
          </div>
          <span className="rep-kpi-sub">
            {s?.auto_resolved_pct ? `${s.auto_resolved_pct}% aprobadas automáticamente` : 'Aprobadas o finalizadas'}
          </span>
        </div>

        {/* Card 4: Cumplimiento de SLA */}
        <div className="rep-kpi-card">
          <div className="rep-kpi-top">
            <span className="rep-kpi-title">Cumplimiento de SLA</span>
            <div className="rep-icon-badge teal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
              </svg>
            </div>
          </div>
          <div className="rep-kpi-main">
            <span className="rep-kpi-num">
              {s?.sla_compliance_pct != null ? `${s.sla_compliance_pct}%` : 'Sin datos'}
            </span>
          </div>
          <span className="rep-kpi-sub">
            {s?.avg_resolution_hours != null ? `Tiempo promedio: ${s.avg_resolution_hours} h` : 'Sin mediciones de SLA'}
          </span>
        </div>
      </div>

      {/* ── Fila Principal: Gráfica Dinámica + Estado de Solicitudes ── */}
      <div className="rep-main-grid">
        {/* Gráfica Real de Tendencia de Trámites */}
        <div className="rep-card rep-chart-card">
          <div className="rep-card-header">
            <div className="rep-title-group">
              <div className="rep-mini-icon purple">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <span className="rep-card-title">Tendencia Real de Solicitudes</span>
            </div>
            <select
              className="rep-select-pill"
              value={viewPeriod}
              onChange={(e) => setViewPeriod(e.target.value)}
            >
              <option value="months">Últimos 12 meses</option>
              <option value="days">Últimos 30 días</option>
            </select>
          </div>

          {/* Gráfico SVG generado dinámicamente con datos reales */}
          <div className="rep-attendance-chart">
            {totalChartActivity === 0 ? (
              <div className="rep-empty-notice">
                Sin solicitudes registradas en este período de análisis.
              </div>
            ) : (
              <svg viewBox="0 0 580 220" className="rep-svg-canvas" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="realPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Líneas guía horizontales */}
                <line x1="40" y1="50" x2="560" y2="50" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="40" y1="115" x2="560" y2="115" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="40" y1="180" x2="560" y2="180" stroke="#e2e8f0" />

                {/* Etiquetas de escala del eje Y */}
                <text x="10" y="54" fill="#94a3b8" fontSize="10">{maxVal}</text>
                <text x="10" y="119" fill="#94a3b8" fontSize="10">{Math.round(maxVal / 2)}</text>
                <text x="15" y="184" fill="#94a3b8" fontSize="10">0</text>

                {/* Columnas de barras reales */}
                {chartData.map((d, i) => {
                  const x = chartData.length > 1 ? (i / (chartData.length - 1)) * 520 + 30 : 270
                  const barH = (d.created / maxVal) * 125
                  const barY = 180 - barH
                  return (
                    <g key={i}>
                      <rect
                        x={x}
                        y={barY}
                        width="18"
                        height={Math.max(2, barH)}
                        rx="4"
                        fill="#06b6d4"
                        opacity="0.8"
                      >
                        <title>{`${d.label}: ${d.created} creadas, ${d.resolved} resueltas`}</title>
                      </rect>
                    </g>
                  )
                })}

                {/* Curva de área dinámica */}
                {(() => {
                  if (chartData.length < 2) return null
                  const pts = chartData.map((d, i) => {
                    const x = (i / (chartData.length - 1)) * 520 + 39
                    const y = 180 - (d.created / maxVal) * 125
                    return `${x},${y}`
                  })
                  const firstX = 39
                  const lastX = 559
                  const areaD = `M ${pts.join(' L ')} L ${lastX},180 L ${firstX},180 Z`
                  const lineD = `M ${pts.join(' L ')}`
                  return (
                    <>
                      <path d={areaD} fill="url(#realPurpleGrad)" />
                      <path d={lineD} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" />
                    </>
                  )
                })()}

                {/* Puntos y tooltips nativos en SVG */}
                {chartData.map((d, i) => {
                  const cx = chartData.length > 1 ? (i / (chartData.length - 1)) * 520 + 39 : 270
                  const cy = 180 - (d.created / maxVal) * 125
                  return (
                    <circle key={i} cx={cx} cy={cy} r="4" fill="#8b5cf6" stroke="#ffffff" strokeWidth="2">
                      <title>{`${d.label}: ${d.created} solicitudes`}</title>
                    </circle>
                  )
                })}
              </svg>
            )}

            {/* Eje X con etiquetas de períodos */}
            <div className="rep-chart-days">
              {chartData.map((d, i) => (
                <span key={i} className="rep-chart-col-label">
                  {d.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Estado de Solicitudes y Departamentos */}
        <div className="rep-side-column">
          {/* Card: Estado Operativo de Solicitudes */}
          <div className="rep-card">
            <div className="rep-card-header">
              <span className="rep-card-title">Estado Operativo de Trámites</span>
              <span className="rep-header-meta">Total: {grandTotal}</span>
            </div>

            {grandTotal === 0 ? (
              <p className="rep-empty-text">
                Sin solicitudes registradas para evaluar estado.
              </p>
            ) : (
              <>
                <div className="rep-status-bars">
                  {approvedPct > 0 && (
                    <div className="rep-status-bar teal" style={{ flex: approvedPct }} title={`Aprobadas: ${approvedTotal} (${approvedPct}%)`} />
                  )}
                  {activePct > 0 && (
                    <div className="rep-status-bar purple" style={{ flex: activePct }} title={`En trámite: ${activeTotal} (${activePct}%)`} />
                  )}
                  {rejectedPct > 0 && (
                    <div className="rep-status-bar rose" style={{ flex: rejectedPct }} title={`Rechazadas: ${rejectedTotal} (${rejectedPct}%)`} />
                  )}
                </div>

                <div className="rep-status-legend">
                  <div className="rep-status-item">
                    <span className="rep-status-lbl">Aprobadas</span>
                    <b className="rep-color-teal">{approvedTotal}</b>
                  </div>
                  <div className="rep-status-item">
                    <span className="rep-status-lbl">En Trámite</span>
                    <b className="rep-color-purple">{activeTotal}</b>
                  </div>
                  <div className="rep-status-item">
                    <span className="rep-status-lbl">Rechazadas</span>
                    <b className="rep-color-rose">{rejectedTotal}</b>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Card: Distribución Real por Departamento */}
          <div className="rep-card">
            <div className="rep-card-header">
              <span className="rep-card-title">Distribución por Departamento</span>
            </div>

            {(!a.by_department || a.by_department.length === 0) ? (
              <p className="rep-empty-text">
                Sin datos por departamento todavía.
              </p>
            ) : (
              <div className="rep-dept-list">
                {a.by_department.slice(0, 5).map((dept) => {
                  const deptPct = grandTotal > 0 ? Math.round((dept.count / grandTotal) * 100) : 0
                  return (
                    <div key={dept.department}>
                      <div className="rep-dept-row">
                        <span className="rep-dept-name">{dept.department}</span>
                        <span className="rep-header-meta">{dept.count} ({deptPct}%)</span>
                      </div>
                      <div className="rep-bar-track">
                        <div
                          className="rep-bar-fill teal-bg"
                          style={{
                            width: `${Math.min(100, Math.max(8, deptPct))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabla Inferior: Desglose Real de Trámites por Tipo ───────── */}
      <div className="rep-card rep-card-spaced">
        <div className="rep-card-header">
          <div className="rep-title-group">
            <div className="rep-mini-icon purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <span className="rep-card-title">Desglose de Trámites por Tipo</span>
          </div>
          <span className="rep-header-meta">{a.by_type?.length || 0} tipos con actividad</span>
        </div>

        {(!a.by_type || a.by_type.length === 0) ? (
          <p className="rep-empty-notice">
            Sin trámites registrados todavía en el sistema.
          </p>
        ) : (
          <table className="rep-table">
            <thead>
              <tr>
                <th>Tipo de Solicitud</th>
                <th className="rep-th-center">Total Solicitudes</th>
                <th>Proporción del Volumen</th>
              </tr>
            </thead>
            <tbody>
              {a.by_type.map((item, idx) => {
                const typePct = grandTotal > 0 ? Math.round((item.count / grandTotal) * 100) : 0
                return (
                  <tr key={item.type}>
                    <td>
                      <div className="rep-type-cell">
                        <div className={`rep-avatar-circle ${idx % 2 === 0 ? 'purple-bg' : 'teal-bg'}`}>
                          {(TYPE[item.type] || item.type).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <b>{TYPE[item.type] || item.type}</b>
                        </div>
                      </div>
                    </td>
                    <td className="rep-td-center">
                      <b>{item.count}</b>
                    </td>
                    <td>
                      <div className="rep-table-metric-group">
                        <div className="rep-bar-track">
                          <div
                            className={`rep-bar-fill ${idx % 2 === 0 ? 'purple-bg' : 'teal-bg'}`}
                            style={{
                              width: `${Math.min(100, Math.max(6, typePct))}%`,
                            }}
                          />
                        </div>
                        <span className="rep-table-pct">
                          {typePct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Tablero de Power BI Integrado ─────────────────────────── */}
      {a.powerbi_report_url && (
        <div className="rep-card rep-card-spaced">
          <div className="rep-card-header">
            <div className="rep-title-group">
              <div className="rep-mini-icon teal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <span className="rep-card-title">Tablero Analítico Ejecutivo (Power BI)</span>
            </div>
          </div>
          <iframe
            title="Power BI"
            src={a.powerbi_report_url}
            className="rep-powerbi-iframe"
            allowFullScreen
          />
        </div>
      )}
    </div>
  )
}
