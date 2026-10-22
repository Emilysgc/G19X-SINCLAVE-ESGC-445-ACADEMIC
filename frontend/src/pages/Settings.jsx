import React, { useState } from 'react'
import { useAuth } from '../services/auth.jsx'
import { api, errorList } from '../services/api'
import { Alert, Modal, initials } from '../components/ui.jsx'
import { ROLE } from '../services/labels'

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('personal') // 'personal' | 'security' | 'vacations'

  // Dividir nombre completo en nombre(s) y apellidos para el diseño de 2 columnas de la Imagen 1
  const nameParts = (user?.full_name || '').trim().split(' ')
  const defaultFirst = nameParts.slice(0, Math.max(1, nameParts.length - 1)).join(' ')
  const defaultLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''

  const [firstName, setFirstName] = useState(defaultFirst)
  const [lastName, setLastName] = useState(defaultLast)
  const [gender, setGender] = useState('male') // 'male' | 'female' | 'other'
  const [phone, setPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState(user?.address || '')
  const [location, setLocation] = useState(user?.department?.name || 'Ciudad de México, México')
  const [postalCode, setPostalCode] = useState('06000')

  // Seguridad
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

  const handleAvatarSelect = (e) => {
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
  }

  const handleDiscard = () => {
    setFirstName(defaultFirst)
    setLastName(defaultLast)
    setPhone(user?.phone || '')
    setAddress(user?.address || '')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setAvatarFile(null)
    setAvatarPreview(user?.avatar_url || null)
    setErr([])
    setMsg('Cambios descartados.')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setMsg('')
    setErr([])

    if (newPassword && newPassword !== confirmPassword) {
      setErr(['La confirmación de la contraseña no coincide.'])
      return
    }
    if (newPassword && newPassword.length < 10) {
      setErr(['La nueva contraseña debe tener al menos 10 caracteres.'])
      return
    }

    setBusy(true)
    try {
      // 1. Subir avatar si hay un archivo seleccionado
      if (avatarFile) {
        const res = await api.upload('/users/me/avatar', avatarFile)
        if (res.avatar_url) {
          setAvatarPreview(res.avatar_url)
        }
      }

      // 2. Actualizar perfil y/o contraseña
      const fullCombinedName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const body = {
        full_name: fullCombinedName || user?.full_name,
        phone: phone.trim() || null,
        address: address.trim() || null,
      }
      if (newPassword) {
        body.new_password = newPassword
        body.current_password = currentPassword || undefined
      }

      await api.patch('/users/me/profile', body)
      setMsg('Información y cambios guardados correctamente.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setAvatarFile(null)
      if (refreshUser) refreshUser()
    } catch (x) {
      setErr(errorList(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', paddingBottom: 40 }}>
      {msg && <Alert kind="ok">{msg}</Alert>}
      {err.length > 0 && <Alert kind="err" items={err} />}

      <div className="img1-settings-container">
        {/* ── Tarjeta Lateral Izquierda (Imagen 1) ────────────────────── */}
        <aside className="img1-sidebar-card">
          <div className="img1-avatar-wrapper">
            {avatarPreview ? (
              <img src={avatarPreview} alt={user?.full_name} className="img1-avatar-img" />
            ) : (
              <div className="img1-avatar-placeholder">
                {initials(user?.full_name || 'U')}
              </div>
            )}
            <label className="img1-avatar-badge" title="Cambiar foto de perfil">
              ✎
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp, image/gif"
                hidden
                onChange={handleAvatarSelect}
              />
            </label>
          </div>

          <h3 className="img1-user-name">{user?.full_name || 'Colaborador'}</h3>
          <div className="img1-user-role">{user?.job_title || ROLE[user?.role] || 'Puesto en RRHH'}</div>

          <nav className="img1-nav-list">
            <button
              type="button"
              className={`img1-nav-item ${activeTab === 'personal' ? 'active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <span>👤</span> Información Personal
            </button>
            <button
              type="button"
              className={`img1-nav-item ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <span>🔒</span> Inicio de sesión y Contraseña
            </button>
            <button
              type="button"
              className={`img1-nav-item ${activeTab === 'vacations' ? 'active' : ''}`}
              onClick={() => setActiveTab('vacations')}
            >
              <span>🌴</span> Mis Vacaciones (LFT)
            </button>
            <button
              type="button"
              className="img1-nav-item logout"
              onClick={() => setShowLogoutModal(true)}
            >
              <span>🚪</span> Cerrar Sesión
            </button>
          </nav>
        </aside>

        {/* ── Tarjeta Principal Derecha (Imagen 1) ────────────────────── */}
        <main className="img1-main-card">
          {activeTab === 'personal' && (
            <form onSubmit={handleSave}>
              <h2 className="img1-section-title">Información Personal</h2>

              {/* Selector de Género / Identidad */}
              <div className="img1-radio-group">
                <label className="img1-radio-label">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={gender === 'male'}
                    onChange={() => setGender('male')}
                  />
                  Hombre
                </label>
                <label className="img1-radio-label">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={gender === 'female'}
                    onChange={() => setGender('female')}
                  />
                  Mujer
                </label>
                <label className="img1-radio-label">
                  <input
                    type="radio"
                    name="gender"
                    value="other"
                    checked={gender === 'other'}
                    onChange={() => setGender('other')}
                  />
                  Otro
                </label>
              </div>

              {/* Nombre y Apellidos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="img1-field-label">Nombre(s)</label>
                  <input
                    className="img1-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="img1-field-label">Apellidos</label>
                  <input
                    className="img1-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Correo Electrónico con Badge Verificado */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="img1-field-label" style={{ margin: 0 }}>Correo electrónico</label>
                  <span className="img1-verified-badge">✔ Verificado</span>
                </div>
                <input
                  className="img1-input"
                  disabled
                  value={user?.email || ''}
                  title="Gestionado institucionalmente"
                />
              </div>

              {/* Dirección */}
              <div style={{ marginBottom: 16 }}>
                <label className="img1-field-label">Dirección / Domicilio</label>
                <input
                  className="img1-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ej. Av. Insurgentes Sur 1602, Col. Crédito Constructor"
                />
              </div>

              {/* Teléfono y Fecha de Ingreso */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="img1-field-label">Número de Teléfono</label>
                  <input
                    className="img1-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(55) 5555-0128"
                  />
                </div>
                <div>
                  <label className="img1-field-label">Fecha de Ingreso (Laboral)</label>
                  <input
                    className="img1-input"
                    type="date"
                    disabled
                    value={user?.hire_date || ''}
                  />
                </div>
              </div>

              {/* Ubicación y Código Postal */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
                <div>
                  <label className="img1-field-label">Ubicación / Sede</label>
                  <input
                    className="img1-input"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div>
                  <label className="img1-field-label">Código Postal</label>
                  <input
                    className="img1-input"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
              </div>

              {/* Botones de Acción (Imagen 1) */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
                <button
                  type="button"
                  className="img1-btn-discard"
                  onClick={handleDiscard}
                  disabled={busy}
                >
                  Descartar Cambios
                </button>
                <button
                  type="submit"
                  className="img1-btn-save"
                  disabled={busy}
                >
                  {busy ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <form onSubmit={handleSave}>
              <h2 className="img1-section-title">Inicio de sesión y Contraseña</h2>
              {user?.auth_provider === 'local' ? (
                <>
                  <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 20 }}>
                    Para modificar tu contraseña actual, ingresa tus credenciales y confirma la nueva clave de acceso.
                  </p>
                  <div style={{ marginBottom: 16 }}>
                    <label className="img1-field-label">Contraseña actual</label>
                    <input
                      type="password"
                      className="img1-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña actual"
                      autoComplete="current-password"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
                    <div>
                      <label className="img1-field-label">Nueva contraseña</label>
                      <input
                        type="password"
                        className="img1-input"
                        minLength={10}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 10 caracteres"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className="img1-field-label">Confirmar nueva contraseña</label>
                      <input
                        type="password"
                        className="img1-input"
                        minLength={10}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite la contraseña"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
                    <button
                      type="button"
                      className="img1-btn-discard"
                      onClick={handleDiscard}
                      disabled={busy}
                    >
                      Descartar Cambios
                    </button>
                    <button
                      type="submit"
                      className="img1-btn-save"
                      disabled={busy || !newPassword}
                    >
                      {busy ? 'Guardando…' : 'Actualizar Contraseña'}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ background: '#eff6ff', padding: 18, borderRadius: 12, border: '1px solid #bfdbfe' }}>
                  <h4 style={{ margin: '0 0 6px', color: '#1e40af' }}>Inicio de sesión federado (Keycloak SSO)</h4>
                  <p className="muted" style={{ margin: 0, fontSize: 13, color: '#1e3a8a' }}>
                    Tu cuenta utiliza autenticación corporativa única. Para actualizar tu clave, acude al portal de autoservicio de Keycloak o solicita un enlace de restablecimiento con tu administrador.
                  </p>
                </div>
              )}
            </form>
          )}

          {activeTab === 'vacations' && (
            <div>
              <h2 className="img1-section-title">Mis Vacaciones y Antigüedad Laboral (LFT)</h2>
              <p className="muted" style={{ fontSize: 13, marginTop: -10, marginBottom: 20 }}>
                Información oficial calculada automáticamente conforme a tu fecha de ingreso y la Ley Federal del Trabajo de México.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>Fecha de ingreso</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>{user?.hire_date || 'Pendiente'}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>Antigüedad acumulada</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#2563eb', marginTop: 4 }}>
                    {user?.years_of_service ?? 0} {user?.years_of_service === 1 ? 'año' : 'años'}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>Días por ley al año</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#16a34a', marginTop: 4 }}>
                    {user?.vacation_entitlement ?? 0} días
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>Saldo actual disponible</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#ea580c', marginTop: 4 }}>
                    {user?.vacation_balance ?? 0} días
                  </div>
                </div>
              </div>

              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 16, fontSize: 13, color: '#1e3a8a', lineHeight: 1.5 }}>
                🏖️ <b>Art. 78 LFT:</b> Los trabajadores deben disfrutar de al menos 12 días continuos de descanso. Además, la empresa debe cubrir una <b>prima vacacional mínima equivalente al 25%</b> sobre el salario ordinario correspondiente a dicho periodo de vacaciones.
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal de confirmación para cerrar sesión */}
      {showLogoutModal && (
        <Modal title="Confirmar cierre de sesión" onClose={() => setShowLogoutModal(false)}>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#334155' }}>
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
