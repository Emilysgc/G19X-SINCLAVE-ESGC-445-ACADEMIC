import React from 'react'
import { STATUS, PRIORITY, RISK } from '../services/labels'

export const Badge = ({ map, value }) => { const [t, c] = map[value] || [value, 'gray']; return <span className={`badge ${c}`}>{t}</span> }
export const StatusBadge = ({ value }) => <Badge map={STATUS} value={value} />
export const PriorityBadge = ({ value }) => <Badge map={PRIORITY} value={value} />
export const RiskBadge = ({ value }) => (value ? <Badge map={RISK} value={value} /> : '—')

export const Alert = ({ kind = 'info', title, items, children }) => (
  <div className={`alert ${kind}`}>
    {title && <b>{title}</b>}
    {children}
    {items?.length > 0 && <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>}
  </div>
)

export const Modal = ({ title, onClose, children }) => (
  <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="m"><div className="row between"><h2>{title}</h2><button className="btn sm" onClick={onClose}>✕</button></div>{children}</div>
  </div>
)

export const Field = ({ label, children, hint }) => (<div><label>{label}</label>{children}{hint && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{hint}</div>}</div>)
export const Empty = ({ children }) => <div className="empty">{children}</div>
export const Loading = () => <div className="empty">Cargando…</div>

/* Iconos SVG en línea (estilo Lucide), sin dependencias externas */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  check: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  x: 'M18 6 6 18M6 6l12 12',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  maximize: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
  minimize: 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
}
export const Icon = ({ name, size = 18, stroke = 2, className = '', style }) => (
  <svg className={`ico ${className}`} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
)
export const initials = (name = '') => name.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export const UserAvatar = ({ user, className = '', onClick, title, style }) => {
  const [error, setError] = React.useState(false)
  const url = user?.avatar_url
  const showImg = Boolean(url && !error)

  return (
    <div className={`avatar ${className}`} onClick={onClick} title={title} style={style}>
      {showImg ? (
        <img
          src={url}
          alt=""
          className="avatar-img"
          onError={() => setError(true)}
        />
      ) : (
        <span className="avatar-txt">{initials(user?.full_name || '')}</span>
      )}
    </div>
  )
}
