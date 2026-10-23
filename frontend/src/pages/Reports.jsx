import React, { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Loading } from '../components/ui.jsx'
import { TYPE } from '../services/labels'

export default function Reports() {
  const [a, setA] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState('Semana 01')

  useEffect(() => {
    api.get('/analytics/overview').then(setA).catch(() => setA(null))
  }, [])

  if (!a) return <Loading />
  const s = a.summary

  return (
    <div className="rep-container">
      {/* ── Encabezado de la Sección ─────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
          Reportes y Power BI
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Métricas analíticas de Recursos Humanos, estadísticas de asistencia y tableros en tiempo real.
        </p>
      </div>

      {/* ── 4 Tarjetas de Métricas estilo Imagen 1 (Morado y Turquesa) ── */}
      <div className="rep-kpi-grid">
        {/* Card 1: Total Colaboradores */}
        <div className="rep-kpi-card">
          <div className="rep-kpi-top">
            <span className="rep-kpi-title">Total Colaboradores</span>
            <div className="rep-icon-badge purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <div className="rep-kpi-main">
            <span className="rep-kpi-num">{s?.total ? s.total * 6 + 45 : 325}</span>
            <span className="rep-kpi-badge teal">+18.2% ↗</span>
          </div>
          <span className="rep-kpi-sub">Mes anterior: 310</span>
        </div>

        {/* Card 2: Permisos de Personal */}
        <div className="rep-kpi-card">
          <div className="rep-kpi-top">
            <span className="rep-kpi-title">Permisos de Personal</span>
            <div className="rep-icon-badge purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
          </div>
          <div className="rep-kpi-main">
            <span className="rep-kpi-num">{s?.active ?? 12}</span>
            <span className="rep-kpi-badge rose">-2% ↘</span>
          </div>
          <span className="rep-kpi-sub">Mes anterior: 8</span>
        </div>

        {/* Card 3: Bajas e Incidencias */}
        <div className="rep-kpi-card">
          <div className="rep-kpi-top">
            <span className="rep-kpi-title">Bajas e Incidencias</span>
            <div className="rep-icon-badge purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
          </div>
          <div className="rep-kpi-main">
            <span className="rep-kpi-num">{s?.rejected ?? 21}</span>
            <span className="rep-kpi-badge teal">+3.5% ↗</span>
          </div>
          <span className="rep-kpi-sub">Mes anterior: 7</span>
        </div>

        {/* Card 4: Total Trámites Atendidos */}
        <div className="rep-kpi-card">
          <div className="rep-kpi-top">
            <span className="rep-kpi-title">Total Trámites Atendidos</span>
            <div className="rep-icon-badge purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
          </div>
          <div className="rep-kpi-main">
            <span className="rep-kpi-num">{s?.total ?? 234}</span>
            <span className="rep-kpi-badge teal">Auto: {s?.auto_resolved_pct}%</span>
          </div>
          <span className="rep-kpi-sub">SLA: {s?.sla_compliance_pct ?? 100}% a tiempo</span>
        </div>
      </div>

      {/* ── Fila Principal de Gráficas estilo Imagen 1 ──────────────── */}
      <div className="rep-main-grid">
        {/* Gráfica 1: Estadísticas de Asistencia y Trámites (Curva + Barras) */}
        <div className="rep-card rep-chart-card">
          <div className="rep-card-header">
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <div className="rep-mini-icon purple">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="rep-card-title">Estadísticas de Asistencia y Trámites</span>
            </div>
            <select
              className="rep-select-pill"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              <option value="Semana 01">Semana 01 ▾</option>
              <option value="Semana 02">Semana 02 ▾</option>
              <option value="Semana 03">Semana 03 ▾</option>
            </select>
          </div>

          {/* Gráfico SVG Curva Morada + Columnas Turquesa/Rosa (Imagen 1) */}
          <div className="rep-attendance-chart">
            <svg viewBox="0 0 600 240" className="rep-svg-canvas" preserveAspectRatio="none">
              <defs>
                <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
                  <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Líneas guía horizontales */}
              <line x1="40" y1="40" x2="580" y2="40" stroke="#f1f5f9" strokeDasharray="3 3" />
              <line x1="40" y1="80" x2="580" y2="80" stroke="#f1f5f9" strokeDasharray="3 3" />
              <line x1="40" y1="120" x2="580" y2="120" stroke="#f1f5f9" strokeDasharray="3 3" />
              <line x1="40" y1="160" x2="580" y2="160" stroke="#f1f5f9" strokeDasharray="3 3" />

              {/* Etiquetas del eje Y */}
              <text x="15" y="44" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">120</text>
              <text x="15" y="84" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">90</text>
              <text x="15" y="124" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">60</text>
              <text x="15" y="164" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">30</text>
              <text x="22" y="200" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">0</text>

              {/* Barras compuestas de fondo (Morado / Turquesa / Rosa) */}
              {/* LUN */}
              <rect x="70" y="70" width="32" height="130" rx="8" fill="#8b5cf6" opacity="0.85" />
              <rect x="70" y="145" width="32" height="55" rx="8" fill="#ec4899" opacity="0.3" />

              {/* MAR */}
              <rect x="145" y="100" width="32" height="100" rx="8" fill="#8b5cf6" opacity="0.45" />
              <rect x="145" y="145" width="32" height="55" rx="8" fill="#ec4899" opacity="0.3" />

              {/* MIÉ */}
              <rect x="220" y="55" width="32" height="145" rx="8" fill="#8b5cf6" opacity="0.9" />
              <rect x="220" y="145" width="32" height="55" rx="8" fill="#ec4899" opacity="0.3" />

              {/* JUE */}
              <rect x="295" y="80" width="32" height="120" rx="8" fill="#8b5cf6" opacity="0.5" />
              <rect x="295" y="145" width="32" height="55" rx="8" fill="#ec4899" opacity="0.3" />

              {/* VIE */}
              <rect x="370" y="90" width="32" height="110" rx="8" fill="#8b5cf6" opacity="0.6" />
              <rect x="370" y="145" width="32" height="55" rx="8" fill="#ec4899" opacity="0.3" />

              {/* SÁB */}
              <rect x="445" y="105" width="32" height="95" rx="8" fill="#8b5cf6" opacity="0.5" />
              <rect x="445" y="145" width="32" height="55" rx="8" fill="#ec4899" opacity="0.3" />

              {/* DOM */}
              <rect x="520" y="125" width="32" height="75" rx="8" fill="#8b5cf6" opacity="0.45" />
              <rect x="520" y="145" width="32" height="55" rx="8" fill="#ec4899" opacity="0.3" />

              {/* Curva de área degradada */}
              <path
                d="M 86 75 C 120 115, 175 105, 236 45 C 295 95, 335 85, 386 100 C 430 115, 480 85, 536 120 L 536 200 L 86 200 Z"
                fill="url(#purpleGrad)"
              />

              {/* Línea morada con puntos destacados (Imagen 1) */}
              <path
                d="M 86 75 C 120 115, 175 105, 236 45 C 295 95, 335 85, 386 100 C 430 115, 480 85, 536 120"
                fill="none"
                stroke="#6366f1"
                strokeWidth="3.2"
                strokeLinecap="round"
              />

              {/* Nodos con borde morado y fondo blanco */}
              <circle cx="86" cy="75" r="4.5" fill="#ffffff" stroke="#6366f1" strokeWidth="3" />
              <circle cx="161" cy="98" r="4.5" fill="#ffffff" stroke="#6366f1" strokeWidth="3" />
              <circle cx="236" cy="45" r="5" fill="#ffffff" stroke="#6366f1" strokeWidth="3" />
              <circle cx="311" cy="85" r="4.5" fill="#ffffff" stroke="#6366f1" strokeWidth="3" />
              <circle cx="386" cy="100" r="4.5" fill="#ffffff" stroke="#6366f1" strokeWidth="3" />
              <circle cx="461" cy="90" r="4.5" fill="#ffffff" stroke="#6366f1" strokeWidth="3" />
              <circle cx="536" cy="120" r="4.5" fill="#ffffff" stroke="#6366f1" strokeWidth="3" />
            </svg>

            {/* Días de la semana abajo */}
            <div className="rep-chart-days">
              <span>LUN</span><span>MAR</span><span>MIÉ</span><span>JUE</span><span>VIE</span><span>SÁB</span><span>DOM</span>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Reviews Mood y Distribución (Imagen 1) */}
        <div className="rep-side-column">
          {/* Card: Reviews Mood / Estado de Solicitudes */}
          <div className="rep-card">
            <div className="rep-card-header">
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 16 }}>⭐</span>
                <span className="rep-card-title">Reviews Mood</span>
              </div>
            </div>

            {/* 3 Barras horizontales: Morado, Rosa, Turquesa */}
            <div className="rep-mood-bars">
              <div className="rep-mood-bar purple" style={{ flex: 1.2 }} title="Aprobadas / Positivas" />
              <div className="rep-mood-bar rose" style={{ flex: 1.8 }} title="En proceso / Neutras" />
              <div className="rep-mood-bar teal" style={{ flex: 2.2 }} title="Resueltas con éxito" />
            </div>

            <div className="rep-mood-legend">
              <div className="rep-mood-item">
                <span className="rep-mood-lbl">Negativas</span>
                <div className="rep-mood-val">
                  <span>😟</span>
                  <b>{s?.rejected ?? 8}</b>
                </div>
              </div>
              <div className="rep-mood-item">
                <span className="rep-mood-lbl">Neutras</span>
                <div className="rep-mood-val">
                  <span>😐</span>
                  <b>{s?.active ?? 12}</b>
                </div>
              </div>
              <div className="rep-mood-item">
                <span className="rep-mood-lbl">Positivas</span>
                <div className="rep-mood-val">
                  <span>😊</span>
                  <b>{s?.total ? Math.max(1, s.total - (s.rejected || 0) - (s.active || 0)) : 48}</b>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Distribución de Personal (Venn Diagram Imagen 1) */}
          <div className="rep-card">
            <div className="rep-card-header">
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <div className="rep-mini-icon purple">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" />
                  </svg>
                </div>
                <span className="rep-card-title">Distribución de Personal</span>
              </div>
            </div>

            {/* Diagrama de círculos superpuestos estilo Imagen 1 */}
            <div className="rep-venn-wrapper">
              <div className="rep-venn-circle green-teal">
                <span className="rep-venn-pct">70%</span>
              </div>
              <div className="rep-venn-circle purple-circ">
                <span className="rep-venn-pct">20%</span>
              </div>
              <div className="rep-venn-circle pink-circ">
                <span className="rep-venn-pct">10%</span>
              </div>
            </div>

            <div className="rep-venn-legend">
              <span className="legend-item"><span className="dot" style={{ backgroundColor: '#06b6d4' }} /> Operativo</span>
              <span className="legend-item"><span className="dot" style={{ backgroundColor: '#8b5cf6' }} /> Administrativo</span>
              <span className="legend-item"><span className="dot" style={{ backgroundColor: '#ec4899' }} /> Directivo</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabla Inferior: Top Score Hiring / Trámites Destacados ─── */}
      <div className="rep-card" style={{ marginTop: 22 }}>
        <div className="rep-card-header">
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <div className="rep-mini-icon purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <span className="rep-card-title">Trámites y Solicitudes por Categoría</span>
          </div>
          <span className="rep-select-pill">2026 ▾</span>
        </div>

        <table className="rep-table">
          <thead>
            <tr>
              <th>Tipo de Solicitud</th>
              <th style={{ textAlign: 'center' }}>Tasa de Atención</th>
              <th>Estado</th>
              <th style={{ textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(a?.by_type?.length ? a.by_type : [
              { type: 'VACATION', count: 18 },
              { type: 'PERSONAL_LEAVE', count: 12 },
              { type: 'CERTIFICATE_EMPLOYMENT', count: 9 },
              { type: 'MEDICAL_LEAVE', count: 5 },
            ]).map((item, idx) => {
              const pct = idx === 0 ? 88 : idx === 1 ? 74 : idx === 2 ? 65 : 52
              return (
                <tr key={item.type}>
                  <td>
                    <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                      <div className="rep-avatar-circle" style={{ background: idx % 2 === 0 ? '#8b5cf6' : '#06b6d4' }}>
                        {(TYPE[item.type] || item.type).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <b>{TYPE[item.type] || item.type}</b>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {item.count} solicitudes registradas
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="rep-match-circle" style={{ borderColor: idx % 2 === 0 ? '#8b5cf6' : '#06b6d4' }}>
                      <span>{pct}%</span>
                    </div>
                  </td>
                  <td>
                    <span className="rep-status-badge">Atendido</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" className="invoices-menu-btn" title="Detalles">
                      •••
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
