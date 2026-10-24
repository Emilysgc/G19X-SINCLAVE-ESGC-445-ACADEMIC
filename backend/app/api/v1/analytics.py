"""Analítica operativa (con caché en Redis). El análisis histórico avanzado se hace en Power BI."""
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import HR_ROLES, get_current_user
from app.core.cache import cache
from app.core.config import get_settings
from app.core.database import get_db
from app.models import ACTIVE_STATUSES, Department, Request, RequestStatus, User, UserRole, UserStatus

router = APIRouter()


def _aware(d):
    return d if d is None or d.tzinfo else d.replace(tzinfo=timezone.utc)


@router.get("/overview", summary="KPIs, tendencia y distribución")
async def overview(actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    scope = "global" if actor.role in HR_ROLES else f"user{actor.id}"
    key = f"analytics:overview:{scope}"
    cached = await cache.get_json(key)
    if cached:
        return {**cached, "cached": True}

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=365)
    q = select(Request).where(Request.created_at >= since)
    if actor.role == UserRole.MANAGER:
        team = select(User.id).where(User.direct_supervisor_id == actor.id)
        q = q.where(or_(Request.requester_id == actor.id, Request.requester_id.in_(team)))
    elif actor.role not in HR_ROLES:
        q = q.where(Request.requester_id == actor.id)
    rows = list((await db.execute(q.limit(50000))).scalars())

    by_status = Counter(r.status.value for r in rows)
    by_type = Counter(r.type.value for r in rows)
    resolved = [r for r in rows if r.completed_at and r.status != RequestStatus.CANCELLED]
    hours = [(_aware(r.completed_at) - _aware(r.created_at)).total_seconds() / 3600 for r in resolved]
    with_due = [r for r in resolved if r.due_at]
    on_time = [r for r in with_due if _aware(r.completed_at) <= _aware(r.due_at)]
    active = [r for r in rows if r.status in ACTIVE_STATUSES]
    overdue = [r for r in active if r.due_at and _aware(r.due_at) < now]
    auto = [r for r in rows if r.auto_resolved]

    trend: dict[str, dict] = {(now - timedelta(days=i)).strftime("%Y-%m-%d"): {"created": 0, "resolved": 0} for i in range(29, -1, -1)}
    for r in rows:
        c = _aware(r.created_at).strftime("%Y-%m-%d")
        if c in trend:
            trend[c]["created"] += 1
        if r.completed_at:
            d = _aware(r.completed_at).strftime("%Y-%m-%d")
            if d in trend:
                trend[d]["resolved"] += 1

    by_dept = []
    if actor.role in HR_ROLES:
        depts = {d.id: d.name for d in (await db.execute(select(Department))).scalars()}
        users = {u.id: u.department_id for u in (await db.execute(select(User.id, User.department_id))).all()}
        cnt = Counter(depts.get(users.get(r.requester_id), "Sin departamento") for r in rows)
        by_dept = [{"department": k, "count": v} for k, v in cnt.most_common()]

    total_employees = (await db.execute(select(func.count(User.id)).where(User.is_active == True, User.status == UserStatus.ACTIVE))).scalar() or 0

    monthly_trend = []
    month_names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    for i in range(11, -1, -1):
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        m_str = f"{y}-{m:02d}"
        created_count = sum(1 for r in rows if _aware(r.created_at).strftime("%Y-%m") == m_str)
        resolved_count = sum(1 for r in rows if r.completed_at and _aware(r.completed_at).strftime("%Y-%m") == m_str)
        monthly_trend.append({
            "key": m_str,
            "label": month_names[m - 1],
            "year": y,
            "created": created_count,
            "resolved": resolved_count,
        })

    scores = [r.ai_validation_score for r in rows if r.ai_validation_score is not None]
    data = {
        "summary": {
            "total": len(rows), "total_employees": total_employees, "active": len(active), "overdue": len(overdue),
            "approved": by_status.get("APPROVED", 0), "completed": by_status.get("COMPLETED", 0),
            "rejected": by_status.get("REJECTED", 0), "cancelled": by_status.get("CANCELLED", 0),
            "auto_resolved": len(auto), "auto_resolved_pct": round(100 * len(auto) / len(rows), 1) if rows else 0,
            "avg_resolution_hours": round(sum(hours) / len(hours), 1) if hours else None,
            "sla_compliance_pct": round(100 * len(on_time) / len(with_due), 1) if with_due else None,
        },
        "by_status": [{"status": k, "count": v} for k, v in by_status.items()],
        "by_type": [{"type": k, "count": v} for k, v in by_type.most_common()],
        "by_department": by_dept,
        "trend": [{"date": k, **v} for k, v in trend.items()],
        "monthly_trend": monthly_trend,
        "ai": {"avg_score": round(sum(scores) / len(scores), 2) if scores else None,
               "risk": dict(Counter(r.ai_risk_level for r in rows if r.ai_risk_level))},
        "powerbi_report_url": get_settings().POWERBI_REPORT_URL,
        "generated_at": now.isoformat(),
    }
    await cache.set_json(key, data, ttl=60)
    return {**data, "cached": False}
