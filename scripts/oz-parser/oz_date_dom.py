"""
oz_date_dom.py — выгрузить реальную структуру модалки выбора даты вылета OZ,
чтобы найти точные селекторы (дни календаря, навигация месяц/год, кнопка «продолжить»).

cd /opt/oz-parser && xvfb-run -a venv/bin/python oz_date_dom.py
"""
from __future__ import annotations
import asyncio
from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"
BASE = "https://www.ozexport.nl/ozexport/ru/EUR"
PDP_URL = (f"{BASE}/All-products/All-Flowers/Chrysanthemum/Chrys-Blooms/CHRGKA/"
           f"Chrys-bl-topspin/p/71AD0C3ACC16C0148E66BE4F2FF1C852")


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        ctx = await browser.new_context(storage_state=STATE_FILE)
        page = await ctx.new_page()
        await page.goto(PDP_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(7000)

        info = await page.evaluate(r"""() => {
            const out = {};
            const cb = document.querySelector('#colorbox');
            out.colorbox_visible = cb ? getComputedStyle(cb).display : 'нет #colorbox';
            // любые datepicker-контейнеры
            const dps = [...document.querySelectorAll('.bootstrap-datetimepicker-widget, .datepicker, [class*=datepicker], .choose_date_popup, .popup_date_continue')];
            out.containers = dps.map(d => ({
                cls: d.className,
                visible: getComputedStyle(d).display,
                rect: (() => { const r = d.getBoundingClientRect(); return {w: Math.round(r.width), h: Math.round(r.height)}; })(),
            }));
            // дни календаря — все варианты
            const days = [...document.querySelectorAll('td.day, td[class*=day], .datepicker-days td, [data-action=selectDay]')];
            out.day_sample = days.slice(0, 12).map(d => ({txt: d.textContent.trim(), cls: d.className,
                vis: getComputedStyle(d).display, da: d.getAttribute('data-action')}));
            out.day_total = days.length;
            // элементы с data-action
            out.data_actions = [...new Set([...document.querySelectorAll('[data-action]')].map(e => e.getAttribute('data-action')))].slice(0, 30);
            // кнопки в области даты
            out.date_buttons = [...document.querySelectorAll('.choose_date_popup button, .choose_date_popup a, .popup_date_continue button, .popup_date_continue a, [class*=date] button')]
                .slice(0, 15).map(b => ({txt: (b.textContent||'').trim().slice(0,30), cls: b.className, vis: getComputedStyle(b).display}));
            // заголовок календаря (месяц/год) и переключатели
            out.switches = [...document.querySelectorAll('.picker-switch, th.switch, .datepicker-switch')]
                .map(s => ({txt: s.textContent.trim().slice(0,30), cls: s.className}));
            // видимый текст модалки
            const modal = document.querySelector('.choose_date_popup');
            out.modal_text = modal ? modal.innerText.slice(0, 400) : null;
            return out;
        }""")

        import json
        print(json.dumps(info, ensure_ascii=False, indent=1))

        # сохраним outerHTML колорбокса/датапикера
        html = await page.evaluate(r"""() => {
            const el = document.querySelector('#colorbox') || document.querySelector('.choose_date_popup');
            return el ? el.outerHTML : document.body.innerHTML.slice(0, 20000);
        }""")
        with open("/tmp/oz_date_modal.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("\nHTML модалки: /tmp/oz_date_modal.html")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
