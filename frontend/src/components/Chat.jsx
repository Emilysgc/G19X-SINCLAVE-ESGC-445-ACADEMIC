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

function loadSavedConversations(convsKey, legacyMsgsKey) {
  try {
    const raw = localStorage.getItem(convsKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
    const legacy = localStorage.getItem(legacyMsgsKey)
    if (legacy) {
      const oldMsgs = JSON.parse(legacy)
      if (Array.isArray(oldMsgs) && oldMsgs.length > 0) {
        const firstUser = oldMsgs.find((m) => m.role === 'user')?.content || 'Conversación guardada'
        return [{
          id: 'conv_' + Date.now(),
          title: firstUser.slice(0, 48),
          updatedAt: new Date().toISOString(),
          messages: oldMsgs,
        }]
      }
    }
  } catch {}
  return []
}

function groupConversations(convs) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const groups = { today: [], yesterday: [], older: [] }
  for (const c of convs) {
    const d = (c.updatedAt || '').slice(0, 10)
    if (d === todayStr) groups.today.push(c)
    else if (d === yesterdayStr) groups.yesterday.push(c)
    else groups.older.push(c)
  }
  return groups
}

export default function Chat({ open, onClose }) {
  const { user } = useAuth()
  const userKey = user?.id ? `u_${user.id}` : 'guest'
  const convsKey = `hr_chat_convs_${userKey}`
  const legacyMsgsKey = `hr_chat_msgs_${userKey}`

  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [provider, setProvider] = useState(() => localStorage.getItem('ai_provider') || 'groq')
  const [convs, setConvs] = useState(() => loadSavedConversations(convsKey, legacyMsgsKey))
  const [activeId, setActiveId] = useState(null)
  const [sugg, setSugg] = useState([])
  const [isFullscreen, setIsFullscreen] = useState(() => {
    const saved = localStorage.getItem('ai_chat_fullscreen')
    return saved !== null ? saved === 'true' : true
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const list = useRef(null)
  const input = useRef(null)
  const nav = useNavigate()

  useEffect(() => {
    const loaded = loadSavedConversations(convsKey, legacyMsgsKey)
    setConvs(loaded)
    setActiveId(loaded[0]?.id || null)
  }, [convsKey, legacyMsgsKey])

  useEffect(() => {
    try {
      localStorage.setItem(convsKey, JSON.stringify(convs.slice(0, 40)))
    } catch {}
  }, [convs, convsKey])

  useEffect(() => { localStorage.setItem('ai_provider', provider) }, [provider])
  useEffect(() => { localStorage.setItem('ai_chat_fullscreen', String(isFullscreen)) }, [isFullscreen])

  const activeConv = convs.find((c) => c.id === activeId) || null
  const msgs = activeConv ? activeConv.messages : []

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [msgs.length, activeId, busy, open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => input.current?.focus(), 250)
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  const startNewChat = () => {
    setActiveId(null)
    setSugg([])
    setText('')
    if (!isFullscreen) setSidebarOpen(false)
    setTimeout(() => input.current?.focus(), 80)
  }

  const deleteConv = (e, id) => {
    e.stopPropagation()
    setConvs((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (activeId === id) {
        setActiveId(next[0]?.id || null)
      }
      return next
    })
  }

  const ask = async (t) => {
    t = t.trim()
    if (!t || busy) return
    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    const userMsg = { role: 'user', content: t, time: timeStr }

    let targetId = activeId
    let nextMsgs = [...msgs, userMsg]

    if (!targetId) {
      targetId = 'conv_' + Date.now()
      const newConv = {
        id: targetId,
        title: t.length > 44 ? t.slice(0, 44) + '…' : t,
        updatedAt: new Date().toISOString(),
        messages: nextMsgs,
      }
      setConvs((prev) => [newConv, ...prev])
      setActiveId(targetId)
    } else {
      setConvs((prev) => [
        { ...prev.find((c) => c.id === targetId), updatedAt: new Date().toISOString(), messages: nextMsgs },
        ...prev.filter((c) => c.id !== targetId),
      ])
    }

    setText('')
    setSugg([])
    setBusy(true)
    try {
      const r = await api.post('/ai/chat', {
        messages: nextMsgs.slice(-12).map(({ role, content }) => ({ role, content })),
        provider,
      })
      const replyMsg = {
        role: 'assistant',
        content: r.message,
        provider: r.used_ai ? r.provider || provider : null,
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      }
      const updatedMsgs = [...nextMsgs, replyMsg]
      setConvs((prev) =>
        prev.map((c) => (c.id === targetId ? { ...c, updatedAt: new Date().toISOString(), messages: updatedMsgs } : c))
      )
      setSugg(r.suggestions || [])
    } catch (err) {
      const errMsg = { role: 'assistant', content: `No pude responder: ${err.message}`, time: timeStr }
      const updatedMsgs = [...nextMsgs, errMsg]
      setConvs((prev) =>
        prev.map((c) => (c.id === targetId ? { ...c, updatedAt: new Date().toISOString(), messages: updatedMsgs } : c))
      )
    } finally {
      setBusy(false)
    }
  }

  const send = (e) => { e.preventDefault(); ask(text) }
  const groups = groupConversations(convs)

  const renderGroup = (label, items) => {
    if (!items.length) return null
    return (
      <div className="chatgpt-group">
        <div className="chatgpt-group-label">{label}</div>
        {items.map((c) => (
          <div
            key={c.id}
            className={`chatgpt-conv-item ${c.id === activeId ? 'active' : ''}`}
            onClick={() => {
              setActiveId(c.id)
              setSugg([])
              if (!isFullscreen) setSidebarOpen(false)
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chatgpt-conv-ico">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="chatgpt-conv-title">{c.title}</span>
            <button
              type="button"
              className="chatgpt-conv-del"
              title="Eliminar conversación"
              onClick={(e) => deleteConv(e, c.id)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <aside className={`chat-dock ${open ? 'open' : ''} ${isFullscreen ? 'fullscreen' : 'compact'}`} aria-hidden={!open} aria-label="Asistente de RRHH">
      <div className="chatgpt-layout">
        {/* Barra lateral izquierda estilo ChatGPT para conversaciones guardadas */}
        <div className={`chatgpt-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="chatgpt-sidebar-top">
            <button type="button" className="chatgpt-new-btn" onClick={startNewChat}>
              <span className="chatgpt-new-left">
                <Icon name="sparkles" size={16} />
                <span>Nuevo chat</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          </div>

          <div className="chatgpt-conv-list">
            {convs.length === 0 ? (
              <div className="chatgpt-empty">
                Tus conversaciones se guardarán aquí automáticamente.
              </div>
            ) : (
              <>
                {renderGroup('Hoy', groups.today)}
                {renderGroup('Ayer', groups.yesterday)}
                {renderGroup('Anteriores', groups.older)}
              </>
            )}
          </div>
        </div>

        {/* Panel principal de conversación */}
        <div className="script-chat-container">
          <header className="script-chat-header">
            <div className="script-header-left" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="script-icon-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title={sidebarOpen ? 'Ocultar barra de conversaciones' : 'Mostrar conversaciones'}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
              <button
                type="button"
                className="script-icon-btn"
                onClick={startNewChat}
                title="Nueva conversación"
              >
                <Icon name="plus" size={17} />
              </button>
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

          <div className="script-chat-body" ref={list}>
            {msgs.length === 0 ? (
              <div className="script-hero-screen">
                <h1 className="script-hero-title">¿En qué puedo ayudarte hoy?</h1>
                <p className="script-hero-sub">
                  Pregúntame sobre tus vacaciones, saldo de días, estado de trámites o políticas internas.
                </p>

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
      </div>
    </aside>
  )
}
