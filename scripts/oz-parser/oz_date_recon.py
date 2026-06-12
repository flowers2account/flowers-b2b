"""
oz_date_recon.py — дозахват механизма установки ДАТЫ ВЫЛЕТА в сессии OZ.

Блокер: листинг категории и availability зависят от выбранной в сессии даты вылета.
В OZ_INTERNAL_API.md зафиксировано, что дата живёт в серверной сессии, но запрос её
установки не пойман. Здесь ловим ВСЁ при выборе конкретного дня.

Запуск на VPS (headed через xvfb):
  cd /opt/oz-parser && xvfb-run -a venv/bin/python oz_date_recon.py 2026-06-28

Делает:
  1. Открывает карточку товара → появляется модалка «Выберите дату вылета».
  2. Снимает cookies ДО, включает полный перехват (context-level: request/response,
     form-submit через post_data, навигации фреймов).
  3. Кликает нужный день (по умолчанию число из аргумента-даты в текущем месяце),
     проходит подтверждение «продолжить».
  4. Снимает cookies ПОСЛЕ → diff; печатает все запросы, прошедшие во время выбора.
  5. Ищет индикатор выбранной даты на странице (шапка корзины и т.п.).
  6. Повторно дёргает availability товара — сравнивает число линий до/после.

Ничего не пишет в БД.
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import date

from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"
BASE = "https://www.ozexport.nl/ozexport/ru/EUR"
# карточка с известным набором линий (Bouvardia Sweet Jewel из теста)
PRODUCT_URL = (f"{BASE}/All-products/All-Flowers/Bouvardia/c/Bouvardia")
# для PDP-проверки возьмём конкретный товар
PDP_URL = (f"{BASE}/All-products/All-Flowers/Chrysanthemum/Chrys-Blooms/CHRGKA/"
           f"Chrys-bl-topspin/p/71AD0C3ACC16C0148E66BE4F2FF1C852")

ORIGIN = "https://www.ozexport.nl"
NOISE = re.compile(r"(datadoghq|userlane|cookiebot|googletagmanager|google-analytics|"
                   r"googleapis|gstatic|doubleclick|hotjar|facebook|recaptcha|youtube|"
                   r"\.png|\.jpg|\.svg|\.gif|\.woff|\.css|\.js($|\?))", re.I)


def interesting(url: str) -> bool:
    return ORIGIN in url and not NOISE.search(url)


async def cookie_map(ctx):
    return {c["name"]: c["value"] for c in await ctx.cookies()}


async def main(target_iso: str) -> None:
    y, m, d = (int(x) for x in target_iso.split("-"))
    target_day = str(d)
    events = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        ctx = await browser.new_context(storage_state=STATE_FILE)

        def on_request(req):
            if interesting(req.url):
                events.append({"dir": "req", "method": req.method,
                               "url": req.url, "rtype": req.resource_type,
                               "post": (req.post_data or "")[:600]})

        def on_response(resp):
            if interesting(resp.url):
                events.append({"dir": "resp", "status": resp.status,
                               "method": resp.request.method, "url": resp.url})

        ctx.on("request", on_request)
        ctx.on("response", on_response)

        page = await ctx.new_page()
        page.on("framenavigated", lambda fr: events.append(
            {"dir": "nav", "url": fr.url}) if interesting(fr.url) else None)

        print(f">> цель: {target_iso} (день {target_day}, месяц {m}, год {y})", flush=True)
        print(">> открываю карточку для модалки даты", flush=True)
        await page.goto(PDP_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(6000)

        cookies_before = await cookie_map(ctx)
        mark = len(events)   # точка отсчёта «во время выбора»

        modal = page.locator("#colorbox .choose_date_popup")
        sel_before = await page.evaluate("() => document.body.innerText.match(/Дата вылета[^\\n]*/i)?.[0] || null")
        print(f"   индикатор даты ДО: {sel_before}", flush=True)

        if await modal.count() == 0 or not await modal.is_visible():
            print("   модалки нет — пытаюсь открыть по иконке календаря", flush=True)
            cal = page.locator(".js-calendar_icon, .js-show_date").first
            if await cal.count():
                await cal.click()
                await page.wait_for_timeout(2500)

        # выбрать нужный день в текущем месяце (сегодня в этом же месяце → день виден)
        clicked = False
        try:
            days = page.locator(
                f"#colorbox td.day:not(.disabled):not(.old):not(.new)")
            n = await days.count()
            print(f"   доступных дней в календаре: {n}", flush=True)
            for i in range(n):
                el = days.nth(i)
                txt = (await el.text_content() or "").strip()
                if txt == target_day:
                    await el.click()
                    clicked = True
                    print(f"   кликнул день {target_day}", flush=True)
                    break
            if not clicked and n:
                # запасной вариант — первый доступный, чтобы хотя бы поймать механизм
                t0 = (await days.nth(0).text_content() or "").strip()
                await days.nth(0).click()
                clicked = True
                print(f"   нужный день не найден; кликнул первый доступный ({t0})", flush=True)
            await page.wait_for_timeout(3000)
            # подтверждение «продолжить»
            cont = page.locator(".popup_date_continue:not(.hidden) button, "
                                ".popup_date_continue:not(.hidden) a, "
                                ".popup_date_continue_content button")
            if await cont.count():
                print("   есть диалог подтверждения — жму продолжить", flush=True)
                await cont.first.click()
                await page.wait_for_timeout(4000)
        except Exception as e:  # noqa: BLE001
            print(f"   ошибка выбора дня: {e}", flush=True)

        await page.wait_for_timeout(4000)
        cookies_after = await cookie_map(ctx)

        # diff cookies
        print("\n=== COOKIE DIFF ===", flush=True)
        changed = False
        for k in sorted(set(cookies_before) | set(cookies_after)):
            b, a = cookies_before.get(k), cookies_after.get(k)
            if b != a:
                changed = True
                print(f"   {k}: {str(b)[:40]} -> {str(a)[:40]}", flush=True)
        if not changed:
            print("   (cookies не изменились)", flush=True)

        # запросы во время выбора
        print("\n=== ЗАПРОСЫ ВО ВРЕМЯ ВЫБОРА ДАТЫ ===", flush=True)
        for e in events[mark:]:
            if e["dir"] == "req":
                path = e["url"].replace(ORIGIN, "")
                print(f"   REQ {e['method']} {path[:120]}", flush=True)
                if e.get("post"):
                    print(f"       body: {e['post'][:300]}", flush=True)
            elif e["dir"] == "nav":
                print(f"   NAV {e['url'].replace(ORIGIN,'')[:120]}", flush=True)

        # индикатор даты ПОСЛЕ
        await page.goto(PDP_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(4000)
        sel_after = await page.evaluate("() => document.body.innerText.match(/Дата вылета[^\\n]*/i)?.[0] || null")
        # ищем дату в шапке корзины / на странице
        date_hits = await page.evaluate(
            "() => [...document.querySelectorAll('*')].map(e=>e.textContent)"
            ".filter(t=>t && /\\b(28|июн|jun|2026)\\b/i.test(t) && t.length<60).slice(0,8)")
        print(f"\n   индикатор даты ПОСЛЕ: {sel_after}", flush=True)
        print(f"   возможные индикаторы даты на странице: {date_hits}", flush=True)

        # повторный availability — сколько линий теперь
        avail = {"payload": None}
        async def cap(resp):
            if "stockLines/availability" in resp.url and avail["payload"] is None:
                try:
                    avail["payload"] = await resp.json()
                except Exception:  # noqa: BLE001
                    pass
        page.on("response", cap)
        await page.goto(PDP_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(8000)
        if avail["payload"]:
            m2 = avail["payload"].get("allStockPdpMap") or {}
            print(f"\n   availability после даты: типы линий = "
                  f"{ {k: len(v or []) for k,v in m2.items()} or 'ПУСТО'}", flush=True)

        json.dump({"target": target_iso, "cookie_before": cookies_before,
                   "cookie_after": cookies_after, "events": events[mark:]},
                  open("/tmp/oz_date_recon.json", "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("\nдамп: /tmp/oz_date_recon.json", flush=True)
        await browser.close()


if __name__ == "__main__":
    tgt = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()
    asyncio.run(main(tgt))
