import React, { useState } from 'react'
import { useAuth } from '../services/auth.jsx'
import { Alert, Field, Modal } from '../components/ui.jsx'
import { api, errorList } from '../services/api'

export default function Login() {
  const { login, loginOidc, config } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState([])
  const [busy, setBusy] = useState(false)

  // Estados del modal de recuperación con código OTP
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryStep, setRecoveryStep] = useState(1) // 1: pedir correo, 2: código y nueva contraseña, 3: éxito
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [devCode, setDevCode] = useState('')
  const [recoveryErr, setRecoveryErr] = useState([])
  const [recoverySuccess, setRecoverySuccess] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: '#e2e8f0' }
    let score = 0
    if (pwd.length >= 8) score++
    if (pwd.length >= 10) score++
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
    if (/\d/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score++

    switch (score) {
      case 1:
        return { score: 1, label: 'Débil', color: '#ef4444' }
      case 2:
        return { score: 2, label: 'Media', color: '#f59e0b' }
      case 3:
        return { score: 3, label: 'Fuerte', color: '#10b981' }
      case 4:
        return { score: 4, label: 'Excelente', color: '#22c55e' }
      default:
        return { score: 0, label: '', color: '#e2e8f0' }
    }
  }

  const MailboxGraphic = () => (
    <svg width="120" height="90" viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="94" y="95" width="12" height="48" rx="2" fill="#334155" />
      <path d="M94 110C80 110 70 120 70 135" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
      <path d="M50 45C50 25 70 15 105 15C140 15 155 30 155 55V95H50V45Z" fill="#1e293b" />
      <path d="M50 45C50 25 70 15 105 15C140 15 155 30 155 55V95H50V45Z" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="50" cy="70" rx="14" ry="26" fill="#475569" stroke="#0f172a" strokeWidth="4" />
      <path d="M155 60H175V40H155" stroke="#f97316" strokeWidth="4" fill="#ff5722" strokeLinejoin="round" />
      <line x1="155" y1="60" x2="155" y2="80" stroke="#f97316" strokeWidth="4" />
      <g transform="translate(18, 15) rotate(-8)">
        <rect x="35" y="35" width="65" height="42" rx="4" fill="#ffffff" stroke="#0f172a" strokeWidth="3.5" />
        <path d="M35 37L67.5 60L100 37" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M36 76L55 55" stroke="#cbd5e1" strokeWidth="2.5" />
        <path d="M99 76L80 55" stroke="#cbd5e1" strokeWidth="2.5" />
      </g>
    </svg>
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setErr([])
    setBusy(true)
    try {
      await login(username.trim(), password)
    } catch (e) {
      setErr(errorList(e))
    } finally {
      setBusy(false)
    }
  }

  const handleOpenRecovery = (e) => {
    e.preventDefault()
    setRecoveryErr([])
    setRecoverySuccess('')
    setRecoveryCode('')
    setNewPassword('')
    setConfirmPassword('')
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    setDevCode('')
    setRecoveryStep(1)
    setShowRecovery(true)
  }

  const handleSendCode = async (e) => {
    e?.preventDefault()
    if (!recoveryEmail.trim()) {
      setRecoveryErr(['Ingresa tu correo electrónico o nombre de usuario.'])
      return
    }
    setRecoveryErr([])
    setRecoveryBusy(true)
    try {
      const res = await api.post('/auth/forgot-password', { email: recoveryEmail.trim() })
      setDevCode(res.dev_code || '')
      setRecoverySuccess(res.message || 'Código de verificación enviado.')
      setRecoveryStep(2)
    } catch (err) {
      setRecoveryErr(errorList(err))
    } finally {
      setRecoveryBusy(false)
    }
  }

  const handleResetPassword = async (e) => {
    e?.preventDefault()
    setRecoveryErr([])

    if (!recoveryCode.trim() || recoveryCode.trim().length !== 6) {
      setRecoveryErr(['El código de verificación debe ser de 6 dígitos.'])
      return
    }
    if (newPassword.length < 10) {
      setRecoveryErr(['La nueva contraseña debe tener al menos 10 caracteres.'])
      return
    }
    if (newPassword !== confirmPassword) {
      setRecoveryErr(['Las contraseñas ingresadas no coinciden.'])
      return
    }

    setRecoveryBusy(true)
    try {
      const res = await api.post('/auth/reset-password-code', {
        email: recoveryEmail.trim(),
        code: recoveryCode.trim(),
        new_password: newPassword,
      })
      setRecoverySuccess(res.message || 'Contraseña actualizada exitosamente.')
      setRecoveryStep(3)
    } catch (err) {
      setRecoveryErr(errorList(err))
    } finally {
      setRecoveryBusy(false)
    }
  }

  return (
    <div className="login-login-screen">
      <div className="login-workspace-container">
        {/* ── Ilustración plana del espacio de trabajo (Imagen 3) ───────── */}
        <div className="login-illustration-pane">
          <svg viewBox="0 0 650 500" style={{ width: '100%', maxWidth: 580, height: 'auto' }} fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Reloj de pared circular arriba */}
            <circle cx="340" cy="110" r="50" fill="#ffffff" stroke="#2563eb" strokeWidth="12" />
            <circle cx="340" cy="110" r="5" fill="#1e40af" />
            <path d="M340 110V78" stroke="#1e40af" strokeWidth="6" strokeLinecap="round" />
            <path d="M340 110L360 120" stroke="#1e40af" strokeWidth="6" strokeLinecap="round" />

            {/* Calendario en la pared a la izquierda */}
            <rect x="60" y="145" width="130" height="120" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
            <path d="M60 145H190V175H60V145Z" fill="#3b82f6" />
            {/* Cuadrícula del calendario */}
            <line x1="60" y1="200" x2="190" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1="60" y1="225" x2="190" y2="225" stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1="60" y1="250" x2="190" y2="250" stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1="92" y1="175" x2="92" y2="265" stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1="125" y1="175" x2="125" y2="265" stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1="158" y1="175" x2="158" y2="265" stroke="#e2e8f0" strokeWidth="1.5" />
            {/* Marca de X en un día */}
            <path d="M99 208L117 222M117 208L99 222" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />

            {/* Escritorio moderno: tablero y patas */}
            <rect x="50" y="325" width="530" height="16" rx="3" fill="#1e3a8a" />
            {/* Patas en triángulo */}
            <path d="M110 341L70 455H90L125 341H110Z" fill="#3b82f6" />
            <path d="M125 341L160 455H140L110 341H125Z" fill="#2563eb" />
            <line x1="80" y1="420" x2="150" y2="420" stroke="#1d4ed8" strokeWidth="5" strokeLinecap="round" />

            <path d="M530 341L490 455H510L545 341H530Z" fill="#3b82f6" />
            <path d="M545 341L580 455H560L530 341H545Z" fill="#2563eb" />
            <line x1="500" y1="420" x2="570" y2="420" stroke="#1d4ed8" strokeWidth="5" strokeLinecap="round" />

            {/* Monitor de computadora */}
            <rect x="200" y="200" width="185" height="115" rx="6" fill="#ffffff" stroke="#93c5fd" strokeWidth="4" />
            <rect x="210" y="210" width="165" height="95" rx="3" fill="#f8fafc" />
            <rect x="220" y="222" width="60" height="50" rx="3" fill="#60a5fa" />
            <path d="M225 258L240 240L255 258H225Z" fill="#ffffff" opacity="0.8" />
            <line x1="295" y1="230" x2="355" y2="230" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />
            <line x1="295" y1="242" x2="345" y2="242" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />
            <line x1="295" y1="254" x2="350" y2="254" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />
            {/* Soporte del monitor */}
            <rect x="282" y="315" width="22" height="12" fill="#94a3b8" />
            <rect x="260" y="323" width="65" height="4" rx="2" fill="#64748b" />

            {/* Taza de café */}
            <rect x="140" y="285" width="28" height="40" rx="4" fill="#ffffff" />
            <path d="M168 295C175 295 178 300 178 305C178 310 175 315 168 315" stroke="#ffffff" strokeWidth="4" />

            {/* Lámpara de escritorio articulada */}
            <path d="M495 325L520 230L440 185" stroke="#1e3a8a" strokeWidth="6" strokeLinecap="round" />
            <circle cx="520" cy="230" r="7" fill="#1e40af" />
            <circle cx="440" cy="185" r="7" fill="#1e40af" />
            {/* Pantalla de lámpara */}
            <path d="M425 175L455 195L440 215L410 195Z" fill="#2563eb" />
            {/* Cono de luz sutil */}
            <path d="M410 205L340 325H480L445 205Z" fill="#fef08a" opacity="0.15" />

            {/* Silla ergonómica azul */}
            <rect x="178" y="240" width="80" height="150" rx="14" fill="#2563eb" />
            <rect x="168" y="370" width="100" height="28" rx="8" fill="#1d4ed8" />
            {/* Reposabrazos */}
            <path d="M165 330V355H180" stroke="#1e3a8a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M272 330V355H257" stroke="#1e3a8a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            {/* Base neumática y ruedas */}
            <rect x="212" y="398" width="12" height="40" fill="#0f172a" />
            <path d="M218 438L180 470M218 438L255 470M218 438L218 472" stroke="#0f172a" strokeWidth="8" strokeLinecap="round" />
            <circle cx="178" cy="472" r="6" fill="#0f172a" />
            <circle cx="218" cy="474" r="6" fill="#0f172a" />
            <circle cx="257" cy="472" r="6" fill="#0f172a" />

            {/* Línea de suelo sutil */}
            <line x1="20" y1="475" x2="630" y2="475" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 6" />
          </svg>
        </div>

        {/* ── Tarjeta Flotante Derecha (Imagen 3) ──────────────────────── */}
        <div className="login-floating-card">
          <div className="login-card-top-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Dashboard Login</span>
          </div>

          {err.length > 0 && (
            <div className="login-error-banner">
              Wrong Password!! {err[0]}
            </div>
          )}

          <h2 className="login-welcome-title">BIENVENIDO</h2>
          <p className="login-welcome-sub">¡Ingresa a tu cuenta para gestionar tus trámites!</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
            {/* Botón principal: Iniciar sesión con Keycloak */}
            <button
              type="button"
              className="login-btn-submit"
              disabled={busy}
              onClick={loginOidc}
              style={{
                padding: '14px 20px',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.01em',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>Iniciar sesión con {config?.oidc?.provider_name || 'Keycloak'}</span>
            </button>

            {/* Enlace de recuperación de contraseña */}
            <a
              href="#recuperar"
              className="login-forgot-link"
              onClick={handleOpenRecovery}
              style={{ marginTop: 8 }}
            >
              ¿Olvidaste tu contraseña? Restablécela con código por correo
            </a>
          </div>
        </div>
      </div>

      {/* ── Modal de Restablecer Contraseña (Diseño Imagen 3: Kinety Mailbox) ── */}
      {showRecovery && (
        <div className="pwd-modal-overlay" onClick={() => setShowRecovery(false)}>
          <div
            className="pwd-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Barra superior con marca y botón cerrar */}
            <div className="pwd-modal-top-bar">
              <div className="pwd-brand-tag">
                <span className="pwd-brand-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <span>PluriOne</span>
              </div>
              <button
                type="button"
                className="pwd-close-btn"
                onClick={() => setShowRecovery(false)}
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* Ilustración de buzón con carta estilo Imagen 3 (sin emojis) */}
            <div className="pwd-illustration-wrap">
              <MailboxGraphic />
            </div>

            {/* Paso 1: Solicitar código al correo */}
            {recoveryStep === 1 && (
              <>
                <div className="pwd-header-center">
                  <h2 className="pwd-main-title">Recuperar contraseña</h2>
                  <p className="pwd-main-subtitle">
                    Ingresa tu correo institucional o usuario para enviarte tu código de recuperación.
                  </p>
                </div>

                {recoveryErr.length > 0 && <Alert kind="err" items={recoveryErr} />}

                <form onSubmit={handleSendCode} className="pwd-form">
                  <div className="pwd-field-group">
                    <label className="pwd-field-label">Correo electrónico o usuario</label>
                    <input
                      type="text"
                      className="pwd-input"
                      placeholder="ej. usuario@plurione.com"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="pwd-btn-submit-orange"
                    disabled={recoveryBusy || !recoveryEmail.trim()}
                  >
                    {recoveryBusy ? 'Enviando código…' : 'Enviar código de recuperación'}
                  </button>

                  <div className="pwd-secondary-actions" style={{ justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="pwd-btn-link"
                      onClick={() => setRecoveryStep(2)}
                    >
                      ¿Ya cuentas con un código de verificación? Ingrésalo aquí
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Paso 2: Diseño Imagen 3 (Reset password + código + ver contraseña) */}
            {recoveryStep === 2 && (
              <>
                <div className="pwd-header-center">
                  <h2 className="pwd-main-title">Restablecer contraseña</h2>
                  <p className="pwd-main-subtitle">
                    Ingresa tu código de verificación y define tu nueva contraseña.
                  </p>
                </div>

                {recoveryErr.length > 0 && <Alert kind="err" items={recoveryErr} />}
                {recoverySuccess && <Alert kind="info">{recoverySuccess}</Alert>}

                {devCode && (
                  <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '8px 12px', borderRadius: 8, fontSize: 12, color: '#92400e', marginBottom: 12 }}>
                    <b>Código de prueba para evaluación:</b> <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 'bold', letterSpacing: 2 }}>{devCode}</span> (Válido 10 min · Máx. 3 intentos)
                  </div>
                )}

                <form onSubmit={handleResetPassword} className="pwd-form">
                  {/* Correo o identificador si no está preestablecido */}
                  {!recoveryEmail.trim() && (
                    <div className="pwd-field-group">
                      <label className="pwd-field-label">Correo electrónico o usuario</label>
                      <input
                        type="text"
                        className="pwd-input"
                        placeholder="ej. usuario@plurione.com"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {/* Código de verificación de 6 dígitos */}
                  <div className="pwd-field-group">
                    <label className="pwd-field-label">Código de verificación</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="pwd-input"
                      style={{ letterSpacing: '4px', fontWeight: '700', fontSize: '15px' }}
                      placeholder="Ingresa los 6 dígitos"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                      required
                      autoFocus
                    />
                  </div>

                  {/* Nueva contraseña con botón para ver contraseña + indicador de fuerza */}
                  <div className="pwd-field-group">
                    <label className="pwd-field-label">Nueva contraseña</label>
                    <div className="pwd-input-wrapper">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        className="pwd-input"
                        placeholder="Mínimo 10 caracteres"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={10}
                      />
                      <button
                        type="button"
                        className="pwd-toggle-btn"
                        onClick={() => setShowNewPassword((v) => !v)}
                        title={showNewPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      >
                        {showNewPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Barra de fortaleza estilo Imagen 3 */}
                    {newPassword && (
                      <div className="pwd-strength-container">
                        <div className="pwd-strength-bars">
                          {[1, 2, 3, 4].map((level) => {
                            const strength = getPasswordStrength(newPassword)
                            const isFilled = strength.score >= level
                            return (
                              <div
                                key={level}
                                className="pwd-strength-bar"
                                style={{
                                  background: isFilled ? strength.color : undefined,
                                }}
                              />
                            )
                          })}
                        </div>
                        <span
                          className="pwd-strength-text"
                          style={{ color: getPasswordStrength(newPassword).color }}
                        >
                          Fortaleza de contraseña: {getPasswordStrength(newPassword).label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirmar nueva contraseña con botón para ver contraseña */}
                  <div className="pwd-field-group">
                    <label className="pwd-field-label">Confirmar nueva contraseña</label>
                    <div className="pwd-input-wrapper">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="pwd-input"
                        placeholder="Repite la nueva contraseña"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={10}
                      />
                      <button
                        type="button"
                        className="pwd-toggle-btn"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        title={showConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      >
                        {showConfirmPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Botón Naranja Pill */}
                  <button
                    type="submit"
                    className="pwd-btn-submit-orange"
                    disabled={recoveryBusy || recoveryCode.length !== 6 || newPassword.length < 10 || (confirmPassword && newPassword !== confirmPassword)}
                  >
                    {recoveryBusy ? 'Verificando…' : 'Restablecer contraseña'}
                  </button>

                  {/* Acciones secundarias sin emojis */}
                  <div className="pwd-secondary-actions">
                    <button
                      type="button"
                      className="pwd-btn-link"
                      onClick={handleSendCode}
                      disabled={recoveryBusy || !recoveryEmail.trim()}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                      </svg>
                      <span>Reenviar código</span>
                    </button>
                    <button
                      type="button"
                      className="pwd-btn-link"
                      onClick={() => setRecoveryStep(1)}
                      disabled={recoveryBusy}
                    >
                      <span>Atrás</span>
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Paso 3: Éxito (sin emojis) */}
            {recoveryStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, padding: '10px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', color: '#16a34a' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 className="pwd-main-title" style={{ color: '#16a34a', margin: 0 }}>
                  ¡Contraseña restablecida!
                </h3>
                <p className="pwd-main-subtitle">
                  Tu contraseña ha sido actualizada exitosamente. Ya puedes ingresar al portal con tu nueva contraseña.
                </p>
                <button
                  type="button"
                  className="pwd-btn-submit-orange"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={() => setShowRecovery(false)}
                >
                  Ir a Iniciar Sesión
                </button>
              </div>
            )}

            {/* Pie de página sutil como en Imagen 3 */}
            <div className="pwd-footer-meta">
              Copyright © 2026 PluriOne · Seguridad y Privacidad
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
