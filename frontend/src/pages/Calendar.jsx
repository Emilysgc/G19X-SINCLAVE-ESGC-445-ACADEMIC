import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Loading, StatusBadge, Modal, Icon, initials, UserAvatar, Field } from '../components/ui.jsx'
import { TYPE, fmtDate } from '../services/labels'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function toDateString(year, month, day) {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

export default function Calendar() {
  const { user } = useAuth()
  const nav = useNavigate()
  const today = useMemo(() => new Date(), [])

  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedDayEvents, setSelectedDayEvents] = useState(null)
  const [selectedDate, setSelectedDate] = useState(() => toDateString(today.getFullYear(), today.getMonth(), today.getDate()))

  // Notas y actividades locales del usuario
  const [activities, setActivities] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hr_user_activities') || '[]')
    } catch {
      return []
    }
  })

  const [modalNew, setModalNew] = useState(false)
  const [actTitle, setActTitle] = useState('')
  const [actDate, setActDate] = useState(() => toDateString(today.getFullYear(), today.getMonth(), today.getDate()))
  const [actType, setActType] = useState('Actividad')
  const [actDesc, setActDesc] = useState('')

  useEffect(() => {
    let cancel = false
    setLoading(true)
    api.get('/requests?limit=150')
      .then((res) => {
        if (!cancel) {
          setRequests(res.items || [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancel) {
          setRequests([])
          setLoading(false)
        }
      })

    // Sincronizar notas persistidas en el backend
    api.get('/users/me/calendar-notes')
      .then((notes) => {
        if (!cancel && Array.isArray(notes)) {
          setActivities(notes)
          try {
            localStorage.setItem('hr_user_activities', JSON.stringify(notes))
          } catch {}
        }
      })
      .catch(() => {})

    return () => { cancel = true }
  }, [currentYear, currentMonth])

  // Guardar nueva actividad o nota en el backend
  const handleSaveActivity = async (e) => {
    e.preventDefault()
    if (!actTitle.trim()) return

    const payload = {
      title: actTitle.trim(),
      date: actDate,
      type: actType,
      description: actDesc.trim() || null,
    }

    try {
      const created = await api.post('/users/me/calendar-notes', payload)
      const updated = [created, ...activities.filter((a) => a.id !== created.id)]
      setActivities(updated)
      try { localStorage.setItem('hr_user_activities', JSON.stringify(updated)) } catch {}
    } catch {
      // Respaldo local
      const newAct = {
        id: 'act_' + Date.now(),
        title: actTitle.trim(),
        start_date: actDate,
        end_date: actDate,
        type: actType,
        description: actDesc.trim(),
        isCustomActivity: true,
        requester: { full_name: user?.full_name || 'Usuario' },
        created_at: new Date().toISOString()
      }
      const updated = [newAct, ...activities]
      setActivities(updated)
      try { localStorage.setItem('hr_user_activities', JSON.stringify(updated)) } catch {}
    }

    setModalNew(false)
    setActTitle('')
    setActDesc('')
  }

  // Eliminar actividad o nota personalizada en el backend
  const handleDeleteActivity = async (id) => {
    try {
      await api.del(`/users/me/calendar-notes/${id}`)
    } catch {
      // Continuar eliminando localmente
    }
    const updated = activities.filter((a) => a.id !== id)
    setActivities(updated)
    try { localStorage.setItem('hr_user_activities', JSON.stringify(updated)) } catch {}
    setSelectedEvent(null)
  }

  // Combinar solicitudes del servidor con actividades/notas
  const allEvents = useMemo(() => {
    return [...requests, ...activities]
  }, [requests, activities])

  // Matriz de días
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1)
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate()
    const startDayOfWeek = firstDay.getDay()

    const daysPrevMonth = new Date(currentYear, currentMonth, 0).getDate()
    const days = []

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = daysPrevMonth - i
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear
      days.push({
        day: d,
        month: prevM,
        year: prevY,
        dateStr: toDateString(prevY, prevM, d),
        currentMonth: false,
      })
    }

    for (let d = 1; d <= totalDays; d++) {
      days.push({
        day: d,
        month: currentMonth,
        year: currentYear,
        dateStr: toDateString(currentYear, currentMonth, d),
        currentMonth: true,
      })
    }

    const remaining = (7 - (days.length % 7)) % 7
    for (let d = 1; d <= remaining; d++) {
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear
      days.push({
        day: d,
        month: nextM,
        year: nextY,
        dateStr: toDateString(nextY, nextM, d),
        currentMonth: false,
      })
    }

    return days
  }, [currentYear, currentMonth])

  // Agrupar eventos por fecha
  const eventsByDate = useMemo(() => {
    const map = {}
    allEvents.forEach((r) => {
      if (!r.start_date) return
      const start = r.start_date.slice(0, 10)
      const end = (r.end_date || r.start_date).slice(0, 10)

      const [sy, sm, sd] = start.split('-').map(Number)
      const [ey, em, ed] = end.split('-').map(Number)
      const cur = new Date(sy, sm - 1, sd)
      const last = new Date(ey, em - 1, ed)

      while (cur <= last) {
        const ds = toDateString(cur.getFullYear(), cur.getMonth(), cur.getDate())
        if (!map[ds]) map[ds] = []
        map[ds].push(r)
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [allEvents])

  // Lista de eventos del mes actual para la barra lateral
  const monthEvents = useMemo(() => {
    return allEvents
      .filter((r) => {
        if (!r.start_date) return false
        const [y, m] = r.start_date.slice(0, 7).split('-').map(Number)
        return y === currentYear && m === currentMonth + 1
      })
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
  }, [allEvents, currentYear, currentMonth])

  const dotColorClass = (idx) => {
    const colors = ['dot-mint', 'dot-coral', 'dot-lavender', 'dot-amber', 'dot-sky']
    return colors[idx % colors.length]
  }

  return (
    <div className="cal-tri-layout">
      {/* 1. Columna Izquierda: Años y lista vertical de meses en español */}
      <aside className="cal-left-sidebar">
        <div className="cal-year-nav">
          <button onClick={() => setCurrentYear((y) => y - 1)} className="cal-nav-arr" title="Año anterior">‹</button>
          <span className="cal-year-num">{currentYear}</span>
          <button onClick={() => setCurrentYear((y) => y + 1)} className="cal-nav-arr" title="Año siguiente">›</button>
        </div>

        <nav className="cal-month-list">
          {MONTHS_ES.map((name, idx) => (
            <button
              key={name}
              className={`cal-month-item ${idx === currentMonth ? 'active' : ''}`}
              onClick={() => setCurrentMonth(idx)}
            >
              <span>{name}</span>
              <span className="cal-month-count">
                {allEvents.filter((r) => r.start_date && Number(r.start_date.slice(5, 7)) === idx + 1).length || ''}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      {/* 2. Columna Central: Cuadrícula con días en español */}
      <main className="cal-center-grid">
        <header className="cal-center-header">
          <h2 className="cal-month-big">{MONTHS_ES[currentMonth].toUpperCase()}</h2>
          <div className="cal-top-profile-badge">
            <UserAvatar user={user} className="cal-user-avatar" onClick={() => nav('/settings')} title="Ir a configuración" />
            <button
              type="button"
              className="cal-add-floating-btn"
              onClick={() => setModalNew(true)}
              title="Agregar actividad o nota"
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
        </header>

        <div className="cal-circle-grid">
          <div className="cal-weekdays-row">
            {DAYS.map((d) => (
              <div key={d} className="cal-th-day">{d}</div>
            ))}
          </div>

          <div className="cal-days-body">
            {calendarDays.map((cd, i) => {
              const events = eventsByDate[cd.dateStr] || []
              const hasEvents = events.length > 0
              const isToday = cd.dateStr === toDateString(today.getFullYear(), today.getMonth(), today.getDate())
              const isSelected = cd.dateStr === selectedDate

              return (
                <div
                  key={i}
                  className={`cal-day-slot ${!cd.currentMonth ? 'cal-muted-slot' : ''}`}
                  onClick={() => {
                    setSelectedDate(cd.dateStr)
                    setActDate(cd.dateStr)
                    if (hasEvents) {
                      setSelectedDayEvents({ date: cd.dateStr, events })
                    }
                  }}
                >
                  <div
                    className={`cal-day-bubble ${isSelected ? 'cal-day-selected' : ''} ${hasEvents ? dotColorClass(cd.day) : ''} ${isToday && !hasEvents && !isSelected ? 'cal-today-ring' : ''}`}
                  >
                    {cd.day}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* 3. Columna Derecha: Timeline vertical de eventos */}
      <aside className="cal-right-sidebar">
        <div className="cal-timeline-header">
          <div className="cal-selected-badge" title="Día seleccionado">
            <span>Día: </span>
            <b>{selectedDate ? fmtDate(selectedDate) : 'Hoy'}</b>
          </div>
          <button
            onClick={() => setCurrentMonth((m) => (m === 11 ? 0 : m + 1))}
            className="cal-next-month-btn"
            title="Siguiente mes"
          >
            ›
          </button>
        </div>

        <div className="cal-timeline-body">
          {monthEvents.length === 0 ? (
            <div className="muted" style={{ padding: '24px 16px', fontSize: 13, textAlign: 'center' }}>
              Sin actividades ni trámites para este mes.
            </div>
          ) : (
            <div className="cal-timeline-list">
              {monthEvents.map((ev, idx) => (
                <div key={ev.id} className="cal-timeline-item" onClick={() => setSelectedEvent(ev)}>
                  <div className="cal-timeline-axis">
                    <span className={`cal-timeline-dot ${dotColorClass(idx)}`} />
                    <span className="cal-timeline-line" />
                  </div>
                  <div className="cal-timeline-card">
                    <div className="cal-timeline-time">{fmtDate(ev.start_date)}</div>
                    <div className="cal-timeline-title">
                      {ev.isCustomActivity ? `📌 ${ev.title}` : (ev.title || TYPE[ev.type])}
                    </div>
                    <div className="cal-timeline-person">
                      {ev.isCustomActivity ? ev.type : (ev.requester?.full_name || user.full_name)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cal-timeline-footer">
          <button
            type="button"
            className="cal-bottom-action-btn"
            onClick={() => setModalNew(true)}
          >
            + Agregar actividad o nota
          </button>
        </div>
      </aside>

      {/* Modal: Agregar Actividad o Nota */}
      {modalNew && (
        <Modal title="Agregar actividad o nota personal" onClose={() => setModalNew(false)}>
          <form onSubmit={handleSaveActivity}>
            <Field label="Título de la actividad o nota">
              <input
                required
                placeholder="Ej. Reunión de equipo, Revisión con supervisor..."
                value={actTitle}
                onChange={(e) => setActTitle(e.target.value)}
              />
            </Field>

            <div className="row" style={{ gap: 12 }}>
              <div className="f1">
                <Field label="Fecha">
                  <input
                    type="date"
                    required
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                  />
                </Field>
              </div>
              <div className="f1">
                <Field label="Categoría">
                  <select value={actType} onChange={(e) => setActType(e.target.value)}>
                    <option value="Actividad">Actividad</option>
                    <option value="Nota">Nota</option>
                    <option value="Recordatorio">Recordatorio</option>
                    <option value="Reunión">Reunión interna</option>
                  </select>
                </Field>
              </div>
            </div>

            <Field label="Detalle o descripción (opcional)">
              <textarea
                style={{ minHeight: 80 }}
                placeholder="Escribe notas adicionales o recordatorios..."
                value={actDesc}
                onChange={(e) => setActDesc(e.target.value)}
              />
            </Field>

            <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn" onClick={() => setModalNew(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn primary">
                Guardar en calendario
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal de Detalle de Evento */}
      {selectedEvent && (
        <Modal
          title={selectedEvent.isCustomActivity ? `Actividad: ${selectedEvent.title}` : `Solicitud ${selectedEvent.folio || ''}`}
          onClose={() => setSelectedEvent(null)}
        >
          <div style={{ padding: '4px 0' }}>
            <div className="row between" style={{ marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  {selectedEvent.isCustomActivity ? selectedEvent.title : (selectedEvent.title || TYPE[selectedEvent.type])}
                </h3>
                <span className="muted">
                  {fmtDate(selectedEvent.start_date)}
                  {selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.start_date && ` al ${fmtDate(selectedEvent.end_date)}`}
                </span>
              </div>
              {selectedEvent.isCustomActivity ? (
                <span className="badge blue">{selectedEvent.type}</span>
              ) : (
                <StatusBadge value={selectedEvent.status} />
              )}
            </div>

            <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {selectedEvent.description || 'Sin notas adicionales.'}
            </p>

            <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end', gap: 10 }}>
              {selectedEvent.isCustomActivity ? (
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => handleDeleteActivity(selectedEvent.id)}
                >
                  Eliminar nota
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => nav(`/requests/${selectedEvent.id}`)}
                >
                  Ver solicitud completa
                </button>
              )}
              <button type="button" className="btn" onClick={() => setSelectedEvent(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de eventos del día */}
      {selectedDayEvents && (
        <Modal title={`Actividades y trámites del ${fmtDate(selectedDayEvents.date)}`} onClose={() => setSelectedDayEvents(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedDayEvents.events.map((ev) => (
              <div
                key={ev.id}
                className="card click"
                onClick={() => {
                  setSelectedDayEvents(null)
                  setSelectedEvent(ev)
                }}
                style={{ marginBottom: 0, padding: 14 }}
              >
                <div className="row between">
                  <b>{ev.isCustomActivity ? `📌 ${ev.title}` : (ev.title || TYPE[ev.type])}</b>
                  {ev.isCustomActivity ? <span className="badge blue">{ev.type}</span> : <StatusBadge value={ev.status} />}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {ev.isCustomActivity ? ev.description || 'Nota personal' : `Solicitado por: ${ev.requester?.full_name || user.full_name} · Folio: ${ev.folio}`}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
