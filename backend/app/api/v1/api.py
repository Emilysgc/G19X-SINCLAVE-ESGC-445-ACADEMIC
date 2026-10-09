from fastapi import APIRouter

from app.api.v1 import admin, ai, analytics, approvals, auth, notifications, requests, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Autenticación"])
api_router.include_router(users.router, prefix="/users", tags=["Usuarios"])
api_router.include_router(requests.router, prefix="/requests", tags=["Solicitudes"])
api_router.include_router(approvals.router, prefix="/approvals", tags=["Aprobaciones"])
api_router.include_router(ai.router, prefix="/ai", tags=["Agentes IA"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notificaciones"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analítica"])
api_router.include_router(admin.router, prefix="/admin", tags=["Administración"])
