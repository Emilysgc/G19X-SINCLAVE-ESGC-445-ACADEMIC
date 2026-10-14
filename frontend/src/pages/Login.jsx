import React, { useState } from 'react'
import { useAuth } from '../services/auth.jsx'
import { Alert, Field } from '../components/ui.jsx'
import { errorList } from '../services/api'

export default function Login() {
  const { config, loginOidc } = useAuth()
  const [err, setErr] = useState([])
  const [busy, setBusy] = useState(false)

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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
