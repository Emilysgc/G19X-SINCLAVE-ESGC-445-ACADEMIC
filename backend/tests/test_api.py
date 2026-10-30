"""Pruebas de integración de extremo a extremo vía HTTP (BD y caché reales del entorno de pruebas)."""
from datetime import date, timedelta

import pytest
from sqlalchemy import text, update

from app.core.database import AsyncSessionLocal, engine
from app.models import ApprovalStep
from tests.test_units import make_clabe

pytestmark = pytest.mark.asyncio(loop_scope="session")
V = "/api/v1"


# ── Arranque sin datos de demostración ────────────────────────────────────
async def test_system_boots_clean_and_setup_is_one_shot(api):
    cfg = (await api.c.get(f"{V}/auth/config")).json()
    assert cfg["needs_setup"] is False and cfg["local_auth"] is True
    r = await api.c.post(f"{V}/auth/setup", json={"email": "otro@pruebas-rh.com", "full_name": "Otro Admin", "password": "Test-password-123"})
    assert r.status_code == 409  # el asistente de primer uso solo funciona una vez
    users = (await api.get("admin", f"{V}/users")).json()
    assert {u["email"] for u in users} == {f"{k}@pruebas-rh.com" for k in ("admin", "hr", "mgr", "emp1", "emp2", "emp3", "solo")}  # nada de datos falsos


async def test_default_configuration_is_loaded(api):
    types = (await api.get("emp1", f"{V}/requests/types")).json()
    assert len(types) == 10
    policies = (await api.get("emp1", f"{V}/admin/policies")).json()
    assert len(policies) >= 6


async def test_login_errors_and_profile(api):
    bad = await api.c.post(f"{V}/auth/login", json={"email": "emp1@pruebas-rh.com", "password": "incorrecta-123"})
    assert bad.status_code == 401
    me = (await api.get("emp1", f"{V}/auth/me")).json()
    assert me["email"] == "emp1@pruebas-rh.com" and me["supervisor"] == "Mario Gerente" and me["department"] == "Tecnología"
    assert me["vacation_balance"] == me["vacation_entitlement"] > 0  # saldo calculado por antigüedad (LFT)
    assert (await api.c.get(f"{V}/auth/me")).status_code == 401


async def test_rate_limit_on_login(api):
    codes = []
    for _ in range(10):
        r = await api.c.post(f"{V}/auth/login", json={"email": "ratelimit@pruebas-rh.com", "password": "x" * 12})
        codes.append(r.status_code)
    assert 429 in codes and codes[0] == 401


async def test_logout_revokes_token(api):
    tok = await api.login("emp3@pruebas-rh.com")
    h = {"Authorization": f"Bearer {tok}"}
    assert (await api.c.get(f"{V}/auth/me", headers=h)).status_code == 200
    assert (await api.c.post(f"{V}/auth/logout", headers=h)).status_code == 200
    assert (await api.c.get(f"{V}/auth/me", headers=h)).status_code == 401


# ── RBAC ──────────────────────────────────────────────────────────────────
async def test_role_based_access(api):
    assert (await api.get("emp1", f"{V}/users")).status_code == 403
    assert (await api.get("emp1", f"{V}/admin/audit")).status_code == 403
    assert (await api.get("emp1", f"{V}/approvals/pending")).status_code == 403
    assert (await api.post("emp1", f"{V}/users", json={"email": "x@pruebas-rh.com", "full_name": "Xavier X"})).status_code == 403
    assert (await api.get("hr", f"{V}/admin/audit")).status_code == 200
    r = await api.post("hr", f"{V}/users", json={"email": "sa@pruebas-rh.com", "full_name": "Super Admin", "role": "SYSTEM_ADMIN"})
    assert r.status_code == 403  # RRHH no puede crear administradores del sistema


# ── Flujo de vacaciones ───────────────────────────────────────────────────
async def test_vacation_happy_path_with_balance_deduction(api):
    before = (await api.get("emp1", f"{V}/auth/me")).json()["vacation_balance"]
    s, e = api.window(days=5)
    r = await api.request("emp1", "VACATION", s, e, "Viaje familiar")
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["status"] == "PENDING_APPROVAL" and req["days_requested"] == 5 and req["folio"].startswith("VAC-")
    assert [st["label"] for st in req["steps"]] == ["Supervisor"]
    assert (await api.get("emp1", f"{V}/auth/me")).json()["vacation_balance"] == before  # aún no se descuenta

    assert (await api.post("emp1", f"{V}/approvals/{req['id']}/approve", json={})).status_code in (403,)  # el empleado no aprueba
    assert (await api.post("emp2", f"{V}/approvals/{req['id']}/approve", json={})).status_code == 403
    pend = (await api.get("mgr", f"{V}/approvals/pending")).json()
    assert req["id"] in [p["id"] for p in pend]

    ok = await api.post("mgr", f"{V}/approvals/{req['id']}/approve", json={"comments": "Buen viaje"})
    assert ok.status_code == 200 and ok.json()["status"] == "APPROVED"
    assert (await api.get("emp1", f"{V}/auth/me")).json()["vacation_balance"] == before - 5
    notes = (await api.get("emp1", f"{V}/notifications")).json()
    assert any(n["type"] == "REQUEST_APPROVED" for n in notes["items"])
    again = await api.post("mgr", f"{V}/approvals/{req['id']}/approve", json={})
    assert again.status_code == 400  # ya resuelta

    # cancelar una vacación aprobada a futuro devuelve el saldo
    c = await api.post("emp1", f"{V}/requests/{req['id']}/cancel")
    assert c.status_code == 200 and c.json()["status"] == "CANCELLED"
    assert (await api.get("emp1", f"{V}/auth/me")).json()["vacation_balance"] == before


async def test_long_vacation_needs_supervisor_then_hr(api):
    s, e = api.window(days=14)  # >= 10 días hábiles (considerando días festivos LFT)
    req = (await api.request("emp2", "VACATION", s, e, "Descanso")).json()
    assert [st["label"] for st in req["steps"]] == ["Supervisor", "Recursos Humanos"]
    mid = (await api.post("mgr", f"{V}/approvals/{req['id']}/approve", json={})).json()
    assert mid["status"] == "IN_REVIEW" and mid["current_step_index"] == 1
    assert req["id"] not in [p["id"] for p in (await api.get("mgr", f"{V}/approvals/pending")).json()]
    assert req["id"] in [p["id"] for p in (await api.get("hr", f"{V}/approvals/pending")).json()]
    done = (await api.post("hr", f"{V}/approvals/{req['id']}/approve", json={})).json()
    assert done["status"] == "APPROVED"


async def test_business_rules_block_invalid_requests(api):
    today = date.today()
    # poco aviso: primer día hábil desde hoy (hoy mismo, o el lunes si hoy es fin de semana)
    soon = today
    while soon.weekday() >= 5:
        soon += timedelta(days=1)
    r = await api.request("emp1", "VACATION", soon.isoformat(), soon.isoformat())
    assert r.status_code == 422 and any("anticipación" in x for x in r.json()["errors"])
    # más días que el saldo / máximo consecutivo
    s, e = api.window(days=7 * 6)
    r = await api.request("emp1", "VACATION", s, e)
    assert r.status_code == 422 and len(r.json()["errors"]) >= 2
    # fecha fin antes de inicio
    s, e = api.window(days=3)
    assert (await api.request("emp1", "VACATION", e, s)).status_code == 422
    # solo fin de semana = 0 días hábiles
    sat = next_weekday(5)
    assert (await api.request("emp1", "VACATION", sat.isoformat(), (sat + timedelta(days=1)).isoformat())).status_code == 422


def next_weekday(weekday: int) -> date:
    d = date.today() + timedelta(days=60)
    return d + timedelta(days=(weekday - d.weekday()) % 7)


async def test_overlapping_requests_are_rejected(api):
    s, e = api.window(days=3)
    assert (await api.request("emp2", "VACATION", s, e)).status_code == 201
    dup = await api.request("emp2", "PERSONAL_LEAVE", s, s)
    assert dup.status_code == 422 and any("coincide" in x for x in dup.json()["errors"])


async def test_precheck_does_not_create_request(api):
    s, e = api.window(days=2)
    before = (await api.get("emp3", f"{V}/requests")).json()["total"]
    r = await api.post("emp3", f"{V}/ai/validate", json={"type": "VACATION", "start_date": s, "end_date": e})
    assert r.status_code == 200 and r.json()["days"] == 2
    assert (await api.get("emp3", f"{V}/requests")).json()["total"] == before


async def test_newly_hired_employee_has_no_vacation_balance(api):
    s, e = api.window(days=2)
    r = await api.request("emp3", "VACATION", s, e)  # ingresó hace <1 año → saldo 0
    assert r.status_code == 422 and any("Saldo de vacaciones insuficiente" in x for x in r.json()["errors"])


async def test_team_coverage_warning(api):
    s, e = api.window(days=3)
    assert (await api.request("emp1", "VACATION", s, e)).status_code == 201
    r = await api.request("emp2", "VACATION", s, e)  # 2 de 3 del equipo ausentes > 50 %
    assert r.status_code == 201
    req = r.json()
    assert req["ai_risk_level"] in ("MEDIUM", "HIGH") and "Cobertura" in req["ai_validation_notes"]


# ── Auto-aprobación, constancias y cambios ────────────────────────────────
async def test_personal_leave_one_day_is_auto_approved(api):
    s, _ = api.window(days=1)
    before = (await api.get("emp1", f"{V}/auth/me")).json()["personal_leave_balance"]
    r = await api.request("emp1", "PERSONAL_LEAVE", s, s, "Trámite personal")
    assert r.status_code == 201
    req = r.json()
    assert req["status"] == "APPROVED" and req["auto_resolved"] is True
    assert (await api.get("emp1", f"{V}/auth/me")).json()["personal_leave_balance"] == before - 1


async def test_certificates_are_generated_instantly_and_escaped(api):
    r = await api.request("emp3", "CERTIFICATE_SALARY", data={"purpose": "trámite <script>alert(1)</script>", "addressed_to": "Banco & Cía"})
    assert r.status_code == 201
    req = r.json()
    assert req["status"] == "COMPLETED" and req["has_document"] and req["auto_resolved"]
    html = await api.get("emp3", f"{V}/requests/{req['id']}/document")
    assert html.status_code == 200 and "<script>" not in html.text and "&lt;script&gt;" in html.text
    assert "&lt;b&gt;Tres&lt;/b&gt;" in html.text and "30,000.00" in html.text
    assert "default-src 'none'" in html.headers["content-security-policy"]
    pdf = await api.get("emp3", f"{V}/requests/{req['id']}/document.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert (await api.get("emp1", f"{V}/requests/{req['id']}/document.pdf")).status_code == 404  # otro empleado no la ve
    assert (await api.get("hr", f"{V}/requests/{req['id']}/document.pdf")).status_code == 200


async def test_employment_certificate(api):
    req = (await api.request("emp1", "CERTIFICATE_EMPLOYMENT", data={"purpose": "visa"})).json()
    assert req["status"] == "COMPLETED"
    html = (await api.get("emp1", f"{V}/requests/{req['id']}/document")).text
    assert "Elena Uno" in html and "15 de enero de 2020" in html


async def test_bank_change_masks_and_encrypts_clabe(api):
    bad = await api.request("emp1", "BANK_ACCOUNT_CHANGE", data={"bank_name": "Banco X", "clabe": "123456789012345678"})
    assert bad.status_code == 422
    clabe = make_clabe("01218000011234567")
    r = await api.request("emp1", "BANK_ACCOUNT_CHANGE", data={"bank_name": "Banco X", "clabe": clabe})
    assert r.status_code == 201
    req = r.json()
    assert req["request_data"]["clabe_masked"] == f"****{clabe[-4:]}" and "clabe" not in req["request_data"] and "clabe_enc" not in req["request_data"]
    assert clabe not in (await api.get("emp1", f"{V}/requests/{req['id']}")).text
    hr_view = (await api.get("hr", f"{V}/requests/{req['id']}")).json()
    assert hr_view["sensitive"]["clabe"] == clabe  # RRHH puede verla para capturar la nómina
    audit = (await api.get("hr", f"{V}/admin/audit?action=VIEW_SENSITIVE")).json()
    assert audit["total"] >= 1
    assert (await api.post("hr", f"{V}/approvals/{req['id']}/approve", json={})).json()["status"] == "COMPLETED"


async def test_address_change_is_applied_on_approval(api):
    r = await api.request("emp2", "ADDRESS_CHANGE", data={"new_address": "Av. Reforma 123, Col. Centro, Puebla, 72000", "phone": "2221234567"})
    req = r.json()
    assert req["status"] == "PENDING_APPROVAL" and req["steps"][0]["label"] == "Recursos Humanos"
    await api.post("hr", f"{V}/approvals/{req['id']}/approve", json={})
    me = (await api.get("emp2", f"{V}/auth/me")).json()
    assert me["address"].startswith("Av. Reforma 123") and me["phone"] == "2221234567"


async def test_user_without_supervisor_goes_to_hr_and_cannot_self_approve(api):
    s, e = api.window(days=2)
    req = (await api.request("solo", "VACATION", s, e, "x")).json()
    assert req["steps"][0]["label"] == "Recursos Humanos"
    assert (await api.post("hr", f"{V}/approvals/{req['id']}/approve", json={})).status_code == 200
    # una HR_ADMIN no puede aprobar su propia solicitud
    s, e = api.window(days=2)
    mine = (await api.request("hr", "PAYROLL_INCIDENT", description="Me falta un pago del periodo anterior", data={"period": "2026-Q1"})).json()
    assert (await api.post("hr", f"{V}/approvals/{mine['id']}/approve", json={})).status_code == 403
    assert mine["id"] not in [p["id"] for p in (await api.get("hr", f"{V}/approvals/pending")).json()]
    assert (await api.post("admin", f"{V}/approvals/{mine['id']}/approve", json={})).status_code == 200  # salida de emergencia


async def test_reject_requires_reason_and_notifies(api):
    s, e = api.window(days=2)
    req = (await api.request("emp1", "VACATION", s, e, "x")).json()
    assert (await api.post("mgr", f"{V}/approvals/{req['id']}/reject", json={"comments": "no"})).status_code == 400
    r = await api.post("mgr", f"{V}/approvals/{req['id']}/reject", json={"comments": "Cierre de trimestre, reprograma por favor"})
    assert r.json()["status"] == "REJECTED"
    notes = (await api.get("emp1", f"{V}/notifications")).json()["items"]
    assert any(n["type"] == "REQUEST_REJECTED" and "Cierre de trimestre" in n["message"] for n in notes)
    assert (await api.post("emp1", f"{V}/requests/{req['id']}/cancel")).status_code == 400  # ya resuelta


async def test_request_visibility_is_scoped(api):
    s, e = api.window(days=2)
    req = (await api.request("emp1", "VACATION", s, e, "x")).json()
    assert (await api.get("emp2", f"{V}/requests/{req['id']}")).status_code == 404
    assert (await api.get("mgr", f"{V}/requests/{req['id']}")).status_code == 200  # su supervisor
    assert (await api.get("hr", f"{V}/requests/{req['id']}")).status_code == 200
    mine = (await api.get("emp2", f"{V}/requests")).json()["items"]
    assert all(i["requester"]["id"] == api.users["emp2"]["id"] for i in mine)


async def test_attachments_validate_type_and_content(api):
    s, _ = api.window(days=1)
    req = (await api.request("emp1", "MEDICAL_LEAVE", s, s, "Consulta", {"has_medical_certificate": True})).json()
    ok = await api.post("emp1", f"{V}/requests/{req['id']}/attachments", files={"file": ("receta.pdf", b"%PDF-1.4 contenido", "application/pdf")})
    assert ok.status_code == 201
    fake = await api.post("emp1", f"{V}/requests/{req['id']}/attachments", files={"file": ("virus.pdf", b"MZ\x90\x00 no es pdf", "application/pdf")})
    assert fake.status_code == 400
    exe = await api.post("emp1", f"{V}/requests/{req['id']}/attachments", files={"file": ("run.exe", b"MZ", "application/octet-stream")})
    assert exe.status_code == 400
    att = (await api.get("emp1", f"{V}/requests/{req['id']}")).json()["attachments"]
    assert len(att) == 1
    dl = await api.get("hr", f"{V}/requests/{req['id']}/attachments/{att[0]['id']}")
    assert dl.status_code == 200 and dl.content.startswith(b"%PDF")
    assert (await api.get("emp2", f"{V}/requests/{req['id']}/attachments/{att[0]['id']}")).status_code == 404


# ── SLA y escalamiento ────────────────────────────────────────────────────
async def test_sla_agent_reminds_then_escalates_to_hr(api):
    s, e = api.window(days=2)
    req = (await api.request("emp2", "VACATION", s, e, "x")).json()
    async with AsyncSessionLocal() as db:
        long_ago = __import__("datetime").datetime.now(__import__("datetime").timezone.utc) - timedelta(hours=500)
        await db.execute(update(ApprovalStep).where(ApprovalStep.workflow_id.in_(
            text(f"SELECT id FROM approval_workflows WHERE request_id={req['id']}"))).values(due_at=long_ago))
        await db.commit()
    first = (await api.post("hr", f"{V}/admin/sla/run")).json()
    assert first["reminded"] >= 1
    second = (await api.post("hr", f"{V}/admin/sla/run")).json()
    assert second["escalated"] >= 1
    detail = (await api.get("hr", f"{V}/requests/{req['id']}")).json()
    assert detail["steps"][0]["escalated"] is True and detail["can_act"] is True  # RRHH ya puede resolverla
    assert any(n["type"] == "SLA_WARNING" for n in (await api.get("mgr", f"{V}/notifications")).json()["items"])
    assert (await api.post("hr", f"{V}/admin/sla/run")).json()["escalated"] == 0  # no se escala dos veces


# ── Analítica, admin, notificaciones ──────────────────────────────────────
async def test_analytics_overview_and_cache(api):
    a = (await api.get("hr", f"{V}/analytics/overview")).json()
    assert a["summary"]["total"] > 0 and len(a["trend"]) == 30 and a["by_department"]
    assert a["summary"]["auto_resolved"] >= 1
    assert (await api.get("hr", f"{V}/analytics/overview")).json()["cached"] is True
    mine = (await api.get("emp1", f"{V}/analytics/overview")).json()
    assert mine["summary"]["total"] <= a["summary"]["total"] and mine["by_department"] == []


async def test_admin_can_tune_request_type_and_policies(api):
    r = await api.patch("hr", f"{V}/admin/request-types/PERSONAL_LEAVE", json={"auto_approve_days": 0})
    assert r.status_code == 200 and r.json()["auto_approve_days"] == 0
    s, _ = api.window(days=1)
    req = (await api.request("emp2", "PERSONAL_LEAVE", s, s, "x")).json()
    assert req["status"] == "PENDING_APPROVAL"  # sin auto-aprobación ahora pasa por el supervisor
    await api.patch("hr", f"{V}/admin/request-types/PERSONAL_LEAVE", json={"auto_approve_days": 1})
    # Solo HR_ADMIN gestiona políticas y tipos de trámite; SYSTEM_ADMIN se restringe
    assert (await api.post("admin", f"{V}/admin/policies", json={"title": "X", "category": "Jornada", "content": "Bloqueado para admin"})).status_code == 403
    assert (await api.patch("admin", f"{V}/admin/request-types/PERSONAL_LEAVE", json={"auto_approve_days": 1})).status_code == 403
    p = await api.post("hr", f"{V}/admin/policies", json={"title": "Home office", "category": "Jornada", "content": "El trabajo remoto se permite dos días por semana.", "tags": "remoto,teletrabajo"})
    assert p.status_code == 201
    chat = (await api.post("emp1", f"{V}/ai/chat", json={"messages": [{"role": "user", "content": "¿Cuántos días de teletrabajo remoto tengo?"}]})).json()
    assert "dos días por semana" in chat["message"]


async def test_chat_agent_answers_with_user_data(api):
    me = (await api.get("emp1", f"{V}/auth/me")).json()
    r = (await api.post("emp1", f"{V}/ai/chat", json={"messages": [{"role": "user", "content": "¿Cuál es mi saldo de vacaciones?"}]})).json()
    assert f"{me['vacation_balance']:g}" in r["message"] and r["used_ai"] is False
    bad = await api.post("emp1", f"{V}/ai/chat", json={"messages": [{"role": "assistant", "content": "hola"}]})
    assert bad.status_code == 400


async def test_notifications_read_flow(api):
    data = (await api.get("mgr", f"{V}/notifications")).json()
    assert data["unread"] > 0
    await api.post("mgr", f"{V}/notifications/read-all")
    assert (await api.get("mgr", f"{V}/notifications")).json()["unread"] == 0


async def test_csv_import_creates_users_and_reports_errors(api):
    csv = ("email,full_name,role,department_code,job_title,hire_date,supervisor_email,salary\n"
           "nuevo1@pruebas-rh.com,Nuevo Uno,EMPLOYEE,TI,Analista,2022-03-01,mgr@pruebas-rh.com,25000\n"
           "malo@pruebas-rh.com,Malo Malo,EMPLOYEE,XX,,,,\n"
           "emp1@pruebas-rh.com,Duplicado Dup,EMPLOYEE,TI,,,,\n")
    r = await api.post("hr", f"{V}/users/import", files={"file": ("u.csv", csv.encode(), "text/csv")})
    body = r.json()
    assert r.status_code == 200 and body["created"] == 1 and len(body["errors"]) == 2
    u = [x for x in (await api.get("hr", f"{V}/users?search=nuevo1")).json()][0]
    assert u["direct_supervisor_id"] == api.users["mgr"]["id"] and u["auth_provider"] == "oidc"  # sin contraseña → solo Keycloak
    assert u["vacation_balance"] > 0


async def test_health_and_system_status(api):
    h = await api.c.get("/health")
    assert h.status_code == 200 and h.json()["database"] is True
    sysinfo = (await api.get("hr", f"{V}/admin/system")).json()
    assert sysinfo["database"]["ok"] and sysinfo["ai"]["mode"] == "rules_engine" and sysinfo["redis"]["backend"] in ("redis", "memory")


# ── Power BI (solo PostgreSQL) ────────────────────────────────────────────
@pytest.mark.skipif(not __import__("os").environ.get("TEST_DATABASE_URL", "").startswith("postgresql"), reason="requiere PostgreSQL")
async def test_powerbi_views_are_queryable(api):
    async with engine.connect() as conn:
        for view in ("dim_empleados", "dim_departamentos", "vw_solicitudes", "vw_aprobaciones", "vw_ausencias", "vw_resumen_diario", "vw_auditoria"):
            n = (await conn.execute(text(f"SELECT COUNT(*) FROM {view}"))).scalar()
            assert n is not None, view
        assert (await conn.execute(text("SELECT COUNT(*) FROM vw_solicitudes WHERE cumplio_sla IS NOT NULL"))).scalar() >= 1
        cols = {r[0] for r in (await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='dim_empleados'")))}
        assert "salary" not in cols and "sueldo" not in cols  # sin datos sensibles
        assert (await conn.execute(text("SELECT COUNT(*) FROM vw_ausencias"))).scalar() > 0




async def test_password_recovery_flow_and_attempt_limits(api):
    # 1. Solicitar código de recuperación para emp1
    req = await api.c.post(f"{V}/auth/forgot-password", json={"email": "emp1@pruebas-rh.com"})
    assert req.status_code == 200
    data = req.json()
    assert data["message"] == "Si la cuenta está registrada, recibirás un correo con el código de recuperación."
    assert "email" not in data  # No revela el correo para evitar fugas ni enumeración
    assert data["max_attempts"] == 3
    assert data["expires_in_minutes"] == 10
    assert "dev_code" in data  # en modo testing sí viene para la prueba
    real_code = data["dev_code"]
    assert len(real_code) == 6

    # 2. Intento 1 con código erróneo: debe restar un intento (quedan 2)
    bad1 = await api.c.post(f"{V}/auth/reset-password-code", json={"email": "emp1@pruebas-rh.com", "code": "000000", "new_password": "NewSecretPass123!"})
    assert bad1.status_code == 400
    assert "2 intentos" in bad1.json()["detail"]

    # 3. Intento 2 con código erróneo: debe restar otro intento (queda 1)
    bad2 = await api.c.post(f"{V}/auth/reset-password-code", json={"email": "emp1@pruebas-rh.com", "code": "000000", "new_password": "NewSecretPass123!"})
    assert bad2.status_code == 400
    assert "1 intento" in bad2.json()["detail"]

    # 4. Intento 3 con código erróneo: agota los 3 intentos y bloquea el código (HTTP 429)
    bad3 = await api.c.post(f"{V}/auth/reset-password-code", json={"email": "emp1@pruebas-rh.com", "code": "000000", "new_password": "NewSecretPass123!"})
    assert bad3.status_code == 429

    # 5. Intentar usar el código real después de agotar los intentos: debe estar cancelado / expirado
    late = await api.c.post(f"{V}/auth/reset-password-code", json={"email": "emp1@pruebas-rh.com", "code": real_code, "new_password": "NewSecretPass123!"})
    assert late.status_code in (400, 429)

    # 6. Generar un nuevo código exitosamente y restablecer la contraseña
    req2 = await api.c.post(f"{V}/auth/forgot-password", json={"email": "emp1@pruebas-rh.com"})
    assert req2.status_code == 200
    new_code = req2.json()["dev_code"]

    ok = await api.c.post(f"{V}/auth/reset-password-code", json={"email": "emp1@pruebas-rh.com", "code": new_code, "new_password": "NewSecretPass123!"})
    assert ok.status_code == 200

    # 7. Iniciar sesión con la nueva contraseña
    login = await api.c.post(f"{V}/auth/login", json={"email": "emp1@pruebas-rh.com", "password": "NewSecretPass123!"})
    assert login.status_code == 200
    assert "access_token" in login.json()



async def test_password_recovery_production_does_not_leak_dev_code_nor_email(api, monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "ENVIRONMENT", "production")

    # 1. Usuario existente en production: nunca incluye dev_code ni revela email
    r1 = await api.c.post(f"{V}/auth/forgot-password", json={"email": "emp1@pruebas-rh.com"})
    assert r1.status_code == 200
    d1 = r1.json()
    assert "dev_code" not in d1
    assert "email" not in d1
    assert d1["message"] == "Si la cuenta está registrada, recibirás un correo con el código de recuperación."

    # 2. Usuario inexistente en production: respuesta exactamente idéntica (anti-enumeración)
    r2 = await api.c.post(f"{V}/auth/forgot-password", json={"email": "usuario_fantasma_no_existe@test.com"})
    assert r2.status_code == 200
    d2 = r2.json()
    assert "dev_code" not in d2
    assert "email" not in d2
    assert d1 == d2


async def test_calendar_notes_crud_for_user(api):
    # 1. Listar inicialmente (debe ser lista vacía para emp1)
    r = await api.get("emp1", f"{V}/users/me/calendar-notes")
    assert r.status_code == 200
    assert r.json() == []

    # 2. Crear una nota de calendario personal
    payload = {
        "title": "Entrega de Sprint y Revisión",
        "date": "2026-11-05",
        "type": "Entrega",
        "description": "Revisión final de métricas de desempeño.",
        "visibility": "PERSONAL",
    }
    create_res = await api.post("emp1", f"{V}/users/me/calendar-notes", json=payload)
    assert create_res.status_code == 201
    note = create_res.json()
    assert note["title"] == payload["title"]
    assert note["start_date"] == payload["date"]
    assert note["type"] == payload["type"]
    assert note["isCustomActivity"] is True
    note_id = note["id"]

    # 3. Editar nota (PUT): actualizar título, fecha y cambiar visibilidad a DEPARTMENT
    update_res = await api.c.put(
        f"{V}/users/me/calendar-notes/{note_id}",
        headers=api.h("emp1"),
        json={
            "title": "Entrega de Sprint y Retrospectiva",
            "date": "2026-11-06",
            "type": "Reunión",
            "description": "Notas actualizadas con retro de equipo.",
            "visibility": "DEPARTMENT",
        },
    )
    assert update_res.status_code == 200
    updated_note = update_res.json()
    assert updated_note["title"] == "Entrega de Sprint y Retrospectiva"
    assert updated_note["start_date"] == "2026-11-06"
    assert updated_note["visibility"] == "DEPARTMENT"

    # 4. Ahora que es DEPARTMENT, mgr (mismo departamento) puede verla
    mgr_list = await api.get("mgr", f"{V}/users/me/calendar-notes")
    assert mgr_list.status_code == 200
    assert len(mgr_list.json()) == 1
    assert mgr_list.json()[0]["id"] == note_id

    # 5. Usuario sin departamento (solo) no debe verla
    solo_list = await api.get("solo", f"{V}/users/me/calendar-notes")
    assert solo_list.status_code == 200
    assert len(solo_list.json()) == 0

    # 6. Eliminar la nota
    del_res = await api.c.delete(f"{V}/users/me/calendar-notes/{note_id}", headers=api.h("emp1"))
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True

    # 7. Confirmar eliminación
    list_after = await api.get("emp1", f"{V}/users/me/calendar-notes")
    assert list_after.status_code == 200
    assert len(list_after.json()) == 0


@pytest.mark.asyncio
async def test_calendar_notes_visibility_permissions(api):
    """Verifica que un empleado común no pueda publicar notas globales ni para departamentos ajenos (espera 403)."""
    # 1. Empleado intenta crear nota GLOBAL -> 403 Forbidden
    res_global = await api.post(
        "emp1",
        f"{V}/users/me/calendar-notes",
        json={
            "title": "Aviso Global No Autorizado",
            "date": "2026-11-10",
            "visibility": "GLOBAL",
        },
    )
    assert res_global.status_code == 403
    assert "Solo administradores" in res_global.json().get("detail", "")

    # 2. Empleado intenta crear nota para departamento ajeno -> 403 Forbidden
    res_other_dept = await api.post(
        "emp1",
        f"{V}/users/me/calendar-notes",
        json={
            "title": "Aviso Para Otro Departamento",
            "date": "2026-11-10",
            "visibility": "DEPARTMENT",
            "department_id": 9999,
        },
    )
    assert res_other_dept.status_code == 403
    assert "propio departamento" in res_other_dept.json().get("detail", "")

    # 3. Empleado crea una nota PERSONAL válida
    res_personal = await api.post(
        "emp1",
        f"{V}/users/me/calendar-notes",
        json={
            "title": "Mi Nota Personal",
            "date": "2026-11-10",
            "visibility": "PERSONAL",
        },
    )
    assert res_personal.status_code == 201
    note_id = res_personal.json()["id"]

    # 4. Empleado intenta escalarla a GLOBAL vía PUT -> 403 Forbidden
    res_update_forbidden = await api.c.put(
        f"{V}/users/me/calendar-notes/{note_id}",
        headers=api.h("emp1"),
        json={
            "title": "Mi Nota Escalada a Global",
            "date": "2026-11-10",
            "visibility": "GLOBAL",
        },
    )
    assert res_update_forbidden.status_code == 403

    # 5. Administrador de RRHH sí puede publicar notas con visibilidad GLOBAL -> 201 Created
    res_hr_global = await api.post(
        "hr",
        f"{V}/users/me/calendar-notes",
        json={
            "title": "Feriado Oficial Institucional",
            "date": "2026-11-16",
            "visibility": "GLOBAL",
        },
    )
    assert res_hr_global.status_code == 201
    assert res_hr_global.json()["visibility"] == "GLOBAL"

    # 6. Empleado 2 intenta editar nota de RRHH -> 403 Forbidden
    hr_note_id = res_hr_global.json()["id"]
    res_other_edit = await api.c.put(
        f"{V}/users/me/calendar-notes/{hr_note_id}",
        headers=api.h("emp2"),
        json={
            "title": "Intento de Modificación Ajena",
            "date": "2026-11-16",
            "visibility": "GLOBAL",
        },
    )
    assert res_other_edit.status_code == 403

    # 7. Empleado 2 intenta eliminar nota de RRHH -> 403 Forbidden
    res_other_del = await api.c.delete(
        f"{V}/users/me/calendar-notes/{hr_note_id}",
        headers=api.h("emp2"),
    )
    assert res_other_del.status_code == 403


@pytest.mark.asyncio
async def test_update_profile_phone_can_be_cleared(api):
    """Verifica que el teléfono del colaborador se pueda registrar y posteriormente borrar (quedar en null)."""
    # 1. Registrar teléfono
    r1 = await api.patch("emp1", f"{V}/users/me/profile", json={"phone": "5512345678"})
    assert r1.status_code == 200
    assert r1.json()["phone"] == "5512345678"

    # 2. Borrar teléfono mandando null o vacío
    r2 = await api.patch("emp1", f"{V}/users/me/profile", json={"phone": None})
    assert r2.status_code == 200
    assert r2.json()["phone"] is None

    # 3. Verificar persistencia con GET en /auth/me
    r3 = await api.get("emp1", f"{V}/auth/me")
    assert r3.status_code == 200
    assert r3.json()["phone"] is None
