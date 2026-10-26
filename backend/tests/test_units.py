from datetime import date

from app.services.utils import (
    clabe_is_valid,
    is_lft_mandatory_holiday,
    mask_account,
    vacation_entitlement,
    working_days,
    years_of_service,
)


def make_clabe(prefix17: str) -> str:
    weights = ([3, 7, 1] * 6)[:17]
    total = sum((int(d) * w) % 10 for d, w in zip(prefix17, weights, strict=True))
    return prefix17 + str((10 - total % 10) % 10)


def test_working_days_skips_weekends():
    assert working_days(date(2026, 3, 2), date(2026, 3, 6)) == 5      # lun-vie sin festivos
    assert working_days(date(2026, 3, 2), date(2026, 3, 8)) == 5      # incluye fin de semana
    assert working_days(date(2026, 3, 7), date(2026, 3, 8)) == 0      # solo fin de semana
    assert working_days(date(2026, 3, 6), date(2026, 3, 2)) == 0


def test_working_days_skips_lft_mandatory_holidays():
    # 1 de mayo (Día del Trabajo)
    assert is_lft_mandatory_holiday(date(2026, 5, 1))
    assert working_days(date(2026, 5, 1), date(2026, 5, 1)) == 0

    # 30 de abril (jueves) a 4 de mayo (lunes) 2026:
    # Jueves 30 (1) + Viernes 1 de mayo (LFT 0) + Sábado 2 (0) + Domingo 3 (0) + Lunes 4 (1) = 2 días hábiles
    assert working_days(date(2026, 4, 30), date(2026, 5, 4)) == 2

    # Tercer lunes de marzo (Natalicio de Benito Juárez, Art. 74 fracc. III LFT)
    assert is_lft_mandatory_holiday(date(2026, 3, 16))
    assert working_days(date(2026, 3, 16), date(2026, 3, 16)) == 0

    # 16 de septiembre (miércoles en 2026, Independencia): 5 días hábiles de la semana menos el 16 = 4
    assert is_lft_mandatory_holiday(date(2026, 9, 16))
    assert working_days(date(2026, 9, 14), date(2026, 9, 18)) == 4

    # 25 de diciembre (Navidad)
    assert is_lft_mandatory_holiday(date(2026, 12, 25))
    assert working_days(date(2026, 12, 25), date(2026, 12, 25)) == 0


def test_vacation_entitlement_lft_table():
    on = date(2026, 6, 1)
    expected = {0: 0, 1: 12, 2: 14, 3: 16, 4: 18, 5: 20, 6: 22, 10: 22, 11: 24, 15: 24, 16: 26, 21: 28, 31: 32}
    for years, days in expected.items():
        hire = date(2026 - years, 1, 1)
        assert years_of_service(hire, on) == years
        assert vacation_entitlement(hire, on) == days, years
    assert vacation_entitlement(None) == 0


def test_clabe_validation():
    ok = make_clabe("01218000011234567")
    assert clabe_is_valid(ok)
    assert not clabe_is_valid(ok[:-1] + str((int(ok[-1]) + 1) % 10))
    assert not clabe_is_valid("123") and not clabe_is_valid("abcdefghijklmnopqr")
    assert mask_account(ok) == f"****{ok[-4:]}"
