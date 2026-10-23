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
  const [devCode, setDevCode] = useState('')
  const [recoveryErr, setRecoveryErr] = useState([])
  const [recoverySuccess, setRecoverySuccess] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)

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

      {/* ── Modal de Recuperación con Código OTP (10 min · 3 intentos) ── */}
      {showRecovery && (
        <Modal
          title={
            recoveryStep === 1
              ? 'Recuperación de contraseña'
              : recoveryStep === 2
              ? 'Verificación y nueva contraseña'
              : '¡Contraseña restablecida!'
          }
          onClose={() => setShowRecovery(false)}
        >
          {recoveryErr.length > 0 && <Alert kind="err" items={recoveryErr} />}

          {recoveryStep === 1 && (
            <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Ingresa tu correo corporativo o número de empleado. Te enviaremos un código de seguridad de 6 dígitos con límite de 3 intentos y validez de 10 minutos.
              </p>

              <Field label="Correo o usuario">
                <input
                  type="text"
                  placeholder="ej. nubec42@gmail.com o empleado2"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  autoFocus
                  required
                />
              </Field>

              <div className="row end" style={{ marginTop: 8, gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowRecovery(false)}
                  disabled={recoveryBusy}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={recoveryBusy || !recoveryEmail.trim()}
                >
                  {recoveryBusy ? 'Enviando código…' : 'Enviar código al correo'}
                </button>
              </div>
            </form>
          )}

          {recoveryStep === 2 && (
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {recoverySuccess && <Alert kind="info">{recoverySuccess}</Alert>}

              {devCode && (
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '8px 12px', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                  🔑 <b>Código generado por el servidor:</b> <span style={{ fontFamily: 'monospace', fontSize: 16, letterSpacing: 2, fontWeight: 'bold' }}>{devCode}</span> (Válido por 10 min · Máx. 3 intentos)
                </div>
              )}

              <div style={{ background: '#f1f5f9', padding: '10px 12px', borderRadius: 6, fontSize: 12, color: '#475569' }}>
                ⏱️ <b>Tiempo límite:</b> El código expira en <b>10 minutos</b>.<br />
                🛡️ <b>Seguridad:</b> Cuentas con un máximo de <b>3 intentos</b> antes de que el código sea cancelado automáticamente.
              </div>

              <Field label="Código de 6 dígitos" hint="Revisa tu bandeja de entrada o spam">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                  style={{ fontSize: '1.25rem', letterSpacing: 6, textAlign: 'center', fontWeight: 'bold' }}
                  autoFocus
                  required
                />
              </Field>

              <Field label="Nueva contraseña" hint="Mínimo 10 caracteres">
                <input
                  type="password"
                  placeholder="••••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </Field>

              <Field label="Confirmar nueva contraseña">
                <input
                  type="password"
                  placeholder="••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </Field>

              <div className="row between" style={{ marginTop: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={handleSendCode}
                  disabled={recoveryBusy}
                  style={{ color: 'var(--brand)' }}
                >
                  🔄 Reenviar código
                </button>

                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setRecoveryStep(1)}
                    disabled={recoveryBusy}
                  >
                    Atrás
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={recoveryBusy || recoveryCode.length !== 6 || newPassword.length < 10}
                  >
                    {recoveryBusy ? 'Verificando…' : 'Restablecer contraseña'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {recoveryStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 42 }}>✅</div>
              <h3 style={{ margin: 0, color: '#16a34a' }}>¡Contraseña actualizada con éxito!</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Tu contraseña ha sido sincronizada. Ya puedes iniciar sesión en el portal con tu nueva contraseña.
              </p>
              <button
                className="btn primary"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => setShowRecovery(false)}
              >
                Ir a Iniciar Sesión
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
