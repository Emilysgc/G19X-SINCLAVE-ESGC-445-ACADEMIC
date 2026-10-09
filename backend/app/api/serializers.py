from typing import Optional

from app.models import Request, User
from app.services.workflow import _can_act, current_step


def user_public(u: User, full: bool = False) -> dict:
    d = {"id": u.id, "employee_id": u.employee_id, "email": u.email, "full_name": u.full_name, "role": u.role.value,
         "job_title": u.job_title, "department_id": u.department_id, "direct_supervisor_id": u.direct_supervisor_id,
         "status": u.status.value, "auth_provider": u.auth_provider, "avatar_url": u.avatar_url,
         "vacation_balance": u.vacation_balance, "personal_leave_balance": u.personal_leave_balance}
    if full:
        d.update({"phone": u.phone, "address": u.address, "hire_date": u.hire_date.isoformat() if u.hire_date else None,
                  "last_login": u.last_login.isoformat() if u.last_login else None})
    return d


def _iso(v) -> Optional[str]:
    return v.isoformat() if v else None


def request_out(r: Request, viewer: Optional[User] = None, detail: bool = False) -> dict:
    data = dict(r.request_data or {})
    data.pop("clabe_enc", None)
    steps = []
    if detail and r.workflow:
        for s in r.workflow.steps:
            steps.append({"step_index": s.step_index, "label": s.label, "status": s.status.value,
                          "approver": s.approver.full_name if s.approver else (s.approver_role or None),
                          "acted_by": s.acted_by.full_name if s.acted_by else None, "due_at": _iso(s.due_at),
                          "action_date": _iso(s.action_date), "comments": s.comments, "escalated": s.escalated})
    step = current_step(r)
    out = {
        "id": r.id, "folio": r.folio, "type": r.type.value, "status": r.status.value, "priority": r.priority.value,
        "title": r.title, "description": r.description, "start_date": _iso(r.start_date), "end_date": _iso(r.end_date),
        "days_requested": r.days_requested, "request_data": data, "ai_validation_score": r.ai_validation_score,
        "ai_validation_notes": r.ai_validation_notes, "ai_risk_level": r.ai_risk_level, "auto_resolved": r.auto_resolved,
        "has_document": bool(r.generated_document_html), "attachments": [{"id": a["id"], "name": a["name"], "size": a["size"]} for a in (r.attached_files or [])],
        "due_at": _iso(r.due_at), "created_at": _iso(r.created_at), "completed_at": _iso(r.completed_at),
        "requester": {"id": r.requester.id, "full_name": r.requester.full_name, "employee_id": r.requester.employee_id,
                      "job_title": r.requester.job_title} if r.requester else None,
        "current_step_index": r.workflow.current_step_index if r.workflow else None,
        "can_act": bool(viewer and step and _can_act(step, viewer, r)),
    }
    if detail:
        out["steps"] = steps
    return out
