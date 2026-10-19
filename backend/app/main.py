"""Aplicación FastAPI — Sistema inteligente de solicitudes internas de personal."""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.v1.api import api_router
from app.core.cache import cache
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, engine, init_db
from app.services.ai_agent import get_agent
from app.services.bootstrap import apply_powerbi_views, ensure_defaults, ensure_first_admin
from app.services.sla import scheduler_loop

settings = get_settings()
logging.basicConfig(level=logging.DEBUG if settings.DEBUG else logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("hr")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_for_runtime()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    await cache.connect()
    await init_db()
    async with AsyncSessionLocal() as db:
        await ensure_defaults(db)
        await ensure_first_admin(db)
        await db.commit()
    await apply_powerbi_views(engine)
    task = asyncio.create_task(scheduler_loop()) if settings.SLA_SCHEDULER_ENABLED and settings.ENVIRONMENT != "testing" else None
    logger.info("%s v%s listo · BD=%s · caché=%s · IA=%s · SSO=%s", settings.APP_NAME, settings.APP_VERSION,
                "postgresql" if settings.is_postgresql else "sqlite", cache.backend,
                "+".join(p.name for p in get_agent().providers) or "reglas", settings.oidc_enabled)
    yield
    if task:
        task.cancel()
    await cache.close()
    await engine.dispose()


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION, lifespan=lifespan,
              description="Automatización de solicitudes internas de RRHH: flujos, reglas de negocio, notificaciones y agentes inteligentes.",
              docs_url="/docs" if not settings.is_production else None, redoc_url=None,
              openapi_url="/openapi.json" if not settings.is_production else None)

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins_list, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.exception("Error no controlado en %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


@app.get("/health", tags=["Sistema"], summary="Health check (balanceadores / Docker)")
async def health():
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:  # noqa: BLE001
        db_ok = False
    return JSONResponse(status_code=200 if db_ok else 503,
                        content={"status": "ok" if db_ok else "degraded", "database": db_ok, "cache": cache.backend,
                                 "ai": "llm" if get_agent().is_ai_enabled else "rules_engine", "version": settings.APP_VERSION})


app.include_router(api_router, prefix="/api/v1")
_avatars_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
os.makedirs(_avatars_dir, exist_ok=True)
app.mount("/uploads/avatars", StaticFiles(directory=_avatars_dir), name="avatars")


# ── Interfaz web (React compilada). En Docker la sirve nginx; sin Docker la sirve el propio backend. ──
_dist = os.environ.get("FRONTEND_DIST") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.isdir(_dist) and os.path.exists(os.path.join(_dist, "index.html")):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith(("api/", "docs", "openapi")):
            return JSONResponse(status_code=404, content={"detail": "No encontrado"})
        candidate = os.path.realpath(os.path.join(_dist, full_path))
        if full_path and candidate.startswith(os.path.realpath(_dist)) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_dist, "index.html"))
