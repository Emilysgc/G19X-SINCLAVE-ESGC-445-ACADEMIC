import React, { useState } from 'react'
import { useAuth } from '../services/auth.jsx'
import { Alert, Field, Modal } from '../components/ui.jsx'
import { api, errorList } from '../services/api'

export default function Login() {
  const { config, loginOidc } = useAuth()
  const [err, setErr] = useState([])
  const [busy, setBusy] = useState(false)

  // Estados del modal de recuperación con código
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryStep, setRecoveryStep] = useState(1) // 1: pedir correo, 2: ingresar código y contraseña, 3: éxito
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [devCode, setDevCode] = useState('')
  const [recoveryErr, setRecoveryErr] = useState([])
  const [recoverySuccess, setRecoverySuccess] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)

  const run = async (fn) => {
    setErr([])
    setBusy(true)
    try {
      await fn()
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
    <div className="auth">
      <div className="auth-brand">
        <div className="logo-mark lg">RH</div>
        <h2>Gestiona tus trámites de RRHH en minutos</h2>
        <ul>
          <li>✓ Vacaciones, permisos y constancias en un solo lugar</li>
          <li>✓ Validación automática con reglas e inteligencia artificial</li>
          <li>✓ Seguimiento en tiempo real y aprobaciones ágiles</li>
        </ul>
      </div>
      <div className="box">
        <div className="card auth-card">
          <h1>{config?.company_name || 'Solicitudes de RRHH'}</h1>
          <p className="muted">Inicia sesión con tu cuenta corporativa para gestionar tus solicitudes internas.</p>

          {err.length > 0 && <Alert kind="err" items={err} />}

          {/* Inicio de sesión corporativo con Keycloak (OIDC) */}
          {config?.oidc?.enabled && (
            <div style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                style={{ width: '100%', padding: '10px 14px', fontSize: '0.95rem' }}
                disabled={busy}
                onClick={() => run(loginOidc)}
              >
                🔐 Iniciar sesión con {config.oidc.provider_name || 'Keycloak'}
              </button>
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <a
                  href="#recuperar"
                  onClick={handleOpenRecovery}
                  style={{ color: 'var(--brand)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}
                >
                  ¿Olvidaste tu contraseña? Restablécela con código por correo
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de recuperación de contraseña con código OTP */}
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
                Ingresa tu correo corporativo o usuario (ej: <b>nubec42@gmail.com</b> o <b>empleado2</b>). Te enviaremos un código de seguridad de 6 dígitos válido por 10 minutos con límite de 3 intentos.
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
                Tu contraseña ha sido sincronizada en el sistema y en Keycloak. Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
              <button
                className="btn primary"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => {
                  setShowRecovery(false)
                  loginOidc()
                }}
              >
                🔐 Iniciar sesión ahora
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
