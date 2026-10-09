"""Verificación REAL de las integraciones del proyecto (hace llamadas de verdad, no solo revisa variables).
Se usa desde `python -m app.check` y desde Administración → Sistema → «Probar integraciones»."""
import asyncio
import os
from typing import Optional

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache
from app.core.config import get_settings
from app.services.ai_agent import get_agent


async def _get_json(url: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.json()


def _item(key: str, name: str, ok: Optional[bool], detail: str, fix: str = "", required: bool = True) -> dict:
    return {"key": key, "name": name, "ok": ok, "detail": detail, "fix": fix, "required": required}


async def _postgres(db: AsyncSession) -> dict:
    s = get_settings()
    try:
        version = (await db.execute(text("SELECT version()"))).scalar() or ""
    except Exception as exc:  # noqa: BLE001
        return _item("postgres", "PostgreSQL", False, f"Sin conexión: {type(exc).__name__}", "Revisa DATABASE_URL y que el contenedor 'postgres' esté arriba.")
    if not s.is_postgresql:
        return _item("postgres", "PostgreSQL", False, "Se está usando otra base de datos (solo válido para pruebas).", "Usa DATABASE_URL=postgresql+asyncpg://…")
    return _item("postgres", "PostgreSQL", True, version.split(",")[0])


async def _redis() -> dict:
    if cache.backend != "redis":
        return _item("redis", "Redis", False, "No conectado: el sistema usa memoria local.", "Revisa REDIS_URL y el contenedor 'redis'.")
    try:
        await cache._redis.ping()  # noqa: SLF001
    except Exception as exc:  # noqa: BLE001
        return _item("redis", "Redis", False, f"Se perdió la conexión: {type(exc).__name__}", "Reinicia el contenedor 'redis'.")
    return _item("redis", "Redis", True, "Responde (PING).")


async def _probe_provider(p) -> tuple[bool, str, str]:
    """Una llamada real y mínima a UN proveedor (sin cadena de respaldo). Devuelve (ok, detalle, cómo arreglarlo)."""
    s = get_settings()
    limit = 90 if p.name == "ollama" else 30  # el primer uso de Ollama carga el modelo en memoria
    try:
        await asyncio.wait_for(p.client.chat.completions.create(
            model=p.model, max_tokens=16, messages=[{"role": "user", "content": "Responde solo con la palabra: ok"}]), limit)
    except asyncio.TimeoutError:
        return False, f"No respondió en {limit} s.", ("Revisa tu conexión a internet." if p.name == "groq" else "El modelo puede estar cargándose; reintenta, o usa uno más pequeño (OLLAMA_MODEL).")
    except Exception as exc:  # noqa: BLE001
        code = getattr(exc, "status_code", None)
        secret = s.GROQ_API_KEY or "§"
        detail = f"Error {code or type(exc).__name__}: " + str(exc).replace(secret, "***")[:160]
        if p.name == "groq":
            hint = {401: "La clave GROQ_API_KEY es incorrecta o fue revocada (créala en console.groq.com/keys).",
                    403: "La clave no tiene permiso o tu red/región está bloqueada por Groq.",
                    404: f"El modelo «{p.model}» no existe o no está disponible. Elige otro en console.groq.com/docs/models y ponlo en GROQ_MODEL.",
                    429: "Superaste el límite del plan gratuito de Groq. Espera un momento o usa Ollama como respaldo."}.get(code, "Sin conexión a internet o servicio de Groq caído.")
        else:
            hint = {404: f"El modelo «{p.model}» no está descargado. Ejecuta: docker compose exec ollama ollama pull {p.model}"}.get(
                code, "Ollama no responde: inicia el servicio (docker compose --profile ollama up -d) y revisa OLLAMA_BASE_URL.")
        return False, detail, hint
    return True, f"El modelo «{p.model}» respondió correctamente.", ""


async def _llm() -> list[dict]:
    providers = {p.name: p for p in get_agent().providers}
    out: list[dict] = []
    status: dict[str, tuple[bool, str, str]] = {}
    for name, label, hint in (("groq", "IA · Groq (nube)", "Define GROQ_API_KEY (gratis en console.groq.com)."),
                              ("ollama", "IA · Ollama (local, sin internet)", "Opcional como respaldo: define OLLAMA_BASE_URL y arranca el servicio.")):
        p = providers.get(name)
        if p is None:
            out.append(_item(f"llm_{name}", label, None, "No configurado.", hint, required=False))
            continue
        status[name] = await _probe_provider(p)
        ok, detail, fix = status[name]
        out.append(_item(f"llm_{name}", label, ok, detail, fix, required=False))
    if not providers:
        summary = _item("llm", "Agentes de IA", False, "Ningún proveedor configurado.",
                        "Configura Groq (GROQ_API_KEY) y/o Ollama (OLLAMA_BASE_URL). Guía: README, sección «IA: Groq y Ollama».")
    elif any(v[0] for v in status.values()):
        working = [n for n, v in status.items() if v[0]]
        extra = "" if len(working) == len(status) else f" (falla: {', '.join(n for n, v in status.items() if not v[0])}; el sistema usa el otro)"
        summary = _item("llm", "Agentes de IA", True, f"Operativos con: {', '.join(working)}{extra}.")
    else:
        summary = _item("llm", "Agentes de IA", False, "Ningún proveedor de IA responde.", "Revisa los detalles de Groq y Ollama de abajo.")
    return [summary, *out]


async def _oidc() -> dict:
    s = get_settings()
    name = f"Inicio de sesión · {s.OIDC_PROVIDER_NAME} (OpenID Connect)"
    if not (s.OIDC_ISSUER and s.OIDC_CLIENT_ID):
        return _item("oidc", name, False, "No configurado.", "Define OIDC_ISSUER y OIDC_CLIENT_ID (README, sección «Inicio de sesión con Keycloak»).")
    if s.AUTH_MODE == "local":
        return _item("oidc", name, False, "AUTH_MODE=local: el botón de inicio de sesión corporativo está desactivado.", "Usa AUTH_MODE=both (o oidc).")
    issuer = s.OIDC_ISSUER.rstrip("/")
    jwks_url = s.OIDC_JWKS_URL
    try:
        if not jwks_url:
            jwks_url = (await _get_json(f"{issuer}/.well-known/openid-configuration"))["jwks_uri"]
        keys = (await _get_json(jwks_url)).get("keys", [])
    except Exception as exc:  # noqa: BLE001
        return _item("oidc", name, False, f"No se pudo consultar {s.OIDC_PROVIDER_NAME}: {type(exc).__name__}",
                     "¿Está corriendo el contenedor 'keycloak' (tarda ~1 min en arrancar)? Revisa OIDC_ISSUER / OIDC_JWKS_URL y el README, sección «Inicio de sesión con Keycloak».")
    if not keys:
        return _item("oidc", name, False, "El proveedor respondió sin llaves de firma.", "Revisa que el realm exista y se llame como en OIDC_ISSUER.")
    suffix = "/protocol/openid-connect/certs"
    if jwks_url.endswith(suffix):  # compara el emisor que ANUNCIA el servidor con el que esperamos en los tokens
        try:
            announced = str((await _get_json(jwks_url[: -len(suffix)] + "/.well-known/openid-configuration")).get("issuer", "")).rstrip("/")
        except Exception:  # noqa: BLE001
            announced = ""
        if announced and announced != issuer:
            return _item("oidc", name, False, f"El emisor real es «{announced}» pero OIDC_ISSUER dice «{issuer}».",
                         "Deben ser idénticos o todos los inicios de sesión serán rechazados. Ajusta OIDC_ISSUER o KEYCLOAK_PUBLIC_URL.")
    return _item("oidc", name, True, f"{s.OIDC_PROVIDER_NAME} responde ({len(keys)} llave(s) de firma). El Client ID se confirma al iniciar sesión por primera vez.")


async def _powerbi(db: AsyncSession) -> list[dict]:
    s = get_settings()
    out = []
    if not s.is_postgresql:
        out.append(_item("powerbi_views", "Power BI · vistas y usuario de solo lectura", False, "Requiere PostgreSQL.", "Usa PostgreSQL."))
    else:
        n = (await db.execute(text("SELECT count(*) FROM pg_views WHERE schemaname='public' AND (viewname LIKE 'vw\\_%' OR viewname LIKE 'dim\\_%')"))).scalar() or 0
        role = (await db.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :u"), {"u": s.POWERBI_DB_USER})).scalar()
        if n < 7:
            out.append(_item("powerbi_views", "Power BI · vistas y usuario de solo lectura", False, f"Solo hay {n} de 7 vistas.", "Reinicia el backend para recrearlas y revisa sus logs."))
        elif not role:
            out.append(_item("powerbi_views", "Power BI · vistas y usuario de solo lectura", False, f"Las 7 vistas existen, pero falta el usuario «{s.POWERBI_DB_USER}».", "Define POWERBI_DB_PASSWORD y reinicia el backend (guía: fase 5)."))
        else:
            out.append(_item("powerbi_views", "Power BI · vistas y usuario de solo lectura", True, f"7 vistas listas y usuario «{s.POWERBI_DB_USER}» creado. Conecta Power BI Desktop con él."))
    out.append(_item("powerbi_report", "Power BI · reporte incrustado en el sistema", True if s.POWERBI_REPORT_URL else None,
                     "URL de reporte configurada." if s.POWERBI_REPORT_URL else "Opcional: aún no hay URL de reporte (requiere publicar en Power BI Service).",
                     "Usa «Insertar → sitio web o portal» (seguro). Nunca «Publicar en la web»." if not s.POWERBI_REPORT_URL else "", required=False))
    return out


def _docker() -> dict:
    inside = os.path.exists("/.dockerenv")
    return _item("docker", "Docker", True if inside else None,
                 "El backend corre dentro de un contenedor." if inside else "El backend corre fuera de Docker (modo desarrollo).",
                 "Para producción usa: docker compose up -d --build", required=False)




async def check_all(db: AsyncSession) -> list[dict]:
    results = [_docker(), await _postgres(db), await _redis(), await _oidc(), *(await _llm()), *(await _powerbi(db))]
    return results


def has_failures(results: list[dict]) -> bool:
    return any(r["required"] and r["ok"] is False for r in results)
