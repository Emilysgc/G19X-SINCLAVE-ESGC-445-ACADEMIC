"""Validación de id_tokens OpenID Connect (Keycloak) mediante JWKS. Sirve para cualquier proveedor OIDC estándar."""
import logging
from typing import Optional

import httpx
from fastapi import HTTPException
from jose import JWTError, jwt

from app.core.cache import cache
from app.core.config import get_settings

logger = logging.getLogger("hr.oidc")

ROLE_PRIORITY = ["SYSTEM_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"]
JWKS_CACHE_KEY = "oidc:jwks"


def issuer() -> str:
    return (get_settings().OIDC_ISSUER or "").rstrip("/")


async def _jwks_url() -> str:
    explicit = get_settings().OIDC_JWKS_URL
    if explicit:
        return explicit
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{issuer()}/.well-known/openid-configuration")
        r.raise_for_status()
        return r.json()["jwks_uri"]


async def get_jwks() -> dict:
    """Descarga (y cachea 1 h en Redis) las llaves públicas del proveedor."""
    cached = await cache.get_json(JWKS_CACHE_KEY)
    if cached:
        return cached
    url = await _jwks_url()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        jwks = resp.json()
    await cache.set_json(JWKS_CACHE_KEY, jwks, ttl=3600)
    return jwks


async def validate_oidc_token(token: str) -> dict:
    """Valida firma, emisor, audiencia y expiración de un id_token. Devuelve los claims."""
    s = get_settings()
    if not s.oidc_enabled:
        raise HTTPException(status_code=400, detail="El inicio de sesión con Keycloak no está configurado.")
    try:
        header = jwt.get_unverified_header(token)
        jwks = await get_jwks()
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)
        if key is None:  # rotación de llaves: refrescar una vez
            await cache.delete_prefix(JWKS_CACHE_KEY)
            jwks = await get_jwks()
            key = next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)
        if key is None:
            raise HTTPException(status_code=401, detail="Llave de firma desconocida.")
        return jwt.decode(token, key, algorithms=["RS256"], audience=s.OIDC_CLIENT_ID, issuer=issuer(),
                          # el id_token trae at_hash (hash del access token que aquí no usamos); sin esto la librería lo rechaza
                          options={"verify_at_hash": False})
    except HTTPException:
        raise
    except (JWTError, httpx.HTTPError, KeyError) as exc:
        logger.warning("Token OIDC rechazado: %s", exc)
        raise HTTPException(status_code=401, detail="Token de inicio de sesión inválido o expirado.") from exc


def claims_to_identity(claims: dict) -> dict:
    email: Optional[str] = claims.get("email") or claims.get("preferred_username")
    if not email or "@" not in email:
        raise HTTPException(status_code=401, detail="El token no incluye un correo válido.")
    email = email.lower()
    domains = get_settings().oidc_domains
    if domains and email.split("@")[1] not in domains:
        raise HTTPException(status_code=403, detail="El dominio del usuario no está autorizado.")
    raw = list(claims.get("roles") or []) + list((claims.get("realm_access") or {}).get("roles") or [])
    roles = {str(r).upper() for r in raw}
    role = next((r for r in ROLE_PRIORITY if r in roles), None)
    name = claims.get("name") or " ".join(x for x in (claims.get("given_name"), claims.get("family_name")) if x) or email
    return {"sub": claims.get("sub"), "email": email, "name": name, "role": role}
