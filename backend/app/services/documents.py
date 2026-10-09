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


def _paragraphs(req: Request, user, dept_name: str | None) -> tuple[str, list[str]]:
    s = get_settings()
    data = req.request_data or {}
    purpose = str(data.get("purpose") or "los fines que al interesado convengan")
    to = str(data.get("addressed_to") or "A quien corresponda")
    today = fecha_larga(date.today())
    area = f" en el área de {dept_name}" if dept_name else ""
    body = [
        f"Por medio de la presente, <b>{s.COMPANY_NAME}</b> hace constar que <b>{user.full_name}</b>, con número de empleado "
        f"<b>{user.employee_id}</b>, labora en esta empresa desde el <b>{fecha_larga(user.hire_date)}</b>, "
        f"desempeñando el puesto de <b>{user.job_title or 'no especificado'}</b>{area}."
    ]
    if req.type == RequestType.CERTIFICATE_SALARY:
        body.append(f"Percibe un sueldo mensual bruto de <b>${user.salary:,.2f} {s.CURRENCY}</b>.")
    body.append(f"Se extiende la presente constancia para {escape(purpose)}, en la Ciudad de emisión, el {today}.")
    return escape(to), body


def _snapshot(user: User) -> SimpleNamespace:
    """Copia con los textos escapados (los datos de usuario nunca deben llegar crudos al HTML/PDF)."""
    return SimpleNamespace(full_name=escape(user.full_name), employee_id=escape(user.employee_id),
                           job_title=escape(user.job_title or ""), hire_date=user.hire_date, salary=user.salary)


def render_html(req: Request, user: User, dept_name: str | None) -> str:
    s = get_settings()
    title = "CONSTANCIA DE SUELDO" if req.type == RequestType.CERTIFICATE_SALARY else "CONSTANCIA LABORAL"
    snapshot = _snapshot(user)
    to, body = _paragraphs(req, snapshot, escape(dept_name) if dept_name else None)
    paras = "".join(f"<p>{b}</p>" for b in body)
    return f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>{title} {req.folio}</title>
<style>body{{font-family:Georgia,serif;max-width:720px;margin:48px auto;line-height:1.7;color:#111}}
h1{{text-align:center;font-size:20px;letter-spacing:1px}}.sig{{margin-top:80px;text-align:center}}
.f{{font-size:12px;color:#555;border-top:1px solid #ccc;margin-top:48px;padding-top:8px}}</style></head><body>
<h2>{escape(s.COMPANY_NAME)}</h2><div style="text-align:center;font-size:12px;color:#444">{escape(s.COMPANY_TRADE_NAME)} · RFC {escape(s.COMPANY_RFC)}<br>{escape(s.COMPANY_ADDRESS)}</div><h1>{title}</h1><p><b>{to}</b></p>{paras}
<div class="sig">______________________________<br>{escape(s.COMPANY_LEGAL_REP)}<br>Representante Legal · Recursos Humanos</div>
<div class="f">Folio de verificación: <b>{req.folio}</b> · Emitida electrónicamente el {datetime.now():%Y-%m-%d %H:%M}</div>
</body></html>"""


def render_pdf(req: Request, user: User, dept_name: str | None) -> bytes:
    s = get_settings()
    title = "CONSTANCIA DE SUELDO" if req.type == RequestType.CERTIFICATE_SALARY else "CONSTANCIA LABORAL"
    snapshot = _snapshot(user)
    to, body = _paragraphs(req, snapshot, escape(dept_name) if dept_name else None)
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
        Paragraph(f"Folio de verificación: <b>{req.folio}</b> · Emitida electrónicamente el {datetime.now():%Y-%m-%d %H:%M}",
                  ParagraphStyle("f", parent=styles["Normal"], fontSize=8, textColor="#555555")),
    ]
    doc.build(story)
    return buf.getvalue()
