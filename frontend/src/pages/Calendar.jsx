import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Loading, StatusBadge, Modal, Field, Alert } from '../components/ui.jsx'
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
  const [activities, setActivities] = useState([])
  const [calendarError, setCalendarError] = useState('')
  const [modalError, setModalError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [saving, setSaving] = useState(false)

  // Modal para crear / editar actividad
  const [modalNew, setModalNew] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [actTitle, setActTitle] = useState('')
  const [actDate, setActDate] = useState(() =>
    toDateString(today.getFullYear(), today.getMonth(), today.getDate())
  )
  const [actType, setActType] = useState('Actividad')
  const [actVisibility, setActVisibility] = useState('PERSONAL')
  const [actDesc, setActDesc] = useState('')

  const isHrOrAdmin = ['HR_ADMIN', 'SYSTEM_ADMIN'].includes(user?.role)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setCalendarError('')

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
      .catch((err) => {
        if (!cancel) {
          const msg = err?.response?.data?.detail || err?.message || 'No se pudieron sincronizar las notas de calendario'
          setCalendarError(typeof msg === 'string' ? msg : JSON.stringify(msg))
        }
      })

    return () => {
      cancel = true
    }
  }, [currentYear, currentMonth])

  const handleOpenCreate = () => {
    setEditingNote(null)
    setActTitle('')
    setActDate(selectedDate || toDateString(today.getFullYear(), today.getMonth(), today.getDate()))
    setActType('Actividad')
    setActVisibility('PERSONAL')
    setActDesc('')
    setModalError('')
    setModalNew(true)
  }

  const handleOpenEdit = (ev) => {
    setEditingNote(ev)
    setActTitle(ev.title || '')
    setActDate(ev.start_date || selectedDate || toDateString(today.getFullYear(), today.getMonth(), today.getDate()))
    setActType(ev.type || 'Actividad')
    setActVisibility(ev.visibility || 'PERSONAL')
    setActDesc(ev.description || '')
    setModalError('')
    setSelectedEvent(null)
    setModalNew(true)
  }

  // Guardar (POST) o Actualizar (PUT) actividad o nota en el backend
  const handleSaveActivity = async (e) => {
    e.preventDefault()
    if (!actTitle.trim()) return

    setModalError('')
    setSaving(true)

    const payload = {
      title: actTitle.trim(),
      date: actDate,
      type: actType,
      description: actDesc.trim() || null,
      visibility: actVisibility,
      department_id: actVisibility === 'DEPARTMENT' ? user?.department_id : null,
    }

    try {
      if (editingNote) {
        const noteId = editingNote.id.replace('act_', '')
        const updated = await api.put(`/users/me/calendar-notes/${noteId}`, payload)
        const updatedList = activities.map((a) => (a.id === updated.id || a.note_db_id === updated.note_db_id ? updated : a))
        setActivities(updatedList)
        try {
          localStorage.setItem('hr_user_activities', JSON.stringify(updatedList))
        } catch {}
      } else {
        const created = await api.post('/users/me/calendar-notes', payload)
        const updatedList = [created, ...activities.filter((a) => a.id !== created.id)]
        setActivities(updatedList)
        try {
          localStorage.setItem('hr_user_activities', JSON.stringify(updatedList))
        } catch {}
      }
      setModalNew(false)
      setEditingNote(null)
      setActTitle('')
      setActDesc('')
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Error al guardar la actividad en el servidor'
      setModalError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setSaving(false)
    }
  }

  // Eliminar actividad o nota con validación de respuesta del servidor
  const handleDeleteActivity = async (id) => {
    setCalendarError('')
    setDetailError('')
    try {
      await api.del(`/users/me/calendar-notes/${id}`)
      const updated = activities.filter((a) => a.id !== id)
      setActivities(updated)
      try {
        localStorage.setItem('hr_user_activities', JSON.stringify(updated))
      } catch {}
      setSelectedEvent(null)
      setDetailError('')
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'No se pudo eliminar la actividad en el servidor'
      setDetailError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
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

  // Días del mes para la cuadrícula
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1)
    const lastDay = new Date(currentYear, currentMonth + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate()
    const days = []

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear
      const d = prevMonthLastDay - i
      days.push({
        day: d,
        month: prevM,
        year: prevY,
        dateStr: toDateString(prevY, prevM, d),
        currentMonth: false,
      })
    }

    for (let d = 1; d <= daysInMonth; d++) {
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
    <div className="calendar-page-container">
      {calendarError && (
        <div style={{ maxWidth: 900, margin: '0 auto 16px', width: '100%' }}>
          <Alert kind="err">{calendarError}</Alert>
        </div>
      )}

      {/* ── Tarjeta Dividida de Calendario ────────────────────────── */}
      <div className="calendar-main-card">
        {/* ── Columna Izquierda: Calendario mensual en español ──────── */}
        <div className="calendar-left-pane">
          <div className="calendar-header-row">
            <div className="calendar-month-selector">
              <span className="calendar-month-title">{MONTHS_ES[currentMonth]}</span>
              <button
                type="button"
                className="calendar-month-chevron"
                onClick={nextMonth}
                title="Siguiente mes"
              >
                ▾
              </button>
              <div className="calendar-month-arrows">
                <button type="button" className="calendar-arrow-btn" onClick={prevMonth} title="Mes anterior">
                  ‹
                </button>
                <button type="button" className="calendar-arrow-btn" onClick={nextMonth} title="Mes siguiente">
                  ›
                </button>
              </div>
            </div>

            <div className="calendar-year-label">{currentYear}</div>
          </div>

          <div className="calendar-weekdays-row">
            {WEEKDAYS_SHORT_ES.map((dayName) => (
              <div key={dayName} className="calendar-th-weekday">
                {dayName}
              </div>
            ))}
          </div>

          <div className="calendar-days-grid">
            {calendarDays.map((cd, idx) => {
              const isSelected = cd.dateStr === selectedDate
              const dayEvents = eventsByDate[cd.dateStr] || []
              const hasEvents = dayEvents.length > 0

              let dotColor = null
              if (hasEvents) {
                if (dayEvents.some((e) => e.status === 'APPROVED')) dotColor = '#22c55e'
                else if (dayEvents.some((e) => e.status === 'REJECTED')) dotColor = '#ef4444'
                else dotColor = '#eab308'
              }

              return (
                <div
                  key={idx}
                  className={`calendar-day-cell ${!cd.currentMonth ? 'calendar-day-outside' : ''}`}
                  onClick={() => {
                    setSelectedDate(cd.dateStr)
                    setActDate(cd.dateStr)
                  }}
                >
                  <div className={`calendar-day-number ${isSelected ? 'calendar-day-selected' : ''}`}>
                    {cd.day}
                  </div>
                  {hasEvents && (
                    <div
                      className="calendar-day-dot"
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
        <div className="calendar-divider" />

        {/* ── Columna Derecha: Detalle del día y Eventos ─────────────── */}
        <div className="calendar-right-pane">
          <div className="calendar-selected-header">
            <div className="calendar-selected-number">{selectedDayNum}</div>
            <div className="calendar-selected-weekday">{selectedWeekdayName}</div>
          </div>

          <div className="calendar-events-subheader">
            <h3 className="calendar-events-heading">Eventos</h3>
            <button
              type="button"
              className="calendar-add-round-btn"
              onClick={handleOpenCreate}
              title="Agregar actividad o nota para este día"
            >
              +
            </button>
          </div>

          <div className="calendar-events-container">
            {selectedDayEvents.length === 0 ? (
              <div className="calendar-empty-state">
                <p className="calendar-empty-msg">No hay eventos ni ausencias programadas para este día.</p>
                <button
                  type="button"
                  className="calendar-btn-inline-add"
                  onClick={handleOpenCreate}
                >
                  + Agregar actividad o nota
                </button>
              </div>
            ) : (
              <div className="calendar-events-list">
                {selectedDayEvents.map((ev, idx) => {
                  const colors = ['#ef4444', '#eab308', '#22c55e', '#3b82f6']
                  const circleColor = colors[idx % colors.length]

                  return (
                    <div
                      key={ev.id || idx}
                      className="calendar-event-item"
                      onClick={() => setSelectedEvent(ev)}
                    >
                      <span
                        className="calendar-hollow-bullet"
                        style={{ borderColor: circleColor }}
                      />
                      <div className="calendar-event-content">
                        <span className="calendar-event-text">
                          {ev.isCustomActivity
                            ? ev.title
                            : ev.title || TYPE[ev.type] || 'Solicitud de personal'}
                        </span>
                        <span className="calendar-event-meta">
                          {ev.isCustomActivity
                            ? `${ev.type} · ${
                                ev.visibility === 'GLOBAL'
                                  ? 'Global'
                                  : ev.visibility === 'DEPARTMENT'
                                  ? 'Departamental'
                                  : 'Personal'
                              }`
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

      {/* ── Modal: Registrar o Editar actividad / nota ─────────────── */}
      {modalNew && (
        <Modal
          title={editingNote ? 'Editar actividad de calendario' : 'Agregar actividad al calendario'}
          onClose={() => {
            setModalNew(false)
            setEditingNote(null)
          }}
        >
          {modalError && <Alert kind="err">{modalError}</Alert>}

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

            {/* Selector de visibilidad */}
            <Field label="Visibilidad">
              <select
                value={actVisibility}
                onChange={(e) => setActVisibility(e.target.value)}
              >
                <option value="PERSONAL">Personal (Solo tú puedes verla)</option>
                <option value="DEPARTMENT">
                  {user?.department?.name
                    ? `Departamental (${user.department.name})`
                    : 'Departamental (Tu departamento)'}
                </option>
                {isHrOrAdmin && (
                  <option value="GLOBAL">Global (Visible para toda la empresa)</option>
                )}
              </select>
            </Field>

            <Field label="Descripción o detalles adicionales">
              <textarea
                style={{ minHeight: 80 }}
                placeholder="Añade detalles relevantes o recordatorios de esta actividad..."
                value={actDesc}
                onChange={(e) => setActDesc(e.target.value)}
              />
            </Field>

            <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setModalNew(false)
                  setEditingNote(null)
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving
                  ? 'Guardando…'
                  : editingNote
                  ? 'Actualizar actividad'
                  : 'Guardar evento'}
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
          onClose={() => {
            setSelectedEvent(null)
            setDetailError('')
          }}
        >
          <div style={{ padding: '6px 0' }}>
            {detailError && (
              <div style={{ marginBottom: 14 }}>
                <Alert kind="err">{detailError}</Alert>
              </div>
            )}
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
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {selectedEvent.isCustomActivity ? (
                  <>
                    <span className="badge blue">{selectedEvent.type}</span>
                    <span className="badge amber">
                      {selectedEvent.visibility === 'GLOBAL'
                        ? 'Global'
                        : selectedEvent.visibility === 'DEPARTMENT'
                        ? 'Departamental'
                        : 'Personal'}
                    </span>
                  </>
                ) : (
                  <StatusBadge value={selectedEvent.status} />
                )}
              </div>
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: '14px 0' }}>
              {selectedEvent.description || 'Sin detalles adicionales registrados.'}
            </p>

            <div className="row" style={{ marginTop: 22, justifyContent: 'flex-end', gap: 10 }}>
              {selectedEvent.isCustomActivity ? (
                <>
                  {(selectedEvent.is_owner || isHrOrAdmin) && (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => handleOpenEdit(selectedEvent)}
                      >
                        Editar actividad
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => handleDeleteActivity(selectedEvent.id)}
                      >
                        Eliminar actividad
                      </button>
                    </>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => nav(`/requests/${selectedEvent.id}`)}
                >
                  Ver solicitud completa
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSelectedEvent(null)
                  setDetailError('')
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
