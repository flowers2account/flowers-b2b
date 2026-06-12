"""
oz_diag_dom.py — где живут Grower Direct-цены, если allStockPdpMap пуст,
а noOfPricesShown=2: смотрим DOM (innerText вокруг 'Grower'/'€'), сохраняем HTML.

Запуск на VPS: cd /opt/oz-parser && venv/bin/python oz_diag_dom.py --limit 2
"""
from __future__ import annotations

import argparse
import asyncio
import re

from oz_price_refresh import Supa, load_env
from oz_diag_lines import select_deactivated
from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"


async def main(limit: int) -> None:
    load_env()
    supa = Supa()
    targets = select_deactivated(supa, limit)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=STATE_FILE)
        for t in targets:
            page = await context.new_page()
            print(f"== #{t['id']} {t['name']}", flush=True)
            try:
                await page.goto(t["source_url"], wait_until="domcontentloaded", timeout=60_000)
                await page.wait_for_timeout(15_000)
            except Exception as e:  # noqa: BLE001
                print(f"   ERROR {e}", flush=True)
                await page.close()
                continue

            text = await page.evaluate("document.body.innerText")
            html = await page.content()
            with open(f"/tmp/oz_pdp_{t['id']}.html", "w", encoding="utf-8") as f:
                f.write(html)

            # фрагменты innerText вокруг упоминаний grower / direct / €
            for m in re.finditer(r"(?i)grower", text):
                frag = text[max(0, m.start() - 250): m.end() + 400]
                print("   --- фрагмент innerText (grower) ---", flush=True)
                print("   " + frag.replace("\n", " | ")[:900], flush=True)
            euro_lines = [ln.strip() for ln in text.splitlines() if "€" in ln]
            print(f"   строк с €: {len(euro_lines)}; первые 15:", flush=True)
            for ln in euro_lines[:15]:
                print("      " + ln[:160], flush=True)
            await page.close()
            print("", flush=True)
        await browser.close()
    print("HTML сохранён: /tmp/oz_pdp_<id>.html", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=2)
    asyncio.run(main(ap.parse_args().limit))
