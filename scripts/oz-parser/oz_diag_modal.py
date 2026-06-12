"""
oz_diag_modal.py — проверка гипотезы: после выбора даты вылета (модалка colorbox
на PDP) availability-XHR возвращает Grower Direct-линии для товаров, у которых
без даты allStockPdpMap пуст.

Запуск на VPS: cd /opt/oz-parser && venv/bin/python oz_diag_modal.py --limit 3
"""
from __future__ import annotations

import argparse
import asyncio
import json

from oz_price_refresh import Supa, load_env
from oz_diag_lines import select_deactivated
from playwright.async_api import async_playwright

STATE_FILE = "oz_state.json"


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
            payloads = []

            async def on_response(resp, payloads=payloads):
                if "stockLines/availability" not in resp.url:
                    return
                try:
                    payloads.append(await resp.json())
                except Exception:  # noqa: BLE001
                    pass

            page.on("response", on_response)
            print(f"== #{t['id']} {t['name']}", flush=True)
            try:
                await page.goto(t["source_url"], wait_until="domcontentloaded", timeout=60_000)
                await page.wait_for_timeout(8_000)

                modal = page.locator("#colorbox .choose_date_popup")
                if await modal.count() > 0 and await modal.is_visible():
                    print("   модалка даты ОТКРЫТА", flush=True)
                    n_before = len(payloads)
                    # 1) галка «автоматически выберите день»
                    cb = modal.locator("input.facet-checkbox")
                    if await cb.count() > 0:
                        await cb.first.check(force=True)
                        await page.wait_for_timeout(4_000)
                        print(f"   после галки: XHR={len(payloads) - n_before}, "
                              f"модалка видима={await modal.is_visible()}", flush=True)
                    # 2) если модалка ещё открыта — кликаем первый доступный день
                    if await modal.is_visible():
                        day = page.locator(
                            "#colorbox td.day:not(.disabled):not(.old):not(.new)")
                        if await day.count() > 0:
                            await day.first.click()
                            await page.wait_for_timeout(5_000)
                            print(f"   после клика по дню: XHR={len(payloads) - n_before}, "
                                  f"модалка видима={await modal.is_visible()}", flush=True)
                    await page.screenshot(path=f"/tmp/oz_modal_{t['id']}.png", full_page=False)
                else:
                    print("   модалки нет", flush=True)
                await page.wait_for_timeout(8_000)
            except Exception as e:  # noqa: BLE001
                print(f"   ERROR {e}", flush=True)
                await page.close()
                continue

            for k, pl in enumerate(payloads):
                m = pl.get("allStockPdpMap") or {}
                types = {st: len(lines or []) for st, lines in m.items()}
                print(f"   XHR#{k}: типы линий = {types or 'ПУСТО'}"
                      f" noOfPricesShown={pl.get('noOfPricesShown')}", flush=True)
            dump.append({"id": t["id"], "name": t["name"], "payloads": payloads})
            await page.close()
            print("", flush=True)
        await browser.close()

    with open("/tmp/oz_diag_modal.json", "w", encoding="utf-8") as f:
        json.dump(dump, f, ensure_ascii=False, indent=1)
    print("Payload-ы: /tmp/oz_diag_modal.json; скрины: /tmp/oz_modal_<id>.png", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=3)
    asyncio.run(main(ap.parse_args().limit))
