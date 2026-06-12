"""
oz_date_drive.py — драйв UI выбора даты вылета + перехват серверного запроса установки.

cd /opt/oz-parser && xvfb-run -a venv/bin/python oz_date_drive.py 2026-06-28
"""
from __future__ import annotations
import asyncio, json, re, sys
from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"
BASE = "https://www.ozexport.nl/ozexport/ru/EUR"
PDP = (f"{BASE}/All-products/All-Flowers/Chrysanthemum/Chrys-Blooms/CHRGKA/"
       f"Chrys-bl-topspin/p/71AD0C3ACC16C0148E66BE4F2FF1C852")
ORIGIN = "https://www.ozexport.nl"
NOISE = re.compile(r"(datadoghq|userlane|cookiebot|googletag|google-analytics|googleapis|"
                   r"gstatic|doubleclick|hotjar|facebook|recaptcha|\.png|\.jpg|\.svg|\.gif|"
                   r"\.woff|\.css|\.js($|\?))", re.I)


async def main(target_iso: str) -> None:
    y, mo, d = (int(x) for x in target_iso.split("-"))
    events = []
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=False)
        c = await b.new_context(storage_state=STATE_FILE)

        def keep(u): return ORIGIN in u and not NOISE.search(u)
        c.on("request", lambda r: events.append(
            {"m": r.method, "u": r.url, "post": (r.post_data or "")[:500]}) if keep(r.url) else None)

        pg = await c.new_page()
        pg.on("framenavigated", lambda fr: events.append({"m": "NAV", "u": fr.url, "post": ""})
              if keep(fr.url) else None)
        await pg.goto(PDP, wait_until="domcontentloaded", timeout=60000)
        await pg.wait_for_timeout(6000)

        # открыть пикер
        for sel in [".js-custom_datepicker .glyphicon_calendar_icon", ".js-show_date",
                    ".js-custom_datepicker"]:
            el = pg.locator(sel).first
            if await el.count():
                try:
                    await el.click(timeout=4000)
                    await pg.wait_for_timeout(1500)
                    break
                except Exception:
                    continue

        # структура открытого пикера
        picker = await pg.evaluate(r"""() => {
            const vis = el => el && getComputedStyle(el).display !== 'none' &&
                              el.getBoundingClientRect().width > 0;
            const cont = [...document.querySelectorAll('.datepicker, .bootstrap-datepicker, [class*=datepicker]')].filter(vis);
            const days = [...document.querySelectorAll('.datepicker td.day, .datepicker-days td, td.day')]
                .filter(vis).map(d => ({t: d.textContent.trim(), c: d.className}));
            const sw = [...document.querySelectorAll('.datepicker-switch, th.switch, .picker-switch')]
                .filter(vis).map(s => s.textContent.trim());
            return {containers: cont.map(c=>c.className), day_count: days.length,
                    days: days.slice(0,45), switches: sw};
        }""")
        print("ПИКЕР:", json.dumps(picker, ensure_ascii=False)[:800], flush=True)

        mark = len(events)
        clicked = False
        # навигация по месяцам к target (today месяц = mo обычно), затем клик дня
        try:
            # привести заголовок к нужному месяцу/году кликами "вперёд" при необходимости
            for _ in range(14):
                sw = pg.locator(".datepicker-switch, th.switch").first
                title = (await sw.text_content() or "").strip() if await sw.count() else ""
                if title:
                    print("   заголовок календаря:", title, flush=True)
                # клик по дню target в текущем виде
                days = pg.locator(".datepicker td.day:not(.disabled):not(.old):not(.new), "
                                  "td.day:not(.disabled):not(.old):not(.new)")
                n = await days.count()
                hit = False
                for i in range(n):
                    el = days.nth(i)
                    if (await el.text_content() or "").strip() == str(d):
                        await el.click(); clicked = True; hit = True
                        print(f"   кликнул день {d}", flush=True)
                        break
                if hit:
                    break
                # иначе листаем вперёд
                nxt = pg.locator(".datepicker .next, th.next").first
                if await nxt.count():
                    await nxt.click(); await pg.wait_for_timeout(500)
                else:
                    break
        except Exception as e:
            print("   ошибка навигации:", e, flush=True)

        await pg.wait_for_timeout(2000)
        # подтверждение
        conf = pg.locator(".confirm_select_date").first
        if await conf.count():
            try:
                await conf.click(timeout=5000)
                print("   нажал «Продолжить» (confirm_select_date)", flush=True)
                await pg.wait_for_timeout(5000)
            except Exception as e:
                print("   confirm не нажался:", e, flush=True)

        print("\n=== ЗАПРОСЫ ПОСЛЕ ВЫБОРА/ПОДТВЕРЖДЕНИЯ ===", flush=True)
        for e in events[mark:]:
            print(f"   {e['m']} {e['u'].replace(ORIGIN,'')[:130]}", flush=True)
            if e["post"]:
                print(f"       body: {e['post'][:300]}", flush=True)

        # проверка применения: availability + текст поля даты
        date_field = await pg.evaluate("() => document.querySelector('.js-show_date')?.value || null")
        print(f"\n   значение поля даты: {date_field}", flush=True)

        avail = {"p": None}
        pg.on("response", lambda r: avail.__setitem__("p", r) if "stockLines/availability" in r.url and avail["p"] is None else None)
        cap = {"json": None}
        async def grab(r):
            if "stockLines/availability" in r.url and cap["json"] is None:
                try: cap["json"] = await r.json()
                except Exception: pass
        pg.on("response", grab)
        await pg.goto(PDP, wait_until="domcontentloaded", timeout=60000)
        await pg.wait_for_timeout(8000)
        if cap["json"]:
            m2 = cap["json"].get("allStockPdpMap") or {}
            print(f"   availability теперь: { {k: len(v or []) for k,v in m2.items()} or 'ПУСТО'}", flush=True)

        json.dump({"target": target_iso, "events": events[mark:], "date_field": date_field},
                  open("/tmp/oz_date_drive.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("\nдамп: /tmp/oz_date_drive.json", flush=True)
        await b.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "2026-06-28"))
