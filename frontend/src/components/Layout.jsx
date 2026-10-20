import React, { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../services/auth.jsx'
import { api } from '../services/api'
import { ROLE, fmtDateTime } from '../services/labels'
import { Icon, initials, UserAvatar, Modal } from './ui.jsx'
import Chat from './Chat.jsx'

const TITLES = [
  ['/requests/new', 'Nueva solicitud'],
  ['/requests/', 'Detalle de solicitud'],
  ['/requests', 'Solicitudes'],
  ['/calendar', 'Calendario'],
  ['/approvals', 'Bandeja de aprobación'],
  ['/reports', 'Reportes y Power BI'],
  ['/admin', 'Administración'],
  ['/settings', 'Configuración de cuenta'],
]

export default function Layout() {
  const { user, logout, config } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [notes, setNotes] = useState({ unread: 0, items: [] })
  const [open, setOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmLogout, setConfirmLogout] = useState(false)
  const closeChat = useCallback(() => setChatOpen(false), [])

  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light')
  useEffect(() => {
    localStorage.setItem('app_theme', theme)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark-theme')
    } else {
      document.documentElement.classList.remove('dark-theme')
    }
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  const load = useCallback(async () => {
    try {
      setNotes(await api.get('/notifications'))
    } catch {
      /* sesión expirada */
    }
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])
  const isApprover = ['MANAGER', 'HR_ADMIN', 'SYSTEM_ADMIN'].includes(user.role)
  const isHR = ['HR_ADMIN', 'SYSTEM_ADMIN'].includes(user.role)
  const title = pathname === '/' ? 'Inicio' : (TITLES.find(([p]) => pathname.startsWith(p)) || [, ''])[1]

  const openNote = async (n) => {
    await api.post(`/notifications/${n.id}/read`)
    setOpen(false)
    load()
    if (n.request_id) nav(`/requests/${n.request_id}`)
  }
  const readAll = async () => {
    await api.post('/notifications/read-all')
    load()
  }

  const Item = ({ to, icon, children, end }) => (
    <NavLink to={to} end={end}><Icon name={icon} size={18} /><span>{children}</span></NavLink>
  )

  return (
    <div className={`layout ${chatOpen ? 'with-chat' : ''}`}>
      <aside className="side">
        <div className="logo">
          <div className="logo-mark">{initials(config?.company_name || 'RH') || 'RH'}</div>
          <div>
            <div className="logo-name">{config?.company_name || 'RRHH'}</div>
            <div className="logo-sub">Solicitudes internas</div>
          </div>
        </div>
        <div className="side-label">General</div>
        <Item to="/" icon="home" end>Inicio</Item>
        <Item to="/requests/new" icon="plus">Nueva solicitud</Item>
        <Item to="/requests" icon="list" end>Mis solicitudes</Item>
        <Item to="/calendar" icon="calendar">Calendario</Item>
        {(isApprover || isHR) && <div className="side-label">Gestión</div>}
        {isApprover && <Item to="/approvals" icon="check">Bandeja de aprobación</Item>}
        {isHR && <Item to="/reports" icon="chart">Reportes y Power BI</Item>}
        {isHR && <Item to="/admin" icon="settings">Administración</Item>}
        <div className="sp" />
        <div className="me">
          <UserAvatar user={user} onClick={() => nav('/settings')} title="Ir a configuración" />
          <div className="me-info" onClick={() => nav('/settings')} style={{ cursor: 'pointer' }}>
            <div className="me-name">{user.full_name}</div>
            <div className="me-role">{ROLE[user.role]}</div>
          </div>
          <button className="icon-btn dark" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={logout}>
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="top atlas-main-top">
          <div className="top-title">{title}</div>

          <div className="atlas-global-search">
            <Icon name="search" size={16} />
            <input
              type="text"
              placeholder="Buscar por folio, tipo o descripción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  nav(`/requests?q=${encodeURIComponent(searchQuery.trim())}`)
                }
              }}
            />
          </div>

          <div className="top-actions-cluster">
            <button
              className="icon-btn theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label="Alternar tema"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
            <button className={`ai-toggle ${chatOpen ? 'on' : ''}`} onClick={() => setChatOpen(!chatOpen)} aria-pressed={chatOpen}>
              <Icon name="sparkles" size={16} /> Asistente IA
            </button>
            <button className="icon-btn bell" onClick={() => setOpen(!open)} aria-label="Notificaciones">
              <Icon name="bell" size={19} />
              {notes.unread > 0 && <b>{notes.unread}</b>}
            </button>
            <div className="top-user-pill" onClick={() => nav('/settings')} title="Ir a configuración">
              <UserAvatar className="sm" user={user} />
              <div className="top-user-meta">
                <span className="top-user-name">{user.full_name}</span>
                <span className="top-user-role">{ROLE[user.role] || user.role}</span>
              </div>
            </div>
          </div>
        </div>
        {open && (
          <div className="pop">
            <div className="n row between">
              <b>Notificaciones</b>
              {notes.unread > 0 && (
                <a href="#" onClick={(e) => { e.preventDefault(); readAll() }}>Marcar todas</a>
              )}
            </div>
            {notes.items.length === 0 && <div className="n muted">Sin notificaciones.</div>}
            {notes.items.map((n) => (
              <div key={n.id} className={`n ${n.is_read ? '' : 'unread'}`} style={{ cursor: 'pointer' }} onClick={() => openNote(n)}>
                <b>{n.title}</b>
                <div>{n.message}</div>
                <div className="muted" style={{ fontSize: 11 }}>{fmtDateTime(n.created_at)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="content">
          <Outlet context={{ reloadNotes: load, globalSearch: searchQuery }} />
        </div>
      </div>

            {confirmLogout && (
        <Modal title="Confirmar cierre de sesi?n" onClose={() => setConfirmLogout(false)}>
          <p style={{ marginTop: 8, marginBottom: 20 }}>
            ?Est?s seguro de que deseas cerrar tu sesi?n en <b>PluriOne S.A. de C.V.</b>?
          </p>
          <div className="row end" style={{ gap: 10 }}>
            <button className="btn" type="button" onClick={() => setConfirmLogout(false)}>
              Cancelar
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                setConfirmLogout(false)
                logout()
              }}
            >
              Cerrar sesi?n
            </button>
          </div>
        </Modal>
      )}

      <Chat open={chatOpen} onClose={closeChat} />
    </div>
  )
}
