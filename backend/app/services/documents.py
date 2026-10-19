"""Constancias laborales y de sueldo: HTML (vista previa) y PDF (reportlab)."""
import io
from types import SimpleNamespace
from datetime import date, datetime
from html import escape

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.core.config import get_settings
from app.models import Request, RequestType, User

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def fecha_larga(d: date) -> str:
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def build_doc_snapshot(user: User, dept_name: str | None) -> dict:
    now = datetime.now()
    return {
        "full_name": user.full_name,
        "employee_id": user.employee_id,
        "job_title": user.job_title or "no especificado",
        "hire_date": user.hire_date.isoformat() if user.hire_date else None,
        "salary": float(user.salary or 0.0),
        "dept_name": dept_name,
        "issue_date": now.date().isoformat(),
        "issued_at": f"{now:%Y-%m-%d %H:%M}",
    }


def _paragraphs(req: Request, snap: SimpleNamespace) -> tuple[str, list[str]]:
    s = get_settings()
    data = req.request_data or {}
    purpose = str(data.get("purpose") or "los fines que al interesado convengan")
    to = str(data.get("addressed_to") or "A quien corresponda")
    today = fecha_larga(snap.issue_date)
    area = f" en el área de {snap.dept_name}" if snap.dept_name else ""
    body = [
        f"Por medio de la presente, <b>{s.COMPANY_NAME}</b> hace constar que <b>{snap.full_name}</b>, con número de empleado "
        f"<b>{snap.employee_id}</b>, labora en esta empresa desde el <b>{fecha_larga(snap.hire_date)}</b>, "
        f"desempeñando el puesto de <b>{snap.job_title or 'no especificado'}</b>{area}."
    ]
    if req.type == RequestType.CERTIFICATE_SALARY:
        body.append(f"Percibe un sueldo mensual bruto de <b>${snap.salary:,.2f} {s.CURRENCY}</b>.")
    body.append(f"Se extiende la presente constancia para {escape(purpose)}, en la Ciudad de emisión, el {today}.")
    return escape(to), body


def _snapshot(req: Request, user: User, dept_name: str | None) -> SimpleNamespace:
    """Usa la copia congelada (_doc_snapshot) si existe, o los datos actuales escapados."""
    raw = (req.request_data or {}).get("_doc_snapshot")
    if isinstance(raw, dict):
        hire = date.fromisoformat(raw["hire_date"]) if raw.get("hire_date") else (user.hire_date or date.today())
        issue = date.fromisoformat(raw["issue_date"]) if raw.get("issue_date") else date.today()
        return SimpleNamespace(
            full_name=escape(str(raw.get("full_name", user.full_name))),
            employee_id=escape(str(raw.get("employee_id", user.employee_id))),
            job_title=escape(str(raw.get("job_title", user.job_title or ""))),
            hire_date=hire,
            salary=float(raw.get("salary", user.salary or 0.0)),
            dept_name=escape(str(raw["dept_name"])) if raw.get("dept_name") else None,
            issue_date=issue,
            issued_at=escape(str(raw.get("issued_at", f"{datetime.now():%Y-%m-%d %H:%M}"))),
        )
    now = datetime.now()
    return SimpleNamespace(
        full_name=escape(user.full_name),
        employee_id=escape(user.employee_id),
        job_title=escape(user.job_title or ""),
        hire_date=user.hire_date or date.today(),
        salary=float(user.salary or 0.0),
        dept_name=escape(dept_name) if dept_name else None,
        issue_date=now.date(),
        issued_at=f"{now:%Y-%m-%d %H:%M}",
    )


def render_html(req: Request, user: User, dept_name: str | None) -> str:
    s = get_settings()
    title = "CONSTANCIA DE SUELDO" if req.type == RequestType.CERTIFICATE_SALARY else "CONSTANCIA LABORAL"
    snapshot = _snapshot(req, user, dept_name)
    to, body = _paragraphs(req, snapshot)
    paras = "".join(f"<p>{b}</p>" for b in body)
    return f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>{title} {req.folio}</title>
<style>body{{font-family:Georgia,serif;max-width:720px;margin:48px auto;line-height:1.7;color:#111}}
h1{{text-align:center;font-size:20px;letter-spacing:1px}}.sig{{margin-top:80px;text-align:center}}
.f{{font-size:12px;color:#555;border-top:1px solid #ccc;margin-top:48px;padding-top:8px}}</style></head><body>
<h2>{escape(s.COMPANY_NAME)}</h2><div style="text-align:center;font-size:12px;color:#444">{escape(s.COMPANY_TRADE_NAME)} · RFC {escape(s.COMPANY_RFC)}<br>{escape(s.COMPANY_ADDRESS)}</div><h1>{title}</h1><p><b>{to}</b></p>{paras}
<div class="sig">______________________________<br>{escape(s.COMPANY_LEGAL_REP)}<br>Representante Legal · Recursos Humanos</div>
<div class="f">Folio de verificación: <b>{req.folio}</b> · Emitida electrónicamente el {snapshot.issued_at}</div>
</body></html>"""


def render_pdf(req: Request, user: User, dept_name: str | None) -> bytes:
    s = get_settings()
    title = "CONSTANCIA DE SUELDO" if req.type == RequestType.CERTIFICATE_SALARY else "CONSTANCIA LABORAL"
    snapshot = _snapshot(req, user, dept_name)
    to, body = _paragraphs(req, snapshot)
    styles = getSampleStyleSheet()
    body_style = ParagraphStyle("b", parent=styles["BodyText"], fontName="Times-Roman", fontSize=12, leading=20, spaceAfter=12)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, leftMargin=3 * cm, rightMargin=3 * cm, topMargin=3 * cm, bottomMargin=2.5 * cm,
                            title=f"{title} {req.folio}")
    story = [
        Paragraph(f"<b>{escape(s.COMPANY_NAME)}</b>", ParagraphStyle("c", parent=styles["Title"], fontSize=16)),
        Paragraph(f"{escape(s.COMPANY_TRADE_NAME)} · RFC {escape(s.COMPANY_RFC)}<br/>{escape(s.COMPANY_ADDRESS)}",
                  ParagraphStyle("a", parent=styles["Normal"], fontSize=9, alignment=1, textColor="#444444")),
        Paragraph(f"<b>{title}</b>", ParagraphStyle("t", parent=styles["Heading2"], alignment=1)),
        Spacer(1, 12), Paragraph(f"<b>{to}</b>", body_style),
    ] + [Paragraph(b, body_style) for b in body] + [
        Spacer(1, 70),
        Paragraph(f"______________________________<br/>{escape(s.COMPANY_LEGAL_REP)}<br/>Representante Legal · Recursos Humanos", ParagraphStyle("s", parent=body_style, alignment=1)),
        Spacer(1, 40),
        Paragraph(f"Folio de verificación: <b>{req.folio}</b> · Emitida electrónicamente el {snapshot.issued_at}",
                  ParagraphStyle("f", parent=styles["Normal"], fontSize=8, textColor="#555555")),
    ]
    doc.build(story)
    return buf.getvalue()
