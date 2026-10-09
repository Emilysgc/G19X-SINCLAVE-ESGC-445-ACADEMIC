"""Agentes de IA: estado, pre-validación de solicitudes y chat."""
from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.cache import rate_limit
from app.core.database import get_db
from app.models import User
from app.schemas.schemas import ChatIn, RequestIn
from app.services import workflow
from app.services.ai_agent import get_agent

router = APIRouter()


@router.get("/status", summary="Modo de operación de la IA")
async def status(_: User = Depends(get_current_user)):
    a = get_agent()
    return {"mode": "llm" if a.is_ai_enabled else "rules_engine", "providers": [p.name for p in a.providers],
            "last_provider": a.last_provider}


@router.post("/validate", summary="Pre-validación (sin crear la solicitud)")
async def validate(body: RequestIn, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await rate_limit(f"validate:{actor.id}", 30, 60)
    v, days = await workflow.precheck(db, actor, body.type, body.start_date, body.end_date, body.description, body.request_data)
    return {"is_valid": v.is_valid, "score": v.score, "risk_level": v.risk_level, "days": days, "errors": v.errors, "warnings": v.warnings,
            "recommendations": v.recommendations, "notes": v.notes, "auto_approve": v.auto_approve, "used_ai": v.used_ai}


@router.post("/chat", summary="Asistente virtual de RRHH")
async def chat(body: ChatIn, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await rate_limit(f"chat:{actor.id}", 20, 60)
    if body.messages[-1].role != "user":
        raise HTTPException(400, "El último mensaje debe ser del usuario.")
    agent = get_agent()
    r = await agent.chat(db, actor, [m.model_dump() for m in body.messages], preferred_provider=body.provider)
    return {"message": r.message, "suggestions": r.suggestions, "used_ai": r.used_ai, "provider": agent.last_provider}
