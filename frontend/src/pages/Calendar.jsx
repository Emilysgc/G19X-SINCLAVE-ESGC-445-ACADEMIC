import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Loading, StatusBadge, Modal, Field } from '../components/ui.jsx'
import { TYPE, STATUS, fmtDate } from '../services/labels'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const WEEKDAYS_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEKDAYS_LONG_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

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
  const [selectedDate, setSelectedDate] = useState(() =>
    toDateString(today.getFullYear(), today.getMonth(), today.getDate())
  )

  // Notas y actividades del usuario
  const [activities, setActivities] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hr_user_activities') || '[]')
    } catch {
      return []
    }
  })

  const [modalNew, setModalNew] = useState(false)
  const [actTitle, setActTitle] = useState('')
  const [actDate, setActDate] = useState(() =>
    toDateString(today.getFullYear(), today.getMonth(), today.getDate())
  )
  const [actType, setActType] = useState('Actividad')
  const [actDesc, setActDesc] = useState('')

  useEffect(() => {
    let cancel = false
    setLoading(true)
    api
      .get('/requests?limit=150')
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
    api
      .get('/users/me/calendar-notes')
      .then((notes) => {
        if (!cancel && Array.isArray(notes)) {
          setActivities(notes)
          try {
            localStorage.setItem('hr_user_activities', JSON.stringify(notes))
          } catch {}
        }
      })
      .catch(() => {})

    return () => {
      cancel = true
    }
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
      try {
        localStorage.setItem('hr_user_activities', JSON.stringify(updated))
      } catch {}
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
        created_at: new Date().toISOString(),
      }
      const updated = [newAct, ...activities]
      setActivities(updated)
      try {
        localStorage.setItem('hr_user_activities', JSON.stringify(updated))
      } catch {}
    }

    setModalNew(false)
    setActTitle('')
    setActDesc('')
  }

  // Eliminar actividad o nota
  const handleDeleteActivity = async (id) => {
    try {
      await api.del(`/users/me/calendar-notes/${id}`)
    } catch {}
    const updated = activities.filter((a) => a.id !== id)
    setActivities(updated)
    try {
      localStorage.setItem('hr_user_activities', JSON.stringify(updated))
    } catch {}
    setSelectedEvent(null)
  }

  // Combinar solicitudes con notas
  const allEvents = useMemo(() => {
    return [...requests, ...activities]
  }, [requests, activities])

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

  // Matriz de días del mes
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

  // Datos del día seleccionado
  const selectedDateObj = useMemo(() => {
    if (!selectedDate) return today
    const [y, m, d] = selectedDate.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [selectedDate, today])

  const selectedDayNum = selectedDateObj.getDate()
  const selectedWeekdayName = WEEKDAYS_LONG_ES[selectedDateObj.getDay()]
  const selectedDayEvents = eventsByDate[selectedDate] || []

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  return (
    <div className="cal5-page-container">
      {/* ── Contenedor Tarjeta Dividida estilo Imagen 5 ────────────── */}
      <div className="cal5-main-card">
        {/* ── Columna Izquierda: Calendario mensual en español ──────── */}
        <div className="cal5-left-pane">
          {/* Encabezado con selector de mes y año */}
          <div className="cal5-header-row">
            <div className="cal5-month-selector">
              <span className="cal5-month-title">{MONTHS_ES[currentMonth]}</span>
              <button
                type="button"
                className="cal5-month-chevron"
                onClick={nextMonth}
                title="Siguiente mes"
              >
                ▾
              </button>
              <div className="cal5-month-arrows">
                <button type="button" className="cal5-arrow-btn" onClick={prevMonth} title="Mes anterior">
                  ‹
                </button>
                <button type="button" className="cal5-arrow-btn" onClick={nextMonth} title="Mes siguiente">
                  ›
                </button>
              </div>
            </div>

            <div className="cal5-year-label">{currentYear}</div>
          </div>

          {/* Días de la semana en español */}
          <div className="cal5-weekdays-row">
            {WEEKDAYS_SHORT_ES.map((dayName) => (
              <div key={dayName} className="cal5-th-weekday">
                {dayName}
              </div>
            ))}
          </div>

          {/* Cuadrícula de días */}
          <div className="cal5-days-grid">
            {calendarDays.map((cd, idx) => {
              const isSelected = cd.dateStr === selectedDate
              const dayEvents = eventsByDate[cd.dateStr] || []
              const hasEvents = dayEvents.length > 0

              // Elegir color de punto (amarillo, rojo o verde como en Imagen 5)
              let dotColor = null
              if (hasEvents) {
                if (dayEvents.some((e) => e.status === 'APPROVED')) dotColor = '#22c55e' // Verde
                else if (dayEvents.some((e) => e.status === 'REJECTED')) dotColor = '#ef4444' // Rojo
                else dotColor = '#eab308' // Amarillo
              }

              return (
                <div
                  key={idx}
                  className={`cal5-day-cell ${!cd.currentMonth ? 'cal5-day-outside' : ''}`}
                  onClick={() => {
                    setSelectedDate(cd.dateStr)
                    setActDate(cd.dateStr)
                  }}
                >
                  <div className={`cal5-day-number ${isSelected ? 'cal5-day-selected' : ''}`}>
                    {cd.day}
                  </div>
                  {hasEvents && (
                    <div
                      className="cal5-day-dot"
                      style={{
                        backgroundColor: isSelected ? 'transparent' : dotColor,
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Divisor vertical ─────────────────────────────────────── */}
        <div className="cal5-divider" />

        {/* ── Columna Derecha: Detalle del día y Eventos (Imagen 5) ─── */}
        <div className="cal5-right-pane">
          {/* Día seleccionado y nombre del día en español */}
          <div className="cal5-selected-header">
            <div className="cal5-selected-number">{selectedDayNum}</div>
            <div className="cal5-selected-weekday">{selectedWeekdayName}</div>
          </div>

          {/* Subtítulo: Eventos con botón redondo + */}
          <div className="cal5-events-subheader">
            <h3 className="cal5-events-heading">Eventos</h3>
            <button
              type="button"
              className="cal5-add-round-btn"
              onClick={() => {
                setActDate(selectedDate)
                setModalNew(true)
              }}
              title="Agregar evento o nota para este día"
            >
              +
            </button>
          </div>

          {/* Lista de eventos con círculos huecos de colores (Imagen 5) */}
          <div className="cal5-events-container">
            {selectedDayEvents.length === 0 ? (
              <div className="cal5-empty-state">
                <p className="cal5-empty-msg">No hay eventos ni ausencias programadas para este día.</p>
                <button
                  type="button"
                  className="cal5-btn-inline-add"
                  onClick={() => {
                    setActDate(selectedDate)
                    setModalNew(true)
                  }}
                >
                  + Agregar actividad o nota
                </button>
              </div>
            ) : (
              <div className="cal5-events-list">
                {selectedDayEvents.map((ev, idx) => {
                  // Colores de los círculos huecos: rojo, amarillo, verde, azul
                  const colors = ['#ef4444', '#eab308', '#22c55e', '#3b82f6']
                  const circleColor = colors[idx % colors.length]

                  return (
                    <div
                      key={ev.id}
                      className="cal5-event-item"
                      onClick={() => setSelectedEvent(ev)}
                    >
                      <span
                        className="cal5-hollow-bullet"
                        style={{ borderColor: circleColor }}
                      />
                      <div className="cal5-event-content">
                        <span className="cal5-event-text">
                          {ev.isCustomActivity
                            ? ev.title
                            : ev.title || TYPE[ev.type] || 'Solicitud de personal'}
                        </span>
                        <span className="cal5-event-meta">
                          {ev.isCustomActivity
                            ? ev.type
                            : `${ev.requester?.full_name || user.full_name} · ${
                                STATUS[ev.status]?.[0] || 'En revisión'
                              }`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Registrar nueva actividad o nota ───────────────── */}
      {modalNew && (
        <Modal title="Agregar actividad o nota personal" onClose={() => setModalNew(false)}>
          <form onSubmit={handleSaveActivity}>
            <Field label="Título del evento o actividad">
              <input
                required
                placeholder="Ej. Reunión de equipo, Revisión con supervisor, Entrega..."
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
                    <option value="Reunión">Reunión interna</option>
                    <option value="Recordatorio">Recordatorio</option>
                    <option value="Nota">Nota personal</option>
                  </select>
                </Field>
              </div>
            </div>

            <Field label="Descripción o detalles adicionales">
              <textarea
                style={{ minHeight: 80 }}
                placeholder="Añade detalles relevantes o recordatorios de esta actividad..."
                value={actDesc}
                onChange={(e) => setActDesc(e.target.value)}
              />
            </Field>

            <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn" onClick={() => setModalNew(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn primary">
                Guardar evento
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal de Detalle de Evento ────────────────────────────── */}
      {selectedEvent && (
        <Modal
          title={
            selectedEvent.isCustomActivity
              ? `Actividad: ${selectedEvent.title}`
              : `Solicitud ${selectedEvent.folio || ''}`
          }
          onClose={() => setSelectedEvent(null)}
        >
          <div style={{ padding: '6px 0' }}>
            <div className="row between" style={{ marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17 }}>
                  {selectedEvent.isCustomActivity
                    ? selectedEvent.title
                    : selectedEvent.title || TYPE[selectedEvent.type]}
                </h3>
                <span className="muted" style={{ fontSize: 13 }}>
                  {fmtDate(selectedEvent.start_date)}
                  {selectedEvent.end_date &&
                    selectedEvent.end_date !== selectedEvent.start_date &&
                    ` al ${fmtDate(selectedEvent.end_date)}`}
                </span>
              </div>
              {selectedEvent.isCustomActivity ? (
                <span className="badge blue">{selectedEvent.type}</span>
              ) : (
                <StatusBadge value={selectedEvent.status} />
              )}
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: '14px 0' }}>
              {selectedEvent.description || 'Sin detalles adicionales registrados.'}
            </p>

            <div className="row" style={{ marginTop: 22, justifyContent: 'flex-end', gap: 10 }}>
              {selectedEvent.isCustomActivity ? (
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => handleDeleteActivity(selectedEvent.id)}
                >
                  Eliminar actividad
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
    </div>
  )
}
