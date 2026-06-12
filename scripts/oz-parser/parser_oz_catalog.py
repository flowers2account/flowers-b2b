"""
OZ Export — массовый парсер каталога ПО КАТЕГОРИЯМ (без цен).

Наполняет справочник products карточками OZ с характеристиками (цена/остаток —
из ночного oz_price_refresh.py, не отсюда). Дедуп по oz_product_code, source='oz_catalog'.

VPS-режим (см. docs/OZ_CATALOG_SYNC.md):
  venv/bin/python parser_oz_catalog.py --categories-file categories.txt \
      --skip-done --ingest-after-each

Ключи:
  --categories-file FILE  категории из файла (одна URL на строку, # и пустые — игнор)
  --skip-done             пропускать категории с уже готовым непустым output/<имя>.jsonl
                          (механизм продолжения после обрыва / выхода из окна)
  --ingest-after-each     после каждой допарсенной категории сразу заливать её в БД
                          (oz_catalog_ingest.py) — при обрыве собранное уже в products
  --no-window             игнорировать окно robots.txt и дедлайн (для ручного теста днём)

ROBOTS.TXT OZ:
  Request-rate 1/10 → пауза 8–10 с между товарами.
  Visit-time 00:00–04:00 UTC = 05:00–09:00 Asia/Oral. Дедлайн 08:45 Oral:
  перед каждой категорией и внутри цикла товаров проверяем время; не успеваем →
  НЕ пишем частичный jsonl (чтобы --skip-done переделал категорию начисто),
  корректно выходим, продолжение следующей ночью.

ЗАЩИТЫ:
  * Проверка сессии на старте: нет признаков B2B-логина (юнит KZ-CVET) → СТОП +
    WhatsApp «сессия протухла». Без логина OZ отдаёт усечённый ассортимент.
  * URL категории 404/пусто → output/_bad_urls.txt + WhatsApp ⚠, идём дальше.
  * Исключение в категории → output/_failed.txt + WhatsApp ⚠, второй проход в конце.
"""
import argparse
import asyncio
import html as _html
import json
import random
import re
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

# WhatsApp/окно переиспользуем из ценового парсера (один и тот же .env, тот же ORAL_TZ)
from oz_price_refresh import send_whatsapp, load_env, Log, ORAL_TZ, run_deadline
from oz_departure import set_departure_date, is_weekday
from oz_catalog_ingest import Supa

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)
BAD_URLS_FILE = OUTPUT_DIR / "_bad_urls.txt"
FAILED_FILE = OUTPUT_DIR / "_failed.txt"

BASE_URL = "https://www.ozexport.nl"
STATE_FILE = str(BASE_DIR / "oz_state.json")
PAUSE_RANGE_S = (8.0, 10.0)        # robots.txt Request-rate 1/10

# ─── Словари нормализации (единые с oz_ingest.py) ──────────────────────────────
COUNTRY_ISO = {
    "netherlands": "NL", "holland": "NL", "ecuador": "EC", "kenya": "KE",
    "colombia": "CO", "ethiopia": "ET", "israel": "IL", "italy": "IT",
    "spain": "ES", "france": "FR", "germany": "DE", "belgium": "BE",
    "denmark": "DK", "china": "CN", "turkey": "TR", "zimbabwe": "ZW",
    "tanzania": "TZ", "uganda": "UG", "portugal": "PT", "poland": "PL",
}
COLOR_CANON = {
    "bicolour": "bicolor", "tricolour": "tricolor", "multicolour": "multicolor",
    "mix": "multicolor", "mixed": "multicolor", "assorted": "multicolor",
    "grey": "silver", "gray": "silver",
}


class DeadlineReached(Exception):
    """Достигнут дедлайн окна robots.txt — выходим, не записав частичную категорию."""


def parse_categories(input_str: str):
    categories = []
    for line in input_str.strip().split(","):
        line = line.strip()
        if not line:
            continue
        m = re.search(r"/([^/]+)/c/([^/]+)$", line)
        if m:
            categories.append((m.group(1), m.group(2), line))
    return categories


def _oz_code_from_url(url: str):
    m = re.search(r"/p/([A-F0-9]{16,40})", url, re.I)
    return m.group(1).upper() if m else None


def _fix_mojibake(s):
    if not s:
        return s
    if any(mark in s for mark in ("Ã", "â€", "Â", "�")):
        try:
            return s.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def _clean_text(s):
    if not s:
        return s
    s = _html.unescape(s)
    s = _fix_mojibake(s)
    return re.sub(r"\s+", " ", s).strip()


def _norm_color(value: str):
    if not value:
        return None
    c = re.sub(r"[\s/]+", "_", _clean_text(value).lower())
    return COLOR_CANON.get(c, c)


def _first_int(value: str):
    if not value:
        return None
    m = re.search(r"(\d+)", value)
    return int(m.group(1)) if m else None


def _parse_attr_pairs_from_html(html_text: str) -> dict:
    pairs = {}
    for m in re.finditer(r'<td class="attrib">(.*?)</td>\s*<td>(.*?)</td>', html_text, re.S):
        label = _clean_text(re.sub("<.*?>", "", m.group(1))).lower()
        val = _clean_text(re.sub("<.*?>", "", m.group(2)))
        if label and val:
            pairs.setdefault(label, val)
    for m in re.finditer(
        r'pdp_product_attributes_label">(.*?)</div>\s*'
        r'<div class="pdp_product_attributes_value">(.*?)</div>', html_text, re.S):
        label = _clean_text(re.sub("<.*?>", "", m.group(1))).lower()
        val = _clean_text(re.sub("<.*?>", "", m.group(2)))
        if label and val:
            pairs.setdefault(label, val)
    return pairs


def _extract_attributes(html_text: str) -> dict:
    pairs = _parse_attr_pairs_from_html(html_text)

    def find(*keys):
        for k in pairs:
            for key in keys:
                if key in k:
                    return pairs[k]
        return None

    country = find("страна происхождения", "country of origin")
    country_iso = COUNTRY_ISO.get(country.strip().lower()) if country else None
    color = _norm_color(find("основной цвет", "main colour", "main color"))
    stems = _first_int(find("number of stems per bunch", "stems per bunch", "стеблей в пучке"))

    return {
        "length_cm": _first_int(find("length of flower stem", "длина стебля", "длина")),
        "colors": [color] if color else None,
        "country_iso": country_iso,
        "country_raw": country,
        "farm": find("садовод", "grower", "marketing concept"),
        "stems_per_pack": stems,
        "pack_size": stems,
        "container_code": find("упаковочная unit", "packaging unit"),
        "weight_gram": _first_int(find("weight (average)", "weight", "вес")),
        "quality_grade": find("группа качества", "quality group", "качества"),
    }


async def parse_product_details(page, product_url: str, _retry=True) -> dict:
    try:
        await page.goto(product_url, wait_until="domcontentloaded", timeout=60000)
        try:
            await page.wait_for_selector('meta[property="og:title"], span.name, h1', timeout=3000)
        except Exception:
            pass
        await page.wait_for_timeout(300)

        result = {"oz_product_code": _oz_code_from_url(product_url)}
        name = None
        el = await page.query_selector('meta[property="og:title"]')
        if el:
            name = await el.get_attribute("content")
        if not name:
            el = await page.query_selector("span.name")
            if el:
                name = (await el.text_content() or "").strip()
        if not name:
            el = await page.query_selector("h1")
            if el:
                name = (await el.text_content() or "").strip()

        image = None
        el = await page.query_selector('meta[property="og:image"]')
        if el:
            image = await el.get_attribute("content")

        html_text = await page.content()
        attrs = _extract_attributes(html_text)
        attrs_empty = not any(v is not None for k, v in attrs.items() if k not in ("country_raw",))
        if (not name or attrs_empty) and _retry:
            await page.wait_for_timeout(800)
            return await parse_product_details(page, product_url, _retry=False)

        result["name"] = _clean_text(name) if name else name
        if image:
            result["image_url"] = image
        result.update({k: v for k, v in attrs.items() if v is not None})
        return result
    except Exception:
        return {"oz_product_code": _oz_code_from_url(product_url)}


async def _collect_links_on_current_page(list_page) -> list:
    stable = 0
    last_count = -1
    for _ in range(80):
        await list_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(0.6)
        cnt = len(await list_page.query_selector_all("a[href*='/p/']"))
        if cnt == last_count:
            stable += 1
            if stable >= 4:
                break
        else:
            stable = 0
            last_count = cnt
    return await list_page.query_selector_all("a[href*='/p/']")


async def _collect_category_urls(list_page, cat_url: str) -> list:
    """Все ссылки /p/ категории через пагинацию SAP Commerce. Дедуп по коду."""
    seen = set()
    all_urls = []
    page_num = 0
    while True:
        if page_num == 0:
            page_url = cat_url
        else:
            sep = "&" if "?" in cat_url else "?"
            if "q=" in cat_url:
                page_url = f"{cat_url}{sep}page={page_num}"
            else:
                page_url = f"{cat_url}{sep}q=:relevance&page={page_num}"
        await list_page.goto(page_url, wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(1)
        links = await _collect_links_on_current_page(list_page)
        new_on_page = 0
        for link in links:
            href = await link.get_attribute("href")
            if not href:
                continue
            full = href if href.startswith("http") else BASE_URL + href
            code = _oz_code_from_url(full)
            if not code or code in seen:
                continue
            seen.add(code)
            all_urls.append(full)
            new_on_page += 1
        print(f"      стр.{page_num + 1}: +{new_on_page} новых (всего {len(all_urls)})", flush=True)
        if new_on_page == 0:
            break
        page_num += 1
        if page_num > 80:
            break
    return all_urls


async def parse_category(list_page, detail_page, cat_name, cat_url, log, deadline, use_window):
    """Категория → jsonl. Возвращает ('ok', n) | ('empty', 0) | бросает DeadlineReached.
    jsonl пишется ТОЛЬКО при полном проходе (для безопасного --skip-done)."""
    log.line(f"  📂 {cat_name}: собираю ссылки…")
    all_urls = await _collect_category_urls(list_page, cat_url)
    if not all_urls:
        return ("empty", 0)

    log.line(f"  📂 {cat_name}: {len(all_urls)} карточек, парсю…")
    products = []
    for i, full_url in enumerate(all_urls, 1):
        if use_window and datetime.now(ORAL_TZ) >= deadline:
            raise DeadlineReached(cat_name)
        details = await parse_product_details(detail_page, full_url)
        if not details.get("oz_product_code"):
            continue
        products.append({
            "url": full_url,
            "category_oz": cat_name,
            "category": "cut",
            "source": "oz_catalog",
            "_parsed_at": datetime.now().isoformat(),
            **details,
        })
        if i % 25 == 0 or i == len(all_urls):
            log.line(f"      [{i}/{len(all_urls)}] {(details.get('name') or '?')[:30]}")
        await asyncio.sleep(random.uniform(*PAUSE_RANGE_S))

    filename = OUTPUT_DIR / f"{cat_name}.jsonl"
    with filename.open("w", encoding="utf-8") as f:
        for p in products:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
    log.line(f"  ✓ {cat_name}: {len(products)} спарсено")
    return ("ok", len(products))


def run_ingest(cat_name: str, log, departure_date: str) -> tuple[str, int, int]:
    """Заливает output/<cat>.jsonl в БД с меткой даты. Возвращает (строка, new, updated)."""
    jsonl = OUTPUT_DIR / f"{cat_name}.jsonl"
    if not jsonl.exists() or jsonl.stat().st_size == 0:
        return ("залито: нечего (пусто)", 0, 0)
    try:
        proc = subprocess.run(
            [sys.executable, str(BASE_DIR / "oz_catalog_ingest.py"),
             "--departure-date", departure_date, str(jsonl)],
            capture_output=True, text=True, timeout=600, cwd=str(BASE_DIR))
        out = proc.stdout.strip()
        for line in reversed(out.splitlines()):
            if line.startswith("RESULT "):
                kv = dict(p.split("=", 1) for p in line[len("RESULT "):].split() if "=" in p)
                new = int(kv.get("new", 0) or 0)
                upd = int(kv.get("updated", 0) or 0)
                extra = f", ⚠ новые subcat: {kv['new_subcats']}" if kv.get("new_subcats") else ""
                return (f"залито: +{new} новых, ~{upd} обновлено{extra}", new, upd)
        if proc.returncode != 0:
            log.line(f"    ingest stderr: {proc.stderr[:200]}")
            return ("залито: ошибка ingest (см. лог)", 0, 0)
        return ("залито: итог не распознан", 0, 0)
    except Exception as e:  # noqa: BLE001
        log.line(f"    ingest exception: {e}")
        return (f"залито: исключение ({e})", 0, 0)


def _remaining_str(names: list[str]) -> str:
    if not names:
        return ""
    head = names[:10]
    tail = f" и ещё {len(names) - 10}" if len(names) > 10 else ""
    return f"Осталось ({len(names)}): " + ", ".join(head) + tail


async def check_session(context, log) -> bool:
    """Признаки залогиненной B2B-сессии (юнит KZ-CVET). Без логина OZ режет ассортимент."""
    page = await context.new_page()
    try:
        await page.goto(f"{BASE_URL}/ozexport/ru/EUR/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2500)
        html = await page.content()
    except Exception as e:  # noqa: BLE001
        log.line(f"  проверка сессии: страница не открылась — {e}")
        await page.close()
        return False
    await page.close()
    markers = ["KZ-CVET", 'selectedCustomerUnitName', "/logout", "updateUserLoggedInToFalse",
               "Мой аккаунт", "My Account", "Sign out", "Выход"]
    hits = [m for m in markers if m in html]
    # признак НЕзалогиненности: форма входа на главной
    login_page = ("j_username" in html or "login.login" in html) and "KZ-CVET" not in html
    log.line(f"  проверка сессии: маркеры={hits or 'нет'} login_page={login_page}")
    return bool(hits) and not login_page


def _load_categories_file(path: Path) -> list:
    result = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        result.extend(parse_categories(line))
    return result


async def process_pass(categories, list_page, detail_page, log, deadline, use_window,
                       do_ingest, skip_done, stats, departure_date, idx_offset=0, total=None):
    """Один проход по списку категорий. Возвращает список упавших имён (для второго прохода)."""
    failed = []
    total = total or len(categories)
    for i, (cat_name, _code, cat_url) in enumerate(categories, 1):
        idx = idx_offset + i
        out_file = OUTPUT_DIR / f"{cat_name}.jsonl"
        if skip_done and out_file.exists() and out_file.stat().st_size > 0:
            # парсинг пропускаем, но заливку — НЕТ (idempotent upsert догонит БД)
            if do_ingest:
                msg, n_new, n_upd = run_ingest(cat_name, log, departure_date)
                stats["new"] += n_new
                stats["updated"] += n_upd
                log.line(f"[{idx}/{total}] ⏭ {cat_name} — jsonl есть, парсинг пропущен; {msg}")
                remaining = [c[0] for c in categories[i:]]
                send_whatsapp(f"[{idx}/{total}] {cat_name} ⏭ (jsonl уже есть) {msg}\n"
                              f"{_remaining_str(remaining)}", log)
            else:
                log.line(f"[{idx}/{total}] ⏭ {cat_name} — уже есть, пропускаю")
            stats["done"] += 1
            continue
        if use_window and datetime.now(ORAL_TZ) >= deadline:
            remaining = [c[0] for c in categories[i - 1:]]
            log.line(f"⏰ Дедлайн {deadline.strftime('%H:%M')} Oral — стоп на {cat_name}.")
            send_whatsapp(
                f"⏰ OZ-каталог: остановился на «{cat_name}» (окно robots.txt до 09:00 Oral). "
                f"Продолжу следующей ночью.\n{_remaining_str(remaining)}", log)
            raise DeadlineReached(cat_name)

        log.line(f"\n[{idx}/{total}] {cat_name}")
        try:
            status, n = await parse_category(list_page, detail_page, cat_name, cat_url,
                                             log, deadline, use_window)
        except DeadlineReached:
            remaining = [c[0] for c in categories[i - 1:]]
            log.line(f"⏰ Дедлайн внутри «{cat_name}» — частичный jsonl не пишу, стоп.")
            send_whatsapp(
                f"⏰ OZ-каталог: дедлайн внутри «{cat_name}» (не успел до 09:00 Oral, "
                f"переделаю начисто). Продолжу следующей ночью.\n{_remaining_str(remaining)}", log)
            raise
        except Exception as e:  # noqa: BLE001
            log.line(f"  ✗ Ошибка {cat_name}: {e}")
            with FAILED_FILE.open("a", encoding="utf-8") as f:
                f.write(cat_url + "\n")
            failed.append((cat_name, _code, cat_url))
            send_whatsapp(f"⚠ OZ-каталог [{idx}/{total}] «{cat_name}»: ошибка, повторю в конце.\n{e}", log)
            continue

        if status == "empty":
            log.line(f"  ⚠ {cat_name}: 0 товаров / URL не открылся")
            with BAD_URLS_FILE.open("a", encoding="utf-8") as f:
                f.write(cat_url + "\n")
            send_whatsapp(f"⚠ OZ-каталог [{idx}/{total}] «{cat_name}»: URL пуст/не открылся, пропускаю.", log)
            stats["done"] += 1
            continue

        stats["parsed"] += n
        stats["done"] += 1
        if do_ingest:
            ing, n_new, n_upd = run_ingest(cat_name, log, departure_date)
            stats["new"] += n_new
            stats["updated"] += n_upd
        else:
            ing = "ingest выключен"
        remaining = [c[0] for c in categories[i:]]
        send_whatsapp(f"[{idx}/{total}] {cat_name} ✓ спарсено {n}, {ing}\n{_remaining_str(remaining)}", log)
    return failed


async def main():
    ap = argparse.ArgumentParser(description="OZ Export — парсер каталога")
    ap.add_argument("-f", "--categories-file", metavar="FILE")
    ap.add_argument("--skip-done", action="store_true")
    ap.add_argument("--ingest-after-each", action="store_true")
    ap.add_argument("--ignore-window", "--no-window", dest="ignore_window", action="store_true",
                    help="игнорировать окно Visit-time и дедлайн 08:45 Oral (пауза 8-10с сохраняется)")
    args = ap.parse_args()

    load_env()
    log = Log()
    use_window = not args.ignore_window

    cat_path = Path(args.categories_file) if args.categories_file else (BASE_DIR / "categories.txt")
    if not cat_path.exists():
        log.line(f"❌ Файл категорий не найден: {cat_path}")
        return 1
    categories = _load_categories_file(cat_path)
    if not categories:
        log.line("❌ Категории не распознаны (формат .../c/КОД)")
        return 1

    total = len(categories)
    started = datetime.now(ORAL_TZ)
    deadline = run_deadline(started)
    log.line("=" * 70)
    log.line(f"🌸 OZ-каталог: категорий {total} | старт {started.strftime('%d.%m %H:%M')} Oral"
             + (f" | дедлайн {deadline.strftime('%H:%M')} Oral" if use_window else " | окно ВЫКЛ"))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        if not Path(STATE_FILE).exists():
            log.line(f"СТОП: нет {STATE_FILE} — залей сессию (oz_login.py → scp).")
            send_whatsapp("⛔ OZ-каталог: нет oz_state.json на VPS, парсинг не начат.", log)
            await browser.close()
            return 1
        context = await browser.new_context(storage_state=STATE_FILE)

        # проверка сессии ДО парсинга
        if not await check_session(context, log):
            log.line("СТОП: сессия не выглядит залогиненной (нет признаков юнита KZ-CVET).")
            send_whatsapp(
                "⛔ OZ-каталог: сессия протухла (нет B2B-логина). Обнови oz_state.json: "
                "на десктопе oz_login.py → scp на VPS. Парсинг НЕ начат "
                "(без логина OZ отдаёт усечённый ассортимент).", log)
            await browser.close()
            return 2
        log.line("  ✓ сессия залогинена")

        # ── дата вылета: читаем из app_settings, ставим в сессии, проверяем ──────
        try:
            departure_date = Supa().get_setting("oz_target_departure_date")
        except Exception as e:  # noqa: BLE001
            log.line(f"СТОП: не прочитать oz_target_departure_date — {e}")
            send_whatsapp(f"⛔ OZ-каталог: не прочитать дату вылета из app_settings — {e}", log)
            await browser.close()
            return 1
        if not departure_date or not is_weekday(departure_date):
            log.line(f"СТОП: дата вылета '{departure_date}' пуста/выходной — OZ принимает только будни.")
            send_whatsapp(
                f"⛔ OZ-каталог: дата вылета '{departure_date}' невалидна (пусто/выходной). "
                "Поправь app_settings.oz_target_departure_date на будний день.", log)
            await browser.close()
            return 1
        ok, shown = await set_departure_date(context, departure_date)
        if not ok:
            log.line(f"СТОП: дата вылета не применилась ({shown}).")
            send_whatsapp(
                f"⛔ OZ-каталог: не удалось выставить дату вылета {departure_date} в сессии "
                f"({shown}). Парсинг НЕ начат, иначе соберём дефолтную дату как мусор.", log)
            await browser.close()
            return 3
        log.line(f"  ✓ дата вылета установлена: {departure_date} (поле: {shown})")

        list_page = await context.new_page()
        detail_page = await context.new_page()

        async def _block(route):
            if route.request.resource_type in ("image", "font", "media"):
                await route.abort()
            else:
                await route.continue_()
        await list_page.route("**/*", _block)
        await detail_page.route("**/*", _block)

        stats = {"parsed": 0, "done": 0, "new": 0, "updated": 0}
        # стартуем с чистого _failed.txt (накопим заново за этот прогон)
        if FAILED_FILE.exists():
            FAILED_FILE.unlink()

        stopped = False
        try:
            failed = await process_pass(categories, list_page, detail_page, log, deadline,
                                        use_window, args.ingest_after_each, args.skip_done,
                                        stats, departure_date, total=total)
            # второй проход — один повтор упавших
            if failed:
                log.line(f"\n🔁 Второй проход по упавшим: {len(failed)}")
                still = await process_pass(failed, list_page, detail_page, log, deadline,
                                           use_window, args.ingest_after_each, False,
                                           stats, departure_date, total=len(failed))
                if still:
                    names = ", ".join(c[0] for c in still)
                    log.line(f"❌ Не справился после повтора: {names}")
                    send_whatsapp(f"❌ OZ-каталог: не спарсились после повтора: {names}", log)
        except DeadlineReached:
            stopped = True

        await browser.close()

    # финальный итог — только если прошли всё без выхода по дедлайну
    if not stopped:
        bad = BAD_URLS_FILE.read_text(encoding="utf-8").strip().splitlines() if BAD_URLS_FILE.exists() else []
        fail = FAILED_FILE.read_text(encoding="utf-8").strip().splitlines() if FAILED_FILE.exists() else []
        finished = datetime.now(ORAL_TZ)
        summary = (f"✅ OZ-каталог: проход завершён, обработано {stats['done']}/{total} категорий, "
                   f"спарсено {stats['parsed']} карточек, залито +{stats['new']} новых / "
                   f"~{stats['updated']} обновлено на дату {departure_date} "
                   f"({started.strftime('%H:%M')}–{finished.strftime('%H:%M')} Oral).")
        if bad:
            summary += f"\nПлохие URL ({len(bad)}): см. output/_bad_urls.txt"
        if fail:
            summary += f"\nНе спарсились ({len(fail)}): см. output/_failed.txt"
        log.line("\n" + summary)
        send_whatsapp(summary, log)

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
