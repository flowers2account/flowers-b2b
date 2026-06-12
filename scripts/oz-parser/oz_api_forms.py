"""
oz_api_forms.py — добор к oz_api_recon: вытащить из DOM PDP точные эндпоинты форм
(добавление в корзину, выбор даты вылета) и имена полей — без реального заказа.

Запуск: cd /opt/oz-parser && xvfb-run -a venv/bin/python oz_api_forms.py
"""
from __future__ import annotations

import asyncio
import json

from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"
BASE = "https://www.ozexport.nl/ozexport/ru/EUR"
URL = f"{BASE}/All-products/All-Flowers/Chrysanthemum/Chrys-Blooms/CHRGKA/Chrys-bl-topspin/p/71AD0C3ACC16C0148E66BE4F2FF1C852"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        ctx = await browser.new_context(storage_state=STATE_FILE)
        page = await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_timeout(10_000)

        forms = await page.evaluate("""() => {
            const out = [];
            for (const f of document.querySelectorAll('form')) {
                const fields = [...f.querySelectorAll('input,select,button')].map(el => ({
                    tag: el.tagName.toLowerCase(),
                    name: el.name || null,
                    type: el.type || null,
                    value: (el.type === 'hidden' || el.tagName === 'BUTTON')
                           ? (el.value || el.textContent || '').slice(0, 40) : null,
                }));
                out.push({
                    id: f.id || null,
                    cls: f.className || null,
                    action: f.action || null,
                    method: (f.method || 'get').toUpperCase(),
                    fields: fields.slice(0, 25),
                });
            }
            return out;
        }""")

        # ссылки/кнопки, относящиеся к дате и корзине
        controls = await page.evaluate("""() => {
            const pick = sel => [...document.querySelectorAll(sel)].slice(0, 8).map(el => ({
                tag: el.tagName.toLowerCase(),
                cls: el.className || null,
                data_action: el.getAttribute('data-action'),
                href: el.getAttribute('href'),
                text: (el.textContent || '').trim().slice(0, 50),
            }));
            return {
                date: pick("[class*=date], [data-action*=ate], .js-show_date, .js-calendar_icon"),
                cart: pick("[class*=cart], [class*=basket], button[type=submit]"),
            };
        }""")

        out = {"forms": forms, "controls": controls}
        with open("/tmp/oz_api_forms.json", "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)

        print("=== ФОРМЫ ===")
        for fm in forms:
            if not fm["action"]:
                continue
            names = [x["name"] for x in fm["fields"] if x["name"]]
            print(f"{fm['method']} {fm['action']}")
            print(f"   id={fm['id']} cls={fm['cls']}")
            print(f"   поля: {names}")
            for x in fm["fields"]:
                if x["value"]:
                    print(f"      {x['name'] or x['tag']} = {x['value']}")
            print()
        print("Дамп: /tmp/oz_api_forms.json")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
