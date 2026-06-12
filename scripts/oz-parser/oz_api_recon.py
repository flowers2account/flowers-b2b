"""
oz_api_recon.py — РАЗОВАЯ разведка служебного API ozexport.nl под нашей сессией.

Цель: задокументировать внутренние эндпоинты (нет публичной документации).
НЕ массовый прогон — единичные запросы со сценарными паузами, в рамках robots.txt.

Запуск на VPS (нет дисплея → headed через xvfb):
  cd /opt/oz-parser && xvfb-run -a venv/bin/python oz_api_recon.py

Делает:
  1. Перехват ВСЕХ request/response (URL, метод, тело, ключевые заголовки,
     статус, content-type, срез JSON-ответа). Шум (datadog/userlane/...) отсеян.
  2. Сценарии: загрузка карточки → модалка даты вылета (выбор дня) →
     повторный availability → переход в категорию → добавление в корзину →
     удаление из корзины.
  3. Проба стандартного SAP Commerce OCC REST:
     GET /occ/v2/ozexport/products/{code} и /products/{code}/stock
     (+ несколько вариантов baseSite/полей) — под сессионными куками.
  4. Дамп: /tmp/oz_api_map.json (полный) + сводка в stdout.

Ничего не пишет в Supabase.
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone

from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"
ORIGIN = "https://www.ozexport.nl"
BASE = f"{ORIGIN}/ozexport/ru/EUR"

# сценарные цели (реальные коды из нашей БД)
ACTIVE_CODE = "71AD0C3ACC16C0148E66BE4F2FF1C852"
ACTIVE_URL = (f"{BASE}/All-products/All-Flowers/Chrysanthemum/Chrys-Blooms/"
              f"CHRGKA/Chrys-bl-topspin/p/{ACTIVE_CODE}")
INACTIVE_CODE = "D9BFB856A1C6D592C95D7755C5A15561"
INACTIVE_URL = (f"{BASE}/All-products/All-Flowers/Rosa-Ecuador/Rosa-Ecuador-large/"
                f"ROGECU/Rosa-ec-twilight/p/{INACTIVE_CODE}")

# шум аналитики/виджетов — не служебное API OZ
NOISE = re.compile(
    r"(datadoghq|userlane|cookiebot|googletagmanager|google-analytics|googleapis|"
    r"gstatic|doubleclick|hotjar|facebook|cdn\.|\.png|\.jpg|\.jpeg|\.svg|\.gif|"
    r"\.woff|\.css|\.js($|\?)|fonts|recaptcha|youtube)", re.I)

events: list[dict] = []
_seen_resp: set[int] = set()


def interesting(url: str) -> bool:
    return ORIGIN in url and not NOISE.search(url)


async def main() -> None:
    occ_probe_results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        ctx = await browser.new_context(storage_state=STATE_FILE)
        page = await ctx.new_page()

        # ── перехват ──────────────────────────────────────────────────
        async def on_request(req):
            if not interesting(req.url):
                return
            try:
                post = req.post_data
            except Exception:  # noqa: BLE001
                post = None
            events.append({
                "phase": CURRENT["phase"],
                "dir": "req",
                "method": req.method,
                "url": req.url,
                "resource_type": req.resource_type,
                "content_type": req.headers.get("content-type"),
                "x_requested_with": req.headers.get("x-requested-with"),
                "post_data": (post or "")[:2000],
            })

        async def on_response(resp):
            if not interesting(resp.url) or id(resp) in _seen_resp:
                return
            _seen_resp.add(id(resp))
            ct = resp.headers.get("content-type", "")
            body_keys, body_snip = None, None
            if "application/json" in ct:
                try:
                    data = await resp.json()
                    if isinstance(data, dict):
                        body_keys = sorted(data.keys())
                    body_snip = json.dumps(data, ensure_ascii=False)[:1500]
                except Exception:  # noqa: BLE001
                    pass
            events.append({
                "phase": CURRENT["phase"],
                "dir": "resp",
                "status": resp.status,
                "method": resp.request.method,
                "url": resp.url,
                "content_type": ct[:60],
                "json_keys": body_keys,
                "json_snippet": body_snip,
            })

        page.on("request", lambda r: asyncio.create_task(on_request(r)))
        page.on("response", lambda r: asyncio.create_task(on_response(r)))

        async def goto(url, wait=12_000):
            await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            await page.wait_for_timeout(wait)

        # ── 1. карточка активного товара ──────────────────────────────
        CURRENT["phase"] = "product_active"
        print(">> карточка активного товара", flush=True)
        await goto(ACTIVE_URL)

        # CSRF-токен со страницы — пригодится для документации cart/availability
        csrf = await page.evaluate("""() => {
            const i = document.querySelector('input[name=CSRFToken], #CSRFToken');
            if (i) return i.value;
            if (window.ACC && ACC.config && ACC.config.CSRFToken) return ACC.config.CSRFToken;
            return null;
        }""")
        print(f"   CSRFToken на странице: {'есть' if csrf else 'нет'}", flush=True)

        # ── 2. модалка даты вылета ────────────────────────────────────
        CURRENT["phase"] = "date_modal"
        print(">> модалка даты вылета", flush=True)
        modal = page.locator("#colorbox .choose_date_popup")
        try:
            if await modal.count() and await modal.is_visible():
                # доступные дни в календаре
                days = page.locator("#colorbox td.day:not(.disabled):not(.old):not(.new)")
                n = await days.count()
                print(f"   доступных дней в календаре: {n}", flush=True)
                if n:
                    await days.first.click()
                    await page.wait_for_timeout(6_000)
                    # подтверждение «продолжить» если появилось
                    cont = page.locator(".popup_date_continue:not(.hidden) button, "
                                        ".popup_date_continue:not(.hidden) a")
                    if await cont.count():
                        await cont.first.click()
                        await page.wait_for_timeout(6_000)
                    print(f"   после выбора дня: модалка видима = "
                          f"{await modal.is_visible()}", flush=True)
            else:
                print("   модалки нет (дата уже выбрана в сессии?)", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"   модалка: {e}", flush=True)

        # cookies после выбора даты
        date_cookies = [
            {"name": c["name"], "value": c["value"][:80], "domain": c["domain"]}
            for c in await ctx.cookies()
            if re.search(r"date|day|depart|delivery|flight", c["name"], re.I)
        ]

        # ── 3. повторная карточка (теперь с датой) ────────────────────
        CURRENT["phase"] = "product_after_date"
        print(">> карточка ещё раз (дата выбрана)", flush=True)
        await goto(ACTIVE_URL, wait=10_000)
        await page.wait_for_timeout(2_000)

        # ── 4. деактивированный товар (была ли пустота из-за даты) ─────
        CURRENT["phase"] = "product_inactive_after_date"
        print(">> деактивированный товар (после выбора даты)", flush=True)
        await goto(INACTIVE_URL, wait=10_000)

        # ── 5. категория ──────────────────────────────────────────────
        CURRENT["phase"] = "category"
        print(">> категория", flush=True)
        try:
            cat_link = page.locator("a[href*='/c/']").first
            if await cat_link.count():
                href = await cat_link.get_attribute("href")
                print(f"   перехожу в категорию: {href}", flush=True)
                await goto(ORIGIN + href if href.startswith("/") else href, wait=10_000)
        except Exception as e:  # noqa: BLE001
            print(f"   категория: {e}", flush=True)

        # ── 6. добавление в корзину + удаление ────────────────────────
        CURRENT["phase"] = "cart_add"
        print(">> добавление в корзину", flush=True)
        await goto(ACTIVE_URL, wait=8_000)
        try:
            btn = page.locator(
                "button.js-add-to-cart, button.add_to_cart_button, "
                "button[type=submit].btn-primary, .js-enable-btn").first
            if await btn.count():
                await btn.scroll_into_view_if_needed()
                await btn.click(timeout=8_000)
                await page.wait_for_timeout(6_000)
                print("   кнопка добавления нажата", flush=True)
            else:
                print("   кнопку добавления не нашёл", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"   add-to-cart: {e}", flush=True)

        CURRENT["phase"] = "cart_view"
        print(">> просмотр корзины", flush=True)
        await goto(f"{BASE}/cart", wait=8_000)

        CURRENT["phase"] = "cart_remove"
        print(">> удаление из корзины", flush=True)
        try:
            rm = page.locator("a.js-remove-entry, button.js-qty-remove, "
                              ".js-execute-entry-action-button, a[href*='cartEntry']").first
            if await rm.count():
                await rm.click(timeout=8_000)
                await page.wait_for_timeout(6_000)
                print("   удаление нажато", flush=True)
            else:
                print("   кнопку удаления не нашёл", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"   remove: {e}", flush=True)

        # ── 7. проба OCC REST (SAP Commerce стандарт) ─────────────────
        print(">> проба OCC REST", flush=True)
        occ_paths = [
            f"{ORIGIN}/occ/v2/ozexport/products/{ACTIVE_CODE}",
            f"{ORIGIN}/occ/v2/ozexport/products/{ACTIVE_CODE}/stock",
            f"{ORIGIN}/occ/v2/ozexport/products/{ACTIVE_CODE}?fields=FULL",
            f"{ORIGIN}/occ/v2/ozexportSite/products/{ACTIVE_CODE}",
            f"{ORIGIN}/rest/v2/ozexport/products/{ACTIVE_CODE}",
            f"{ORIGIN}/occ/v2/ozexport/products/search?query={ACTIVE_CODE}",
        ]
        for u in occ_paths:
            try:
                r = await ctx.request.get(u, headers={"Accept": "application/json"})
                ct = r.headers.get("content-type", "")
                snip = (await r.text())[:300]
                occ_probe_results.append({"url": u, "status": r.status,
                                          "content_type": ct[:60], "snippet": snip})
                print(f"   {r.status:>3} {ct[:30]:<30} {u}", flush=True)
                await page.wait_for_timeout(11_000)  # robots.txt 1/10s
            except Exception as e:  # noqa: BLE001
                occ_probe_results.append({"url": u, "error": str(e)})
                print(f"   ERR {u}: {e}", flush=True)

        await browser.close()

    out = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "csrf_present": bool(csrf),
        "date_cookies": date_cookies,
        "events": events,
        "occ_probe": occ_probe_results,
    }
    with open("/tmp/oz_api_map.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # ── сводка служебных эндпоинтов (req, без шума, уникальные) ────────
    print("\n==== СВОДКА: служебные запросы по фазам ====", flush=True)
    seen = set()
    for e in events:
        if e["dir"] != "req":
            continue
        path = re.sub(rf"^{re.escape(ORIGIN)}", "", e["url"].split("?")[0])
        key = (e["phase"], e["method"], path)
        if key in seen:
            continue
        seen.add(key)
        body = f"  body: {e['post_data'][:160]}" if e.get("post_data") else ""
        print(f"[{e['phase']}] {e['method']} {path}{body}", flush=True)
    print("\nПолный дамп: /tmp/oz_api_map.json", flush=True)


CURRENT = {"phase": "init"}

if __name__ == "__main__":
    asyncio.run(main())
