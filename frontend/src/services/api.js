// Cliente HTTP mínimo. El token vive en sessionStorage (se borra al cerrar la pestaña).
const BASE = '/api/v1'
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }
export const getToken = () => sessionStorage.getItem('hr_token')
export const setToken = (t) => (t ? sessionStorage.setItem('hr_token', t) : sessionStorage.removeItem('hr_token'))

export class ApiError extends Error {
  constructor(status, body) {
    let msg = 'Error de solicitud'
    if (typeof body?.detail === 'string') {
      msg = body.detail
    } else if (Array.isArray(body?.detail) && body.detail.length > 0) {
      msg = body.detail.map((d) => (d.msg || '').replace(/^Value error,\s*/i, '')).join(' · ')
    }
    super(msg)
    this.status = status
    this.body = body
  }
}

async function request(method, path, { json, form, raw } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + path, { method, headers, body: form || (json !== undefined ? JSON.stringify(json) : undefined) })
  if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized()
  if (raw && res.ok) return res
  let body = null
  try { body = await res.json() } catch { /* sin cuerpo */ }
  if (!res.ok) throw new ApiError(res.status, body)
  return body
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, json) => request('POST', p, { json: json ?? {} }),
  put: (p, json) => request('PUT', p, { json }),
  patch: (p, json) => request('PATCH', p, { json }),
  del: (p) => request('DELETE', p),
  upload: (p, file) => { const f = new FormData(); f.append('file', file); return request('POST', p, { form: f }) },
  // Descarga autenticada de archivos (PDF, adjuntos, HTML) y los abre/guarda en el navegador
  async file(p, filename, open = false) {
    const res = await request('GET', p, { raw: true })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    if (open) { window.open(url, '_blank', 'noopener'); return }
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  },
}

export const errorList = (e) => (e?.body?.errors?.length ? e.body.errors : [e.message])
