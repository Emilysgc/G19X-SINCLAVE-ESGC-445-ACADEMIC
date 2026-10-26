import React, { useState } from 'react'
import { useAuth } from '../services/auth.jsx'
import { api, errorList } from '../services/api'
import { Alert, Modal, initials } from '../components/ui.jsx'
import { ROLE } from '../services/labels'

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()

  // Dividir nombre completo en nombre(s) y apellidos
  const nameParts = (user?.full_name || '').trim().split(' ')
  const defaultFirst = nameParts.slice(0, Math.max(1, nameParts.length - 1)).join(' ')
  const defaultLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''

  const [isEditingPersonal, setIsEditingPersonal] = useState(false)
  const [firstName, setFirstName] = useState(defaultFirst)
  const [lastName, setLastName] = useState(defaultLast)
  const [phone, setPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState(user?.address || '')
  const [location, setLocation] = useState(user?.department?.name || 'Ciudad de México, México')
  const [postalCode, setPostalCode] = useState('06000')

  // Seguridad y contraseñas
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Avatar
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || null)

  // Mensajes y estados
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState([])
  const [busy, setBusy] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const handleAvatarSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setErr(['Formato de imagen no válido. Usa JPG, PNG, WEBP o GIF.'])
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr(['La imagen no debe superar los 2 MB.'])
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setErr([])

    // Subir de inmediato el avatar
    try {
      setBusy(true)
      const res = await api.upload('/users/me/avatar', file)
      if (res.avatar_url) {
        setAvatarPreview(res.avatar_url)
      }
      setMsg('Foto de perfil actualizada correctamente.')
      if (refreshUser) refreshUser()
    } catch (x) {
      setErr(errorList(x))
    } finally {
      setBusy(false)
    }
  }

  const handleDiscardPersonal = () => {
    setFirstName(defaultFirst)
    setLastName(defaultLast)
    setPhone(user?.phone || '')
    setAddress(user?.address || '')
    setIsEditingPersonal(false)
    setErr([])
  }

  const handleSavePersonal = async (e) => {
    e.preventDefault()
    setMsg('')
    setErr([])
    setBusy(true)

    try {
      const fullCombinedName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const body = {
        full_name: fullCombinedName || user?.full_name,
        phone: phone.trim() || null,
        address: address.trim() || null,
      }

      await api.patch('/users/me/profile', body)
      setMsg('Información personal guardada con éxito.')
      setIsEditingPersonal(false)
      if (refreshUser) refreshUser()
    } catch (x) {
      setErr(errorList(x))
    } finally {
      setBusy(false)
    }
  }

  const handleSavePassword = async (e) => {
    e.preventDefault()
    setMsg('')
    setErr([])

    if (newPassword !== confirmPassword) {
      setErr(['La confirmación de la nueva contraseña no coincide.'])
      return
    }
    if (newPassword.length < 10) {
      setErr(['La nueva contraseña debe contener al menos 10 caracteres.'])
      return
    }

    setBusy(true)
    try {
      await api.patch('/users/me/profile', {
        new_password: newPassword,
        current_password: currentPassword || undefined,
      })
      setMsg('Contraseña actualizada correctamente.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (x) {
      setErr(errorList(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="prof5-page-container">
      <div className="prof5-header-row">
        <h1 className="prof5-page-title">Mi Perfil</h1>
      </div>

      {msg && <Alert kind="ok">{msg}</Alert>}
      {err.length > 0 && <Alert kind="err" items={err} />}

      {/* ── Tarjeta 1: Perfil Hero con Avatar Centrado (Imagen 5) ───── */}
      <div className="prof5-card prof5-hero-card">
        <div className="prof5-avatar-container">
          {avatarPreview ? (
            <img src={avatarPreview} alt={user?.full_name} className="prof5-avatar-img" />
          ) : (
            <div className="prof5-avatar-placeholder">
              {initials(user?.full_name || 'U')}
            </div>
          )}
          <label className="prof5-avatar-edit-badge" title="Cambiar foto de perfil">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <input
              type="file"
              accept="image/png, image/jpeg, image/webp, image/gif"
              hidden
              onChange={handleAvatarSelect}
            />
          </label>
        </div>

        <h2 className="prof5-hero-name">{user?.full_name || 'Colaborador PluriOne'}</h2>
        <div className="prof5-hero-role">{user?.job_title || ROLE[user?.role] || 'Recursos Humanos'}</div>
        <div className="prof5-hero-location">{user?.department?.name || 'Corporativo · Ciudad de México, México'}</div>
      </div>

      {/* ── Tarjeta 2: Información Personal con Botón Edit (Imagen 5) ─── */}
      <div className="prof5-card">
        <div className="prof5-card-header">
          <h3 className="prof5-card-title">Información Personal</h3>
          {!isEditingPersonal ? (
            <button
              type="button"
              className="prof5-btn-edit"
              onClick={() => setIsEditingPersonal(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <span>Editar</span>
            </button>
          ) : (
            <button
              type="button"
              className="prof5-btn-cancel-edit"
              onClick={handleDiscardPersonal}
            >
              Cancelar
            </button>
          )}
        </div>

        {!isEditingPersonal ? (
          /* Vista estilo Imagen 5 con pares Etiqueta / Valor */
          <div className="prof5-info-grid">
            <div className="prof5-info-col">
              <span className="prof5-info-label">Nombre(s)</span>
              <span className="prof5-info-val">{firstName || '—'}</span>
            </div>
            <div className="prof5-info-col">
              <span className="prof5-info-label">Apellidos</span>
              <span className="prof5-info-val">{lastName || '—'}</span>
            </div>
            <div className="prof5-info-col">
              <span className="prof5-info-label">Ciudad / Sede</span>
              <span className="prof5-info-val">{location || 'Ciudad de México'}</span>
            </div>

            <div className="prof5-info-col">
              <span className="prof5-info-label">Correo electrónico</span>
              <div className="prof5-email-verified-row">
                <span className="prof5-info-val">{user?.email || '—'}</span>
                <span className="prof5-verified-pill">✔ Verificado</span>
              </div>
            </div>
            <div className="prof5-info-col">
              <span className="prof5-info-label">Teléfono</span>
              <span className="prof5-info-val">{phone || '(55) 5555-0128'}</span>
            </div>
            <div className="prof5-info-col">
              <span className="prof5-info-label">País</span>
              <span className="prof5-info-val">México</span>
            </div>

            <div className="prof5-info-col full">
              <span className="prof5-info-label">Dirección / Domicilio</span>
              <span className="prof5-info-val">{address || 'No especificado'}</span>
            </div>
          </div>
        ) : (
          /* Formulario de edición activa */
          <form onSubmit={handleSavePersonal} className="prof5-edit-form">
            <div className="prof5-form-grid-3">
              <div>
                <label className="prof5-field-label">Nombre(s)</label>
                <input
                  className="prof5-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="prof5-field-label">Apellidos</label>
                <input
                  className="prof5-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="prof5-field-label">Ciudad / Sede</label>
                <input
                  className="prof5-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="prof5-form-grid-3" style={{ marginTop: 14 }}>
              <div>
                <label className="prof5-field-label">Correo electrónico</label>
                <input
                  className="prof5-input"
                  disabled
                  value={user?.email || ''}
                  title="Gestionado institucionalmente"
                />
              </div>
              <div>
                <label className="prof5-field-label">Teléfono</label>
                <input
                  className="prof5-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(55) 5555-0128"
                />
              </div>
              <div>
                <label className="prof5-field-label">Código Postal</label>
                <input
                  className="prof5-input"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="prof5-field-label">Dirección / Domicilio</label>
              <input
                className="prof5-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, número exterior/interior, colonia..."
              />
            </div>

            <div className="prof5-actions-row">
              <button
                type="button"
                className="prof5-btn-discard"
                onClick={handleDiscardPersonal}
                disabled={busy}
              >
                Descartar
              </button>
              <button
                type="submit"
                className="prof5-btn-save"
                disabled={busy}
              >
                {busy ? 'Guardando…' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Tarjeta 3: Información Laboral & Vacaciones LFT (Imagen 5) ─ */}
      <div className="prof5-card">
        <div className="prof5-card-header">
          <h3 className="prof5-card-title">Información Laboral & Vacaciones (LFT)</h3>
          <span className="prof5-law-badge">Ley Federal del Trabajo</span>
        </div>

        <div className="prof5-info-grid">
          <div className="prof5-info-col">
            <span className="prof5-info-label">Fecha de Ingreso</span>
            <span className="prof5-info-val">{user?.hire_date || '01/06/2020'}</span>
          </div>
          <div className="prof5-info-col">
            <span className="prof5-info-label">Antigüedad Acumulada</span>
            <span className="prof5-info-val highlight-blue">
              {user?.years_of_service ?? 0} {user?.years_of_service === 1 ? 'año' : 'años'}
            </span>
          </div>
          <div className="prof5-info-col">
            <span className="prof5-info-label">Días por Ley al Año</span>
            <span className="prof5-info-val highlight-green">
              {user?.vacation_entitlement ?? 0} días (Vacaciones Dignas)
            </span>
          </div>

          <div className="prof5-info-col">
            <span className="prof5-info-label">Saldo Disponible</span>
            <span className="prof5-info-val highlight-orange">
              {user?.vacation_balance ?? 0} días
            </span>
          </div>
          <div className="prof5-info-col">
            <span className="prof5-info-label">Prima Vacacional</span>
            <span className="prof5-info-val">25% sobre salario (Art. 80 LFT)</span>
          </div>
          <div className="prof5-info-col">
            <span className="prof5-info-label">Rol en el Sistema</span>
            <span className="prof5-info-val">{ROLE[user?.role] || user?.role}</span>
          </div>
        </div>
      </div>

      {/* ── Tarjeta 4: Seguridad y Contraseña / Sesión Keycloak ──────── */}
      <div className="prof5-card">
        <div className="prof5-card-header">
          <h3 className="prof5-card-title">Seguridad y Acceso</h3>
          <span className="prof5-security-badge">
            {user?.auth_provider === 'keycloak' ? 'Keycloak OIDC' : 'Autenticación Local'}
          </span>
        </div>

        {user?.auth_provider === 'local' ? (
          <form onSubmit={handleSavePassword} className="prof5-edit-form">
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
              Cambia tu contraseña actual por una nueva clave de acceso seguro.
            </p>
            <div className="prof5-form-grid-3">
              <div>
                <label className="prof5-field-label">Contraseña Actual</label>
                <input
                  type="password"
                  className="prof5-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="prof5-field-label">Nueva Contraseña</label>
                <input
                  type="password"
                  className="prof5-input"
                  minLength={10}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 10 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="prof5-field-label">Confirmar Contraseña</label>
                <input
                  type="password"
                  className="prof5-input"
                  minLength={10}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="prof5-actions-row">
              <button
                type="submit"
                className="prof5-btn-save"
                disabled={busy || !newPassword}
              >
                {busy ? 'Actualizando…' : 'Actualizar Contraseña'}
              </button>
            </div>
          </form>
        ) : (
          <div className="prof5-keycloak-box">
            <div className="prof5-keycloak-icon">🔐</div>
            <div>
              <h4 className="prof5-keycloak-title">Inicio de sesión federado con Keycloak</h4>
              <p className="prof5-keycloak-text">
                Tu cuenta está protegida y autenticada centralmente mediante Keycloak SSO y tokens OIDC / PKCE. Para actualizar credenciales consulta al administrador institucional.
              </p>
            </div>
          </div>
        )}

        <div className="prof5-logout-bar">
          <button
            type="button"
            className="prof5-btn-logout"
            onClick={() => setShowLogoutModal(true)}
          >
            <span>🚪 Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {/* Modal de confirmación para cerrar sesión */}
      {showLogoutModal && (
        <Modal title="Confirmar cierre de sesión" onClose={() => setShowLogoutModal(false)}>
          <p style={{ margin: '0 0 16px', fontSize: 14 }}>
            ¿Estás seguro de que deseas cerrar tu sesión en el sistema?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowLogoutModal(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ background: '#dc2626', borderColor: '#dc2626' }}
              onClick={() => {
                setShowLogoutModal(false)
                logout()
              }}
            >
              Sí, cerrar sesión
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
