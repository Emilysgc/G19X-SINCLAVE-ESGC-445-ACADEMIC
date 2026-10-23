import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorList } from '../services/api'
import { useAuth } from '../services/auth.jsx'
import { Alert, Field, Loading } from '../components/ui.jsx'
import { TYPE } from '../services/labels'

const DATED = ['VACATION', 'PERSONAL_LEAVE', 'MEDICAL_LEAVE', 'MATERNITY_PATERNITY']
const today = () => new Date().toISOString().slice(0, 10)

// Franjas de color y esquemas de tarjeta estilo Imagen 3
const TYPE_STRIPES = {
  VACATION: '#eab308',           // Franja amarilla
  PERSONAL_LEAVE: '#64748b',     // Franja gris pizarra
  MEDICAL_LEAVE: '#22c55e',      // Franja verde esmeralda
  MATERNITY_PATERNITY: '#06b6d4',// Franja cian turquesa
  CERTIFICATE_EMPLOYMENT: '#2563eb', // Franja azul marino
  CERTIFICATE_SALARY: '#854d0e', // Franja bronce / marrón cálido
  ADDRESS_CHANGE: '#f97316',     // Franja naranja
  BANK_ACCOUNT_CHANGE: '#ec4899',// Franja magenta
  PAYROLL_INCIDENT: '#7c3aed',   // Franja púrpura
  OTHER: '#0d9488',              // Franja verde azulado
}

function renderTypeIcon(typeKey) {
  switch (typeKey) {
    case 'VACATION':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
        </svg>
      )
    case 'PERSONAL_LEAVE':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      )
    case 'MEDICAL_LEAVE':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      )
    case 'MATERNITY_PATERNITY':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
        </svg>
      )
    case 'CERTIFICATE_EMPLOYMENT':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
      )
    case 'CERTIFICATE_SALARY':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      )
    case 'ADDRESS_CHANGE':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
        </svg>
      )
    case 'BANK_ACCOUNT_CHANGE':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      )
    case 'PAYROLL_INCIDENT':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      )
    default:
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      )
  }
}

export default function NewRequest() {
  const nav = useNavigate()
  const { refreshUser, user } = useAuth()
  const [types, setTypes] = useState(null)
  const [type, setType] = useState(null)
  const [f, setF] = useState({ start_date: '', end_date: '', description: '', data: {} })
  const [check, setCheck] = useState(null)
  const [errs, setErrs] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/requests/types').then(setTypes)
  }, [])

  const setData = (k) => (e) =>
    setF({ ...f, data: { ...f.data, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } })

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const body = () => ({
    type,
    start_date: f.start_date || null,
    end_date: f.end_date || f.start_date || null,
    description: f.description || null,
    request_data: f.data,
  })

  // Pre-validación en vivo (reglas + agente de IA) mientras el usuario llena el formulario
  useEffect(() => {
    if (!type) return
    if (DATED.includes(type) && !(f.start_date && (f.end_date || f.start_date))) {
      setCheck(null)
      return
    }
    const t = setTimeout(
      () =>
        api
          .post('/ai/validate', body())
          .then(setCheck)
          .catch(() => setCheck(null)),
      600
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, f])

  const pick = (t) => {
    setType(t)
    setF({
      start_date: '',
      end_date: '',
      description: '',
      data: t === 'MATERNITY_PATERNITY' ? { kind: 'maternity' } : {},
    })
    setCheck(null)
    setErrs([])
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrs([])
    try {
      const r = await api.post('/requests', body())
      await refreshUser()
      nav(`/requests/${r.id}`)
    } catch (err) {
      setErrs(errorList(err))
    } finally {
      setBusy(false)
    }
  }

  if (!types) return <Loading />

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
          Nueva Solicitud
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Selecciona el trámite que deseas realizar. Los contenedores validan tus políticas antes de enviar.
        </p>
      </div>

      {/* ── Rejilla de Contenedores 3x3 estilo Imagen 3 con barra inferior ── */}
      <div className="requests-types-grid">
        {types.map((t) => {
          const isSelected = type === t.type
          const stripeColor = TYPE_STRIPES[t.type] || '#3b82f6'
          return (
            <div
              key={t.type}
              className={`requests-card-tile ${isSelected ? 'selected' : ''}`}
              onClick={() => pick(t.type)}
            >
              <div className="requests-card-top-row">
                <span className="requests-card-title-badge">{t.name}</span>
                <span className="requests-card-header-icon">{renderTypeIcon(t.type)}</span>
              </div>

              <p className="requests-card-desc">{t.description}</p>

              <div className="requests-card-meta-sla">
                {t.requires_approval ? `Respuesta en ≤ ${t.sla_hours} h` : 'Se genera al instante'}
              </div>

              <div
                className="requests-card-stripe"
                style={{ backgroundColor: stripeColor }}
              />
            </div>
          )
        })}
      </div>

      {/* ── Formulario desplegado tras elegir un trámite ──────────────── */}
      {type && (
        <form className="card" onSubmit={submit} style={{ marginTop: 24, borderRadius: 16 }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>{TYPE[type]}</h2>

          {type === 'VACATION' && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#166534', marginBottom: 6 }}>
                🌴 Tu información de vacaciones (Ley Federal del Trabajo)
              </div>
              <div style={{ fontSize: 12.5, color: '#15803d', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <span>Saldo disponible actual: <b>{user?.vacation_balance ?? 0} días</b></span>
                <span>Días por ley al año: <b>{user?.vacation_entitlement ?? 0} días</b></span>
                <span>Antigüedad acumulada: <b>{user?.years_of_service ?? 0} {user?.years_of_service === 1 ? 'año' : 'años'}</b></span>
              </div>
              <div style={{ fontSize: 11.5, color: '#14532d', marginTop: 8 }}>
                💡 <b>Regla LFT (Vacaciones Dignas):</b> La ley exige disfrutar de al menos 12 días continuos de descanso. Cuentas además con derecho a una prima vacacional mínima del 25% sobre tu salario diario.
              </div>
            </div>
          )}

          {DATED.includes(type) && (
            <div className="row">
              <div className="f1">
                <Field label="Desde">
                  <input
                    type="date"
                    required
                    min={type === 'MEDICAL_LEAVE' ? undefined : today()}
                    value={f.start_date}
                    onChange={set('start_date')}
                  />
                </Field>
              </div>
              <div className="f1">
                <Field label="Hasta">
                  <input
                    type="date"
                    required
                    min={f.start_date || undefined}
                    value={f.end_date}
                    onChange={set('end_date')}
                  />
                </Field>
              </div>
            </div>
          )}

          {type === 'MATERNITY_PATERNITY' && (
            <Field label="Tipo de licencia">
              <select value={f.data.kind} onChange={setData('kind')}>
                <option value="maternity">Maternidad (84 días naturales)</option>
                <option value="paternity">Paternidad (5 días laborables)</option>
              </select>
            </Field>
          )}

          {type === 'MEDICAL_LEAVE' && (
            <Alert kind="info">
              Podrás adjuntar tu comprobante o receta médica (PDF, PNG o JPG) en el detalle de la solicitud una vez enviada. Solo RRHH tendrá acceso al documento y motivo médico.
            </Alert>
          )}

          {['CERTIFICATE_EMPLOYMENT', 'CERTIFICATE_SALARY'].includes(type) && (
            <div className="row">
              <div className="f1">
                <Field label="Dirigida a">
                  <input
                    maxLength={120}
                    placeholder="A quien corresponda"
                    value={f.data.addressed_to || ''}
                    onChange={setData('addressed_to')}
                  />
                </Field>
              </div>
              <div className="f1">
                <Field label="Motivo">
                  <input
                    maxLength={120}
                    placeholder="Trámite bancario, visa…"
                    value={f.data.purpose || ''}
                    onChange={setData('purpose')}
                  />
                </Field>
              </div>
            </div>
          )}

          {type === 'ADDRESS_CHANGE' && (
            <>
              <Field label="Nuevo domicilio completo">
                <textarea
                  required
                  value={f.data.new_address || ''}
                  onChange={setData('new_address')}
                  placeholder="Calle, número, colonia, ciudad, C.P."
                />
              </Field>
              <Field label="Teléfono (opcional)">
                <input value={f.data.phone || ''} onChange={setData('phone')} />
              </Field>
            </>
          )}

          {type === 'BANK_ACCOUNT_CHANGE' && (
            <>
              <div className="row">
                <div className="f1">
                  <Field label="Banco">
                    <input
                      required
                      placeholder="Ej. BBVA México, Banorte, Santander"
                      value={f.data.bank_name || ''}
                      onChange={setData('bank_name')}
                    />
                  </Field>
                </div>
                <div className="f1">
                  <Field label={`CLABE (18 dígitos · ${(f.data.clabe || '').length}/18)`}>
                    <input
                      required
                      inputMode="numeric"
                      maxLength={18}
                      placeholder="18 dígitos numéricos"
                      value={f.data.clabe || ''}
                      onChange={(e) =>
                        setF({
                          ...f,
                          data: { ...f.data, clabe: e.target.value.replace(/\D/g, '').slice(0, 18) },
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
              <div style={{ marginTop: -8, marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span className="muted">Ejemplo para evaluación:</span>
                <button
                  type="button"
                  className="btn sm"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() =>
                    setF({
                      ...f,
                      data: {
                        ...f.data,
                        bank_name: f.data.bank_name || 'BBVA México',
                        clabe: '012180001234567899',
                      },
                    })
                  }
                >
                  Usar CLABE válida (012180001234567899)
                </button>
                {(f.data.clabe || '').length >= 17 &&
                  (() => {
                    const clean = (f.data.clabe || '').replace(/\D/g, '').slice(0, 17)
                    const w = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7]
                    const s = clean.split('').reduce((acc, d, i) => acc + ((parseInt(d, 10) * w[i]) % 10), 0)
                    const valid18 = clean + String((10 - (s % 10)) % 10)
                    if (valid18 !== f.data.clabe) {
                      return (
                        <button
                          type="button"
                          className="btn sm primary"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={() => setF({ ...f, data: { ...f.data, clabe: valid18 } })}
                        >
                          Corregir dígito verificador a: {valid18}
                        </button>
                      )
                    }
                    return null
                  })()}
              </div>
            </>
          )}

          {type === 'PAYROLL_INCIDENT' && (
            <Field label="Periodo de nómina afectado">
              <input
                required
                placeholder="Ej. 1ª quincena de marzo 2026"
                value={f.data.period || ''}
                onChange={setData('period')}
              />
            </Field>
          )}

          {!['CERTIFICATE_EMPLOYMENT', 'CERTIFICATE_SALARY'].includes(type) && (
            <Field label={['PAYROLL_INCIDENT', 'OTHER'].includes(type) ? 'Describe el caso' : 'Comentarios (opcional)'}>
              <textarea
                maxLength={2000}
                required={['PAYROLL_INCIDENT', 'OTHER'].includes(type)}
                value={f.description}
                onChange={set('description')}
              />
            </Field>
          )}

          {check && (
            <div style={{ marginTop: 14 }}>
              {check.days != null && (
                <Alert kind="info">
                  Se solicitan <b>{check.days}</b> día(s) hábil(es).{check.auto_approve && ' Esta solicitud puede aprobarse automáticamente.'}
                </Alert>
              )}
              {check.errors.length > 0 && <Alert kind="err" title="No se puede enviar todavía:" items={check.errors} />}
              {check.warnings.length > 0 && <Alert kind="warn" title="Observaciones para el aprobador:" items={check.warnings} />}
              {check.recommendations.length > 0 && <Alert kind="info" items={check.recommendations} />}
              {check.errors.length === 0 && check.warnings.length === 0 && (
                <Alert kind="ok">Cumple con las políticas vigentes.{check.used_ai && ' (Validación normativa)'}</Alert>
              )}
            </div>
          )}

          {errs.length > 0 && <Alert kind="err" items={errs} />}

          <div className="row" style={{ marginTop: 18, gap: 10 }}>
            <button className="btn primary" disabled={busy || (check && !check.is_valid)}>
              {busy ? 'Enviando…' : 'Enviar solicitud'}
            </button>
            <button type="button" className="btn" onClick={() => nav(-1)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </>
  )
}
