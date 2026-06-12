"""
oz_departure.py — установка ДАТЫ ВЫЛЕТА в серверной сессии OZ.

Механизм (пойман oz_date_drive.py, 12.06.2026):
  GET /ozexport/ru/EUR/view/DepartureDateComponentController/updateDepartureDate
      ?departureDate=<JS Date.toString()>&switchingDatesConsent=false
  Пример departureDate: "Tue Jul 28 2026 12:00:00 GMT+0000 (Coordinated Universal Time)".
  Дата живёт в HTTP-сессии (JSESSIONID); листинг категорий и availability считаются
  на неё. OZ принимает ТОЛЬКО будни (выходные в календаре disabled).

set_departure_date(context, "2026-06-29") — дёргает эндпоинт под сессией, проверяет,
что поле даты на странице (.js-show_date) сменилось. Возвращает (ok: bool, shown: str|None).
"""
from __future__ import annotations

import urllib.parse
from datetime import date

BASE = "https://www.ozexport.nl/ozexport/ru/EUR"
ENDPOINT = f"{BASE}/view/DepartureDateComponentController/updateDepartureDate"
PROBE_PDP = (f"{BASE}/All-products/All-Flowers/Chrysanthemum/Chrys-Blooms/CHRGKA/"
             f"Chrys-bl-topspin/p/71AD0C3ACC16C0148E66BE4F2FF1C852")

_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# карта рус. подписей месяца (.js-show_date показывает "29-июнь") для верификации
_RU_MON = {6: "июн", 7: "июл", 8: "авг", 9: "сен", 10: "окт", 11: "ноя", 12: "дек",
           1: "янв", 2: "фев", 3: "мар", 4: "апр", 5: "ма"}


def is_weekday(iso: str) -> bool:
    y, m, d = (int(x) for x in iso.split("-"))
    return date(y, m, d).weekday() < 5


def js_date_string(iso: str) -> str:
    """ISO YYYY-MM-DD -> формат JS Date.toString(), как ждёт OZ."""
    y, m, d = (int(x) for x in iso.split("-"))
    dt = date(y, m, d)
    return (f"{_DOW[dt.weekday()]} {_MON[m - 1]} {d:02d} {y} "
            "12:00:00 GMT+0000 (Coordinated Universal Time)")


def departure_url(iso: str) -> str:
    qs = urllib.parse.urlencode({
        "departureDate": js_date_string(iso),
        "switchingDatesConsent": "false",
    })
    return f"{ENDPOINT}?{qs}"


async def set_departure_date(context, iso: str):
    """Ставит дату в сессии context. -> (ok, shown_value). НЕ кидает."""
    if not is_weekday(iso):
        return (False, f"{iso} — выходной, OZ принимает только будни")
    # 1) дёргаем эндпоинт под сессией (несёт куки JSESSIONID)
    try:
        resp = await context.request.get(departure_url(iso),
                                          headers={"Accept": "*/*"})
        if resp.status >= 400:
            return (False, f"HTTP {resp.status} на updateDepartureDate")
    except Exception as e:  # noqa: BLE001
        return (False, f"запрос updateDepartureDate упал: {e}")

    # 2) верификация: открываем PDP, читаем поле .js-show_date (например "29-июнь")
    page = await context.new_page()
    try:
        await page.goto(PROBE_PDP, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)
        shown = await page.evaluate("() => document.querySelector('.js-show_date')?.value || null")
    except Exception as e:  # noqa: BLE001
        await page.close()
        return (False, f"проверка поля даты не удалась: {e}")
    finally:
        if not page.is_closed():
            await page.close()

    if not shown:
        return (False, "поле даты пустое — не удалось подтвердить")
    y, m, d = (int(x) for x in iso.split("-"))
    ok = (str(d) in shown) and (_RU_MON.get(m, "") in shown.lower())
    return (ok, shown)
