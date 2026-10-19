import React, { useState } from 'react'
import { useAuth } from '../services/auth.jsx'
import { api, errorList } from '../services/api'
import { Alert, Field, initials } from '../components/ui.jsx'
import { ROLE } from '../services/labels'

export default function Settings() {
  const { user, refreshUser } = useAuth()
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState(user?.address || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || null)

  const [msg, setMsg] = useState('')
  const [err, setErr] = useState([])
  const [busy, setBusy] = useState(false)

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
      const body = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
      }
      if (newPassword) {
        body.new_password = newPassword
        body.current_password = currentPassword || undefined
      }

      await api.patch('/users/me/profile', body)
      setMsg('Perfil y configuración guardados correctamente.')
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
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>Configuración de mi cuenta</h1>
          <p className="muted">Administra tu foto de perfil, datos personales y contraseña de acceso.</p>
        </div>
      </div>

      {msg && <Alert kind="ok">{msg}</Alert>}
      {err.length > 0 && <Alert kind="err" items={err} />}

      <form onSubmit={handleSave}>
        {/* Tarjeta de Foto de perfil con diseño moderno */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginBottom: 16 }}>Foto de perfil</h2>
          <div className="row" style={{ gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="avatar-preview-box">
              {avatarPreview ? (
                <img src={avatarPreview} alt={fullName} className="avatar-img-lg" />
              ) : (
                <div className="avatar-placeholder-lg">{initials(fullName)}</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row" style={{ gap: 10 }}>
                <label className="btn primary" style={{ margin: 0, cursor: 'pointer' }}>
                  Seleccionar foto
                  <input type="file" accept="image/png, image/jpeg, image/webp, image/gif" hidden onChange={handleAvatarSelect} />
                </label>
                {avatarFile && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      setAvatarFile(null)
                      setAvatarPreview(user?.avatar_url || null)
                    }}
                  >
                    Deshacer
                  </button>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Formatos permitidos: JPG, PNG, WEBP o GIF (máximo 2 MB). Haz clic en "Guardar cambios" para aplicar.
              </div>
            </div>
          </div>
        </div>

        {/* Información personal */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginBottom: 16 }}>Información personal</h2>
          <div className="grid g2">
            <Field label="Nombre completo">
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Correo electrónico (institucional)">
              <input disabled value={user?.email || ''} title="El correo solo puede ser modificado por administración." />
            </Field>
          </div>
          <div className="grid g2" style={{ marginTop: 14 }}>
            <Field label="Teléfono de contacto">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 55 1234 5678" />
            </Field>
            <Field label="Rol en el sistema">
              <input disabled value={ROLE[user?.role] || user?.role || ''} />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Dirección / Domicilio">
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, colonia, código postal" />
            </Field>
          </div>
        </div>

        {/* Cambiar contraseña */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginBottom: 16 }}>Seguridad y contraseña</h2>
          {user?.auth_provider === 'local' ? (
            <>
              <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
                Si deseas conservar tu contraseña actual, deja estos campos en blanco.
              </p>
              <Field label="Contraseña actual">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña actual"
                />
              </Field>
              <div className="grid g2" style={{ marginTop: 14 }}>
                <Field label="Nueva contraseña" hint="Mínimo 10 caracteres">
                  <input
                    type="password"
                    minLength={10}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Al menos 10 caracteres"
                  />
                </Field>
                <Field label="Confirmar nueva contraseña">
                  <input
                    type="password"
                    minLength={10}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Repite la nueva contraseña"
                  />
                </Field>
              </div>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Tu cuenta utiliza inicio de sesión corporativo (SSO con Keycloak). La gestión de credenciales se realiza directamente desde el proveedor de identidad institucional; por seguridad no se permite crear contraseñas locales.
            </p>
          )}
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="submit" className="btn primary" disabled={busy} style={{ minWidth: 170 }}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
