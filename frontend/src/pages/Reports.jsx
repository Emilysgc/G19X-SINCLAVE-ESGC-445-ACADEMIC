import React, { useEffect, useState, useMemo } from 'react'
import { api } from '../services/api'
import { Loading } from '../components/ui.jsx'
import { TYPE } from '../services/labels'

export default function Reports() {
  const [a, setA] = useState(null)
  const [viewPeriod, setViewPeriod] = useState('months') // 'months' o 'days'

  useEffect(() => {
    api.get('/analytics/overview').then(setA).catch(() => setA(null))
  }, [])

  const s = a?.summary

  // Datos de tendencia según el período seleccionado
  const chartData = useMemo(() => {
    if (!a) return []
    if (viewPeriod === 'days') {
      return (a.trend || []).map((t) => ({
        label: t.date.slice(5),
        created: t.created || 0,
        resolved: t.resolved || 0,
      }))
    }
    return (a.monthly_trend || []).map((t) => ({
      label: t.label,
      created: t.created || 0,
      resolved: t.resolved || 0,
    }))
  }, [a, viewPeriod])

  if (!a) return <Loading />

  // Cálculo de coordenadas dinámicas para el gráfico SVG real
  const maxVal = Math.max(1, ...chartData.map((d) => Math.max(d.created, d.resolved)))
  const totalChartActivity = chartData.reduce((acc, d) => acc + d.created + d.resolved, 0)

  const points = chartData.map((d, i) => {
    const x = chartData.length > 1 ? (i / (chartData.length - 1)) * 520 + 40 : 280
    const y = 175 - (d.created / maxVal) * 125
    return `${x},${y}`
  })
  const curvePath = points.length > 1 ? `M ${points.join(' L ')}` : ''
  const areaPath =
    points.length > 1
      ? `M ${points[0]} L ${points.join(' L ')} L ${chartData.length > 1 ? (chartData.length - 1) / (chartData.length - 1) * 520 + 40 : 540},180 L 40,180 Z`
      : ''

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
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
          Reportes y Power BI
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
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
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
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

          {/* Gráfico SVG generado 100% dinámicamente con los datos reales */}
          <div className="rep-attendance-chart">
            {totalChartActivity === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
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
                {areaPath && <path d={areaPath} fill="url(#realPurpleGrad)" />}
                {curvePath && (
                  <path
                    d={curvePath}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Puntos destacados sobre la curva */}
                {chartData.map((d, i) => {
                  const x = chartData.length > 1 ? (i / (chartData.length - 1)) * 520 + 40 : 280
                  const y = 175 - (d.created / maxVal) * 125
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#ffffff"
                      stroke="#8b5cf6"
                      strokeWidth="2.5"
                    >
                      <title>{`${d.label}: ${d.created} solicitudes`}</title>
                    </circle>
                  )
                })}
              </svg>
            )}

            {/* Etiquetas del eje X */}
            <div className="rep-chart-days">
              {chartData.map((d, i) => (
                <span key={i} style={{ fontSize: 10.5, flex: 1, textAlign: 'center' }}>
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
              <span className="muted" style={{ fontSize: 12 }}>Total: {grandTotal}</span>
            </div>

            {grandTotal === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
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
                    <b style={{ color: '#0891b2' }}>{approvedTotal}</b>
                  </div>
                  <div className="rep-status-item">
                    <span className="rep-status-lbl">En Trámite</span>
                    <b style={{ color: '#8b5cf6' }}>{activeTotal}</b>
                  </div>
                  <div className="rep-status-item">
                    <span className="rep-status-lbl">Rechazadas</span>
                    <b style={{ color: '#e11d48' }}>{rejectedTotal}</b>
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
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                Sin datos por departamento todavía.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {a.by_department.slice(0, 5).map((dept) => {
                  const deptPct = grandTotal > 0 ? Math.round((dept.count / grandTotal) * 100) : 0
                  return (
                    <div key={dept.department}>
                      <div className="row between" style={{ fontSize: 12, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600 }}>{dept.department}</span>
                        <span className="muted">{dept.count} ({deptPct}%)</span>
                      </div>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(8, deptPct))}%`,
                            background: '#06b6d4',
                            borderRadius: 4,
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
      <div className="rep-card" style={{ marginTop: 22 }}>
        <div className="rep-card-header">
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <div className="rep-mini-icon purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <span className="rep-card-title">Desglose de Trámites por Tipo</span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>{a.by_type?.length || 0} tipos con actividad</span>
        </div>

        {(!a.by_type || a.by_type.length === 0) ? (
          <p className="muted" style={{ padding: '24px 16px', textAlign: 'center', margin: 0 }}>
            Sin trámites registrados todavía en el sistema.
          </p>
        ) : (
          <table className="rep-table">
            <thead>
              <tr>
                <th>Tipo de Solicitud</th>
                <th style={{ textAlign: 'center' }}>Total Solicitudes</th>
                <th>Proporción del Volumen</th>
              </tr>
            </thead>
            <tbody>
              {a.by_type.map((item, idx) => {
                const typePct = grandTotal > 0 ? Math.round((item.count / grandTotal) * 100) : 0
                return (
                  <tr key={item.type}>
                    <td>
                      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                        <div
                          className="rep-avatar-circle"
                          style={{ background: idx % 2 === 0 ? '#8b5cf6' : '#06b6d4' }}
                        >
                          {(TYPE[item.type] || item.type).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <b>{TYPE[item.type] || item.type}</b>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <b>{item.count}</b>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 220 }}>
                        <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, Math.max(6, typePct))}%`,
                              background: idx % 2 === 0 ? '#8b5cf6' : '#06b6d4',
                              borderRadius: 4,
                            }}
                          />
                        </div>
                        <span className="muted" style={{ fontSize: 12, minWidth: 38 }}>
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
        <div className="rep-card" style={{ marginTop: 22 }}>
          <div className="rep-card-header">
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
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
            style={{ width: '100%', height: 560, border: 0, borderRadius: 12 }}
            allowFullScreen
          />
        </div>
      )}
    </div>
  )
}
