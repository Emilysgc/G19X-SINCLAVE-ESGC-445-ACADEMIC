"""Utilidades de negocio: días hábiles, derecho a vacaciones, validación de CLABE."""
from datetime import date, timedelta
from typing import Optional


def working_days(start: date, end: date) -> float:
    """Días hábiles (lunes a viernes) entre dos fechas, ambas inclusivas."""
    if end < start:
        return 0.0
    total = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            total += 1
        cur += timedelta(days=1)
    return float(total)


def calendar_days(start: date, end: date) -> float:
    return float((end - start).days + 1) if end >= start else 0.0


def years_of_service(hire_date: Optional[date], on: Optional[date] = None) -> int:
    if not hire_date:
        return 0
    on = on or date.today()
    years = on.year - hire_date.year - ((on.month, on.day) < (hire_date.month, hire_date.day))
    return max(years, 0)


def vacation_entitlement(hire_date: Optional[date], on: Optional[date] = None) -> float:
    """Días de vacaciones anuales según antigüedad (Ley Federal del Trabajo, art. 76, reforma 2023).
    Antes del primer aniversario se asigna 0; RRHH puede ajustar el saldo manualmente."""
    y = years_of_service(hire_date, on)
    if y < 1:
        return 0.0
    if y <= 5:
        return float(10 + 2 * y)  # 1→12, 2→14, 3→16, 4→18, 5→20
    if y <= 10:
        return 22.0
    return float(22 + 2 * ((y - 6) // 5))  # 11-15→24, 16-20→26, ...


def clabe_is_valid(clabe: str) -> bool:
    """CLABE interbancaria: valida que contenga exactamente 18 dígitos numéricos."""
    clean = (clabe or "").strip().replace(" ", "").replace("-", "")
    return len(clean) == 18 and clean.isdigit()


def mask_account(value: str) -> str:
    clean = (value or "").strip().replace(" ", "").replace("-", "")
    return f"****{clean[-4:]}" if clean else ""
