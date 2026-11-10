import React, { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Icon } from './ui.jsx'

const PROMPT_CARDS = [
  { icon: 'sun', title: 'Consultar saldo', desc: '¿Cuántos días de vacaciones me quedan disponibles?', prompt: '¿Cuántos días de vacaciones me quedan disponibles este año?' },
  { icon: 'list', title: 'Mis solicitudes', desc: 'Ver cómo va el trámite de mis peticiones', prompt: '¿Cómo van mis solicitudes pendientes?' },
  { icon: 'clock', title: 'Permiso personal', desc: 'Consultar balance de permisos con goce', prompt: '¿Cuál es mi saldo de permisos personales?' },
  { icon: 'calendar', title: 'Políticas vigentes', desc: 'Reglas de anticipación para trámites', prompt: '¿Con cuántos días de anticipación debo solicitar mis vacaciones?' }
]

export default function Chat({ open, onClose }) {
  const { user } = useAuth()
  const userKey = user?.id ? `u_${user.id}` : 'guest'
  const msgsKey = `hr_chat_msgs_${userKey}`
  const queriesKey = `hr_chat_queries_${userKey}`

  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [provider, setProvider] = useState(() => localStorage.getItem('ai_provider') || 'groq')
  const [msgs, setMsgs] = useState(() => {
    try {
      const saved = localStorage.getItem(msgsKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [queries, setQueries] = useState(() => {
    try {
      const saved = localStorage.getItem(queriesKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [sugg, setSugg] = useState([])
  const [isFullscreen, setIsFullscreen] = useState(() => {
    const saved = localStorage.getItem('ai_chat_fullscreen')
    return saved !== null ? saved === 'true' : true
  })
  const [showHistory, setShowHistory] = useState(false)
  const list = useRef(null)
  const input = useRef(null)
  const nav = useNavigate()

  // Recargar historial cuando cambia el usuario autenticado
  useEffect(() => {
    try {
      const savedMsgs = localStorage.getItem(msgsKey)
      setMsgs(savedMsgs ? JSON.parse(savedMsgs) : [])
      const savedQueries = localStorage.getItem(queriesKey)
      setQueries(savedQueries ? JSON.parse(savedQueries) : [])
    } catch {
      setMsgs([])
      setQueries([])
    }
  }, [msgsKey, queriesKey])

  // Guardar mensajes en localStorage automáticamente
  useEffect(() => {
    try {
      localStorage.setItem(msgsKey, JSON.stringify(msgs.slice(-60)))
    } catch {}
  }, [msgs, msgsKey])

  // Guardar historial de consultas realizadas en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(queriesKey, JSON.stringify(queries.slice(0, 30)))
    } catch {}
  }, [queries, queriesKey])

  useEffect(() => { localStorage.setItem('ai_provider', provider) }, [provider])
  useEffect(() => { localStorage.setItem('ai_chat_fullscreen', String(isFullscreen)) }, [isFullscreen])

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy, open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => input.current?.focus(), 250)
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  const recordQuery = (qText, answerText) => {
    const now = new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    setQueries((prev) => [
      { id: Date.now(), prompt: qText, answer: answerText || '', date: now },
      ...prev.filter((item) => item.prompt.toLowerCase() !== qText.toLowerCase()),
    ].slice(0, 30))
  }

  const ask = async (t) => {
    t = t.trim()
    if (!t || busy) return
    setShowHistory(false)
    const next = [...msgs, { role: 'user', content: t, time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }]
    setMsgs(next)
    setText('')
    setSugg([])
    setBusy(true)
    try {
      const r = await api.post('/ai/chat', {
        messages: next.slice(-12).map(({ role, content }) => ({ role, content })),
        provider,
      })
      const replyMsg = {
        role: 'assistant',
        content: r.message,
        provider: r.used_ai ? r.provider || provider : null,
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      }
      setMsgs([...next, replyMsg])
      setSugg(r.suggestions || [])
      recordQuery(t, r.message)
    } catch (err) {
      const errMsg = `No pude responder: ${err.message}`
      setMsgs([...next, { role: 'assistant', content: errMsg }])
      recordQuery(t, errMsg)
    } finally {
      setBusy(false)
    }
  }

  const clearConversation = () => {
    setMsgs([])
    setSugg([])
    try { localStorage.removeItem(msgsKey) } catch {}
  }

  const clearSavedQueries = () => {
    setQueries([])
    try { localStorage.removeItem(queriesKey) } catch {}
  }

  const send = (e) => { e.preventDefault(); ask(text) }

  return (
    <aside className={`chat-dock ${open ? 'open' : ''} ${isFullscreen ? 'fullscreen' : 'compact'}`} aria-hidden={!open} aria-label="Asistente de RRHH">
      <div className="script-chat-container">
        {/* Cabecera superior con título y botones estilo Script */}
        <header className="script-chat-header">
          <div className="script-header-left">
            <span className="script-brand-tag">
              <Icon name="sparkles" size={18} /> Asistente IA de RRHH
            </span>
          </div>

          <div className="script-header-center">
            <div className="script-engine-selector">
              <button
                type="button"
                className={provider === 'groq' ? 'active' : ''}
                onClick={() => setProvider('groq')}
              >
                <Icon name="zap" size={13} /> Groq (Llama / Qwen)
              </button>
              <button
                type="button"
                className={provider === 'ollama' ? 'active' : ''}
                onClick={() => setProvider('ollama')}
              >
                <Icon name="shield" size={13} /> Ollama (Local)
              </button>
            </div>
          </div>

          <div className="script-header-right">
            <button
              type="button"
              className={`script-history-toggle-btn ${showHistory ? 'active' : ''}`}
              onClick={() => setShowHistory(!showHistory)}
              title="Ver historial de consultas realizadas"
            >
              <Icon name="clock" size={15} />
              <span>Historial ({queries.length})</span>
            </button>
            {msgs.length > 0 && (
              <button
                type="button"
                className="script-history-toggle-btn"
                onClick={clearConversation}
                title="Iniciar nueva consulta (los registros siguen en Historial)"
              >
                Nueva vista
              </button>
            )}
            <button
              type="button"
              className="script-icon-btn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Hacer pequeño (ventana flotante)' : 'Agrandar a pantalla completa'}
              aria-label={isFullscreen ? 'Reducir panel' : 'Pantalla completa'}
            >
              <Icon name={isFullscreen ? 'minimize' : 'maximize'} size={17} />
            </button>
            <button type="button" className="script-icon-btn" onClick={onClose} title="Cerrar chat" aria-label="Cerrar chat">
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>

        {/* Cuerpo del chat */}
        <div className="script-chat-body" ref={list}>
          {showHistory ? (
            <div className="script-history-panel">
              <div className="row between" style={{ marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Historial de consultas realizadas</h2>
                  <span className="muted">Haz clic en cualquier consulta para volver a ejecutarla o continúa tu conversación.</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {queries.length > 0 && (
                    <button type="button" className="btn sm" onClick={clearSavedQueries}>
                      Borrar historial
                    </button>
                  )}
                  <button type="button" className="btn sm primary" onClick={() => setShowHistory(false)}>
                    Volver al chat
                  </button>
                </div>
              </div>
              {queries.length === 0 ? (
                <p className="muted">Aún no has realizado consultas. Tus preguntas y respuestas quedarán guardadas aquí automáticamente.</p>
              ) : (
                <div className="script-history-list">
                  {queries.map((q) => (
                    <div key={q.id} className="script-history-item" onClick={() => ask(q.prompt)}>
                      <div className="row between">
                        <b className="script-history-prompt">{q.prompt}</b>
                        <span className="muted" style={{ fontSize: 11 }}>{q.date}</span>
                      </div>
                      {q.answer && (
                        <div className="script-history-answer">
                          {q.answer.replace(/\*\*/g, '')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : msgs.length === 0 ? (
            <div className="script-hero-screen">
              <h1 className="script-hero-title">¿En qué puedo ayudarte hoy?</h1>
              <p className="script-hero-sub">
                Pregúntame sobre tus vacaciones, saldo de días, estado de trámites o políticas internas.
              </p>

              {/* Grid de 4 tarjetas estilo Script */}
              <div className="script-prompt-grid">
                {PROMPT_CARDS.map((card, i) => (
                  <div
                    key={i}
                    className="script-prompt-card click"
                    onClick={() => ask(card.prompt)}
                  >
                    <div className="prompt-card-top">
                      <div className="prompt-card-icon">
                        <Icon name={card.icon} size={18} />
                      </div>
                      <span className="prompt-plus">+</span>
                    </div>
                    <div className="prompt-card-title">{card.title}</div>
                    <div className="prompt-card-desc">{card.desc}</div>
                  </div>
                ))}
              </div>

              {queries.length > 0 && (
                <div className="script-recent-queries-box">
                  <div className="row between" style={{ marginBottom: 8 }}>
                    <span className="muted" style={{ fontWeight: 700, fontSize: 12 }}>Consultas recientes guardadas</span>
                    <button type="button" className="script-link-btn" onClick={() => setShowHistory(true)}>
                      Ver todo ({queries.length})
                    </button>
                  </div>
                  <div className="script-recent-pills">
                    {queries.slice(0, 5).map((q) => (
                      <button key={q.id} type="button" className="script-recent-pill" onClick={() => ask(q.prompt)}>
                        <Icon name="clock" size={12} />
                        <span>{q.prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="script-messages-stream">
              {msgs.map((m, i) => (
                <div key={i} className={`script-msg-row ${m.role === 'user' ? 'user-side' : 'ai-side'}`}>
                  <div className="script-msg-avatar">
                    <Icon name={m.role === 'user' ? 'users' : 'sparkles'} size={16} />
                  </div>
                  <div className="script-bubble">
                    <div className="script-msg-text">{m.content.replace(/\*\*/g, '')}</div>
                    <div className="row" style={{ gap: 8, marginTop: 4 }}>
                      {m.provider && (
                        <span className="script-msg-badge">{m.provider.toUpperCase()}</span>
                      )}
                      {m.time && (
                        <span className="muted" style={{ fontSize: 10.5, opacity: 0.8 }}>{m.time}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {busy && (
                <div className="script-msg-row ai-side">
                  <div className="script-msg-avatar"><Icon name="sparkles" size={16} /></div>
                  <div className="script-bubble typing">
                    <span /><span /><span />
                  </div>
                </div>
              )}

              {sugg.length > 0 && (
                <div className="script-suggestions-bar">
                  {sugg.map((s) => (
                    <button key={s.path} className="script-sugg-pill" onClick={() => nav(s.path)}>
                      {s.label} →
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer con el input estilo barra flotante de Script */}
        <div className="script-chat-footer">
          <form className="script-composer-box" onSubmit={send}>
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe tu consulta o pide un resumen de tus solicitudes…"
              maxLength={1000}
            />
            <div className="script-composer-actions">
              <span className="script-counter">{text.length}/1000</span>
              <button
                type="submit"
                className="script-send-btn"
                disabled={busy || !text.trim()}
                title="Enviar"
              >
                <Icon name="send" size={15} />
              </button>
            </div>
          </form>
          <div className="script-footer-note">
            Asistente de Recursos Humanos · Respuestas fundamentadas en las políticas vigentes de PluriOne S.A. de C.V.
          </div>
        </div>
      </div>
    </aside>
  )
}
