"""
oz_diag_xhr.py — ловит ВСЕ JSON-ответы PDP-страницы деактивированного товара,
чтобы найти, каким эндпоинтом приходят Grower Direct-линии (allStockPdpMap пуст,
а цены на странице есть).

Запуск на VPS: cd /opt/oz-parser && venv/bin/python oz_diag_xhr.py --limit 2
Ничего не пишет в БД.
"""
from __future__ import annotations

import argparse
import asyncio
import json

from oz_price_refresh import Supa, load_env
from oz_diag_lines import select_deactivated
from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"
WAIT_MS = 25_000


async def main(limit: int) -> None:
    load_env()
    supa = Supa()
    targets = select_deactivated(supa, limit)
    dump = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=STATE_FILE)
        for t in targets:
            page = await context.new_page()
            responses = []

            async def on_response(resp, responses=responses):
                if "application/json" not in resp.headers.get("content-type", ""):
                    return
                try:
                    data = await resp.json()
                except Exception:  # noqa: BLE001
                    return
                responses.append({"url": resp.url, "data": data})

            page.on("response", on_response)
            print(f"== #{t['id']} {t['name']}", flush=True)
            try:
                await page.goto(t["source_url"], wait_until="domcontentloaded", timeout=60_000)
                await page.wait_for_timeout(WAIT_MS)
            except Exception as e:  # noqa: BLE001
                print(f"   ERROR {e}", flush=True)
                await page.close()
                continue
            await page.close()

            for r in responses:
                d = r["data"]
                keys = sorted(d.keys()) if isinstance(d, dict) else f"<{type(d).__name__} len={len(d) if hasattr(d, '__len__') else '?'}>"
                print(f"   {r['url'][:130]}\n      keys: {keys}", flush=True)
            dump.append({"id": t["id"], "name": t["name"], "responses": responses})
            print("", flush=True)
        await browser.close()

    with open("/tmp/oz_diag_xhr.json", "w", encoding="utf-8") as f:
        json.dump(dump, f, ensure_ascii=False, indent=1)
    print("Полные ответы: /tmp/oz_diag_xhr.json", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=2)
    asyncio.run(main(ap.parse_args().limit))
