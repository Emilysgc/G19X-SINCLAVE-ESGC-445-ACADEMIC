"""Utilidades de negocio: días hábiles, derecho a vacaciones, validación de CLABE."""
from datetime import date, timedelta
from typing import Optional


def is_lft_mandatory_holiday(d: date) -> bool:
    """Verifica si una fecha corresponde a un día de descanso obligatorio según el Art. 74 de la LFT:
    I. 1 de enero (Año Nuevo)
    II. Primer lunes de febrero en conmemoración del 5 de febrero (Día de la Constitución)
    III. Tercer lunes de marzo en conmemoración del 21 de marzo (Natalicio de Benito Juárez)
    IV. 1 de mayo (Día del Trabajo)
    V. 16 de septiembre (Día de la Independencia)
    VI. Tercer lunes de noviembre en conmemoración del 20 de noviembre (Revolución Mexicana)
    VII. 1 de octubre cada 6 años (Transmisión del Poder Ejecutivo Federal, reforma 2024)
    VIII. 25 de diciembre (Navidad)
    """
    m, day = d.month, d.day
    # Días fijos
    if (m, day) in {(1, 1), (5, 1), (9, 16), (12, 25)}:
        return True
    # 1 de octubre cada 6 años (a partir de 2024)
    if m == 10 and day == 1 and (d.year - 2024) % 6 == 0:
        return True
    # Primer lunes de febrero
    if m == 2 and d.weekday() == 0 and 1 <= day <= 7:
        return True
    # Tercer lunes de marzo
    if m == 3 and d.weekday() == 0 and 15 <= day <= 21:
        return True
    # Tercer lunes de noviembre
    if m == 11 and d.weekday() == 0 and 15 <= day <= 21:
        return True
    return False


def working_days(start: date, end: date) -> float:
    """Días hábiles (lunes a viernes excluyendo descansos obligatorios de la LFT) entre dos fechas, ambas inclusivas."""
    if end < start:
        return 0.0
    total = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5 and not is_lft_mandatory_holiday(cur):
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
    """CLABE interbancaria: 18 dígitos con dígito verificador módulo 10 (estándar Banxico)."""
    clean = (clabe or "").strip().replace(" ", "").replace("-", "")
    if len(clean) != 18 or not clean.isdigit():
        return False
    weights = ([3, 7, 1] * 6)[:17]
    total = sum((int(d) * w) % 10 for d, w in zip(clean[:17], weights, strict=True))
    expected = (10 - (total % 10)) % 10
    return int(clean[17]) == expected


def mask_account(value: str) -> str:
    clean = (value or "").strip().replace(" ", "").replace("-", "")
    return f"****{clean[-4:]}" if clean else ""
