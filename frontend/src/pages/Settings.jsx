import React, { useState } from 'react'
import { useAuth } from '../services/auth.jsx'
import { api, errorList } from '../services/api'
import { Alert, Modal, initials } from '../components/ui.jsx'
import { ROLE } from '../services/labels'

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()

  // Separación adecuada de nombre(s) y apellidos (soporta 1 o 2 nombres de pila y 2 apellidos paterno/materno)
  const splitFullName = (raw) => {
    const parts = (raw || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return { first: '', last: '' }
    if (parts.length === 1) return { first: parts[0], last: '' }
    if (parts.length === 2) return { first: parts[0], last: parts[1] }
    if (parts.length === 3) return { first: parts[0], last: `${parts[1]} ${parts[2]}` }
    return {
      first: parts.slice(0, parts.length - 2).join(' '),
      last: parts.slice(parts.length - 2).join(' '),
    }
  }

  const { first: defaultFirst, last: defaultLast } = splitFullName(user?.full_name)

  const [isEditingPersonal, setIsEditingPersonal] = useState(false)
  const [firstName, setFirstName] = useState(defaultFirst)
  const [lastName, setLastName] = useState(defaultLast)
  const [phone, setPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState(user?.address || '')

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
    const { first, last } = splitFullName(user?.full_name)
    setFirstName(first)
    setLastName(last)
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
        phone: phone.trim() ? phone.trim() : null,
        address: address.trim() ? address.trim() : null,
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
    <div className="profile-page-container">
      <div className="profile-header-row">
        <h1 className="profile-page-title">Mi Perfil</h1>
      </div>

      {msg && <Alert kind="ok">{msg}</Alert>}
      {err.length > 0 && <Alert kind="err" items={err} />}

      {/* Tarjeta 1: Perfil Hero con Avatar */}
      <div className="profile-card profile-hero-card">
        <div className="profile-avatar-container">
          {avatarPreview ? (
            <img src={avatarPreview} alt={user?.full_name} className="profile-avatar-img" />
          ) : (
            <div className="profile-avatar-placeholder">
              {initials(user?.full_name || 'U')}
            </div>
          )}
          <label className="profile-avatar-edit-badge" title="Cambiar foto de perfil">
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

        <h2 className="profile-hero-name">{user?.full_name || 'Colaborador PluriOne'}</h2>
        <div className="profile-hero-role">{user?.job_title || ROLE[user?.role] || 'Colaborador'}</div>
        <div className="profile-hero-location">{user?.department?.name || 'Sin departamento asignado'}</div>
      </div>

      {/* Tarjeta 2: Información Personal */}
      <div className="profile-card">
        <div className="profile-card-header">
          <h3 className="profile-card-title">Información Personal</h3>
          {!isEditingPersonal ? (
            <button
              type="button"
              className="profile-btn-edit"
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
              className="profile-btn-cancel-edit"
              onClick={handleDiscardPersonal}
            >
              Cancelar
            </button>
          )}
        </div>

        {!isEditingPersonal ? (
          <div className="profile-info-grid">
            <div className="profile-info-col">
              <span className="profile-info-label">Nombre(s)</span>
              <span className="profile-info-val">{firstName || '—'}</span>
            </div>
            <div className="profile-info-col">
              <span className="profile-info-label">Apellidos</span>
              <span className="profile-info-val">{lastName || '—'}</span>
            </div>
            <div className="profile-info-col">
              <span className="profile-info-label">Puesto / Cargo</span>
              <span className="profile-info-val">{user?.job_title || 'No registrado'}</span>
            </div>

            <div className="profile-info-col">
              <span className="profile-info-label">Correo electrónico</span>
              <span className="profile-info-val">{user?.email || '—'}</span>
            </div>
            <div className="profile-info-col">
              <span className="profile-info-label">Teléfono</span>
              <span className="profile-info-val">{user?.phone || 'No registrado'}</span>
            </div>
            <div className="profile-info-col">
              <span className="profile-info-label">Departamento</span>
              <span className="profile-info-val">{user?.department?.name || 'Sin departamento asignado'}</span>
            </div>

            <div className="profile-info-col full">
              <span className="profile-info-label">Dirección / Domicilio</span>
              <span className="profile-info-val">{user?.address || 'No registrado'}</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSavePersonal} className="profile-edit-form">
            <div className="profile-form-grid-2">
              <div>
                <label className="profile-field-label">Nombre(s)</label>
                <input
                  className="profile-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="profile-field-label">Apellidos</label>
                <input
                  className="profile-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="profile-form-grid-2" style={{ marginTop: 14 }}>
              <div>
                <label className="profile-field-label">Teléfono</label>
                <input
                  className="profile-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej. 55 1234 5678"
                />
              </div>
              <div>
                <label className="profile-field-label">Correo institucional</label>
                <input
                  className="profile-input"
                  disabled
                  value={user?.email || ''}
                  title="Gestionado institucionalmente"
                />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="profile-field-label">Dirección / Domicilio</label>
              <input
                className="profile-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, número exterior/interior, colonia, alcaldía o municipio..."
              />
            </div>

            <div className="profile-actions-row">
              <button
                type="button"
                className="profile-btn-discard"
                onClick={handleDiscardPersonal}
                disabled={busy}
              >
                Descartar
              </button>
              <button
                type="submit"
                className="profile-btn-save"
                disabled={busy}
              >
                {busy ? 'Guardando…' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Tarjeta 3: Información Laboral & Vacaciones LFT */}
      <div className="profile-card">
        <div className="profile-card-header">
          <h3 className="profile-card-title">Información Laboral & Vacaciones (LFT)</h3>
          <span className="profile-law-badge">Ley Federal del Trabajo</span>
        </div>

        <div className="profile-info-grid">
          <div className="profile-info-col">
            <span className="profile-info-label">Fecha de Ingreso</span>
            <span className="profile-info-val">{user?.hire_date || 'No registrada'}</span>
          </div>
          <div className="profile-info-col">
            <span className="profile-info-label">Antigüedad Acumulada</span>
            <span className="profile-info-val highlight-blue">
              {user?.years_of_service ?? 0} {user?.years_of_service === 1 ? 'año' : 'años'}
            </span>
          </div>
          <div className="profile-info-col">
            <span className="profile-info-label">Días por Ley al Año</span>
            <span className="profile-info-val highlight-green">
              {user?.vacation_entitlement ?? 0} días (Vacaciones Dignas)
            </span>
          </div>
          <div className="profile-info-col">
            <span className="profile-info-label">Saldo Disponible</span>
            <span className="profile-info-val highlight-orange">
              {user?.vacation_balance ?? 0} días
            </span>
          </div>
          <div className="profile-info-col">
            <span className="profile-info-label">Prima Vacacional</span>
            <span className="profile-info-val">25% sobre salario (Art. 80 LFT)</span>
          </div>
          <div className="profile-info-col">
            <span className="profile-info-label">Rol en el Sistema</span>
            <span className="profile-info-val">{ROLE[user?.role] || user?.role}</span>
          </div>
        </div>
      </div>

      {/* Tarjeta 4: Seguridad y Acceso */}
      <div className="profile-card">
        <div className="profile-card-header">
          <h3 className="profile-card-title">Seguridad y Acceso</h3>
          <span className="profile-security-badge">
            {user?.auth_provider === 'keycloak' ? 'Keycloak OIDC' : 'Autenticación Local'}
          </span>
        </div>

        {user?.auth_provider === 'local' ? (
          <form onSubmit={handleSavePassword} className="profile-edit-form">
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
              Cambia tu contraseña actual por una nueva clave de acceso seguro.
            </p>
            <div className="profile-form-grid-3">
              <div>
                <label className="profile-field-label">Contraseña Actual</label>
                <input
                  type="password"
                  className="profile-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="profile-field-label">Nueva Contraseña</label>
                <input
                  type="password"
                  className="profile-input"
                  minLength={10}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 10 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="profile-field-label">Confirmar Contraseña</label>
                <input
                  type="password"
                  className="profile-input"
                  minLength={10}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="profile-actions-row">
              <button
                type="submit"
                className="profile-btn-save"
                disabled={busy || !newPassword}
              >
                {busy ? 'Actualizando…' : 'Actualizar Contraseña'}
              </button>
            </div>
          </form>
        ) : (
          <div className="profile-keycloak-box">
            <div className="profile-keycloak-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h4 className="profile-keycloak-title">Inicio de sesión federado con Keycloak</h4>
              <p className="profile-keycloak-text">
                Tu cuenta está protegida y autenticada centralmente mediante Keycloak SSO y tokens OIDC / PKCE. Para actualizar credenciales consulta al administrador institucional.
              </p>
            </div>
          </div>
        )}

        <div className="profile-logout-bar">
          <button
            type="button"
            className="profile-btn-logout"
            onClick={() => setShowLogoutModal(true)}
          >
            <span>Cerrar Sesión</span>
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
