"""
oz_diag_lines.py — разовая диагностика: какие типы линий приходят в allStockPdpMap
у ДЕАКТИВИРОВАННЫХ товаров (is_active=false). Вопрос: теряем ли мы Grower Direct /
VMP-линии (поставка под заказ, цена есть, складского остатка нет)?

Запуск на VPS: cd /opt/oz-parser && venv/bin/python oz_diag_lines.py --limit 8
Ничего не пишет в БД.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random

from oz_price_refresh import Supa, load_env, fetch_availability, AVAIL_WAIT_MS  # noqa: F401
from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"


def select_deactivated(supa: Supa, limit: int):
    path = ("/rest/v1/products?select=id,name,oz_product_code,source_url"
            "&source=eq.oz_catalog&is_active=eq.false&source_url=not.is.null"
            f"&order=id&limit={limit}")
    return supa._req("GET", path) or []


async def main(limit: int) -> None:
    load_env()
    supa = Supa()
    targets = select_deactivated(supa, limit)
    print(f"Деактивированных товаров к проверке: {len(targets)}\n", flush=True)

    raw_dump = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=STATE_FILE)
        for t in targets:
            page = await context.new_page()
            captured = {"payload": None}

            async def on_response(response, captured=captured):
                if captured["payload"] is not None:
                    return
                if "application/json" not in response.headers.get("content-type", ""):
                    return
                try:
                    data = await response.json()
                except Exception:  # noqa: BLE001
                    return
                if isinstance(data, dict) and "allStockPdpMap" in data:
                    captured["payload"] = data

            page.on("response", on_response)
            try:
                await page.goto(t["source_url"], wait_until="domcontentloaded", timeout=60_000)
                waited = 0
                while captured["payload"] is None and waited < AVAIL_WAIT_MS:
                    await page.wait_for_timeout(250)
                    waited += 250
            except Exception as e:  # noqa: BLE001
                print(f"== #{t['id']} {t['name']}: ERROR {e}\n", flush=True)
                await page.close()
                continue
            await page.close()

            payload = captured["payload"]
            print(f"== #{t['id']} {t['name']} ({t['oz_product_code']})", flush=True)
            if payload is None:
                print("   XHR не пришёл\n", flush=True)
                continue
            stock_map = payload.get("allStockPdpMap") or {}
            if not stock_map:
                print(f"   allStockPdpMap ПУСТ; верхние ключи payload: {sorted(payload.keys())}",
                      flush=True)
            for stype, lines in stock_map.items():
                print(f"   тип '{stype}': {len(lines or [])} линий", flush=True)
                for ln in (lines or []):
                    print(
                        "      stems={} addStem={} lowestFromPrice={} incr={} startDate={} hex={}".format(
                            ln.get("totalAvailableStockAmount"),
                            ln.get("additionalStem"),
                            ln.get("lowestFromPrice") or (ln.get("price") or {}).get("lowestFromPrice"),
                            ln.get("incrementalOrderQuantity"),
                            ln.get("startDate"),
                            ln.get("hexValue"),
                        ), flush=True)
            raw_dump.append({"id": t["id"], "name": t["name"], "payload": payload})
            print("", flush=True)
            await asyncio.sleep(random.uniform(1.0, 2.0))
        await browser.close()

    with open("/tmp/oz_diag_raw.json", "w", encoding="utf-8") as f:
        json.dump(raw_dump, f, ensure_ascii=False, indent=1)
    print("Сырые payload: /tmp/oz_diag_raw.json", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=8)
    asyncio.run(main(ap.parse_args().limit))
