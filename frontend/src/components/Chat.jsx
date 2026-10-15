import React, { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { Icon } from './ui.jsx'

const PROMPT_CARDS = [
  { icon: 'sun', title: 'Consultar saldo', desc: '¿Cuántos días de vacaciones me quedan disponibles?', prompt: '¿Cuántos días de vacaciones me quedan disponibles este año?' },
  { icon: 'list', title: 'Mis solicitudes', desc: 'Ver cómo va el trámite de mis peticiones', prompt: '¿Cómo van mis solicitudes pendientes?' },
  { icon: 'clock', title: 'Permiso personal', desc: 'Consultar balance de permisos con goce', prompt: '¿Cuál es mi saldo de permisos personales?' },
  { icon: 'calendar', title: 'Políticas vigentes', desc: 'Reglas de anticipación para trámites', prompt: '¿Con cuántos días de anticipación debo solicitar mis vacaciones?' }
]

export default function Chat({ open, onClose }) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [provider, setProvider] = useState(() => localStorage.getItem('ai_provider') || 'groq')
  const [msgs, setMsgs] = useState([])
  const [sugg, setSugg] = useState([])
  const [isFullscreen, setIsFullscreen] = useState(true)
  const list = useRef(null)
  const input = useRef(null)
  const nav = useNavigate()

  useEffect(() => { localStorage.setItem('ai_provider', provider) }, [provider])

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

  const ask = async (t) => {
    t = t.trim()
    if (!t || busy) return
    const next = [...msgs, { role: 'user', content: t }]
    setMsgs(next)
    setText('')
    setSugg([])
    setBusy(true)
    try {
      const r = await api.post('/ai/chat', {
        messages: next.slice(-12).map(({ role, content }) => ({ role, content })),
        provider,
      })
      setMsgs([...next, { role: 'assistant', content: r.message, provider: r.used_ai ? r.provider || provider : null }])
      setSugg(r.suggestions || [])
    } catch (err) {
      setMsgs([...next, { role: 'assistant', content: `No pude responder: ${err.message}` }])
    } finally {
      setBusy(false)
    }
  }

  const send = (e) => { e.preventDefault(); ask(text) }

  return (
    <aside className={`chat-dock ${open ? 'open' : ''} ${isFullscreen ? 'fullscreen' : ''}`} aria-hidden={!open} aria-label="Asistente de RRHH">
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
              className="script-icon-btn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Reducir panel' : 'Pantalla completa'}
            >
              <Icon name={isFullscreen ? 'minimize' : 'maximize'} size={17} />
            </button>
            <button className="script-icon-btn" onClick={onClose} title="Cerrar chat">
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>

        {/* Cuerpo del chat: Si está vacío, muestra la pantalla de inicio estilo Script */}
        <div className="script-chat-body" ref={list}>
          {msgs.length === 0 ? (
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
                    {m.provider && (
                      <span className="script-msg-badge">{m.provider.toUpperCase()}</span>
                    )}
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
            El agente de IA de RRHH responde basado en las políticas oficiales vigentes de la empresa.
          </div>
        </div>
      </div>
    </aside>
  )
}
