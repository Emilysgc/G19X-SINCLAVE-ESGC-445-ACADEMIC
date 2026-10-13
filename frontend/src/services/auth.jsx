import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import Keycloak from 'keycloak-js'
import { api, setToken, getToken, setUnauthorizedHandler } from './api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

// Keycloak (OpenID Connect + PKCE). El emisor llega como «{url}/realms/{realm}» desde /auth/config.
let kc = null
async function getKeycloak(oidc) {
  if (!kc) {
    const i = oidc.issuer.lastIndexOf('/realms/')
    kc = new Keycloak({ url: oidc.issuer.slice(0, i), realm: oidc.issuer.slice(i + 8), clientId: oidc.client_id })
    // init procesa el regreso desde Keycloak (si la URL trae el código) y deja kc.idToken listo
    await kc.init({ pkceMethod: 'S256', checkLoginIframe: false })
  }
  return kc
}

export function AuthProvider({ children }) {
  const [config, setConfig] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef(null)
  userRef.current = user
  const configRef = useRef(null)
  configRef.current = config

  const logout = useCallback(async (silent = false) => {
    const wasOidc = userRef.current?.auth_provider === 'oidc'
    if (!silent) { try { await api.post('/auth/logout') } catch { /* token ya inválido */ } }
    setToken(null); setUser(null)
    const oidc = configRef.current?.oidc
    if (wasOidc && oidc?.enabled) {  // también termina la sesión en Keycloak; si no, el siguiente clic entraría solo
      try { const k = await getKeycloak(oidc); await k.logout({ redirectUri: window.location.origin }) } catch { /* Keycloak no disponible */ }
    }
  }, [])

  const loadConfig = useCallback(async () => { const c = await api.get('/auth/config'); setConfig(c); return c }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => logout(true))
    ;(async () => {
      try {
        const c = await loadConfig()
        if (getToken()) setUser(await api.get('/auth/me'))
        else if (c.oidc?.enabled) {  // ¿regresamos de Keycloak con un inicio de sesión recién hecho?
          const k = await getKeycloak(c.oidc)
          if (k.authenticated && k.idToken) {
            const session = await api.post('/auth/oidc', { id_token: k.idToken })
            setToken(session.access_token); setUser(await api.get('/auth/me'))
          }
        }
      } catch { setToken(null) } finally { setLoading(false) }
    })()
  }, [logout, loadConfig])

  const startSession = async (session) => { setToken(session.access_token); setUser(await api.get('/auth/me')); await loadConfig() }
  const login = async (email, password) => startSession(await api.post('/auth/login', { email, password }))
  const setup = async (payload) => startSession(await api.post('/auth/setup', payload))
  const loginOidc = async () => { const k = await getKeycloak(config.oidc); await k.login({ redirectUri: window.location.origin }) }  // redirige a Keycloak
  const refreshUser = async () => setUser(await api.get('/auth/me'))

  return <Ctx.Provider value={{ config, user, loading, login, setup, loginOidc, logout, refreshUser, reloadUser: refreshUser }}>{children}</Ctx.Provider>
}
