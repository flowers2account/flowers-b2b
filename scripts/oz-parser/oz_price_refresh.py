"""
oz_price_refresh.py — серверное обновление цен/остатков OZ для предзаказной полки.

Живёт на VPS в /opt/oz-parser. Раз в сутки (systemd timer) проходит по всем
карточкам products WHERE source='oz_catalog' AND source_url IS NOT NULL:
открывает страницу товара (Playwright headless, сессия oz_state.json),
перехватывает XHR с ключом allStockPdpMap (единственный источник цены/остатка),
нормализует через oz_normalize.normalize_availability и апсертит:

  есть доступность -> qty=стебли, oz_purchase_eur=min €/стебель,
                      price=calc_preorder_price_kzt (RPC, курс/наценка из app_settings),
                      is_active=true, oz_stock_updated_at=now()
  XHR пришёл, но пусто -> qty=0, is_active=false, oz_stock_updated_at=now()

ROBOTS.TXT OZ (https://www.ozexport.nl/robots.txt):
  * Request-rate 1/10 -> пауза 8-10 с между товарами (PAUSE_RANGE_S)
  * Visit-time 00:00-04:00 UTC (05:00-09:00 Oral) -> таймер 05:05 Oral,
    дедлайн 08:45 Oral: не успели -> стоп, хвост уходит на следующую ночь
    (порядок обхода: несвежие первыми, см. select_targets)

ДАТА ВЫЛЕТА (синхрон с каталогом, 12.06.2026):
  В начале прогона читаем app_settings.oz_target_departure_date и ставим её в сессии
  через set_departure_date() (та же, что у каталожного парсера). Все availability и
  деактивации считаются на эту дату — каталог и цены консистентны. Дата не применилась
  -> СТОП + алерт, цены НЕ трогаем (иначе перезаписали бы дефолтной датой = ложные
  деактивации). Только будни (OZ режет выходные).

КРИТИЧНЫЕ ЗАЩИТЫ:
  * Протухшая сессия != нет товара: NO_XHR_STOP_AFTER товаров подряд без XHR ->
    СТОП + WhatsApp-алерт, БЕЗ деактивации (иначе мёртвая сессия за ночь
    погасит весь каталог). Деактивация — ТОЛЬКО когда XHR пришёл и в нём пусто.
  * Все записи строго WHERE source='oz_catalog' (uralsk_site/1С/waterdrinker не трогаем).

ФАЗА НАПОЛНЕНИЯ (deactivate-toggle, 14.06.2026):
  app_settings.oz_price_deactivate_enabled управляет тем, гасить ли карточки,
  пустые на целевую дату. По умолчанию (ключ отсутствует / != 'true') деактивация
  ВЫКЛЮЧЕНА: каталог собран как справочник (~5158 карточек), сток на ближайшую
  дату ~20%, и слепая деактивация погасила бы ~80% витрины. Пока цены наполняются,
  пустые карточки оставляем как есть (заглушку 999 не трогаем, is_active не трогаем).
  Когда наполнение закончено и нужна честная деактивация распроданного — ставим
  oz_price_deactivate_enabled='true'. Реальная цена -> hidden_for_demo=false
  (карточка показывается на витрине; стаб 999 скрыт, см. /product/[id]).

Запуск:
  python oz_price_refresh.py                 # полный прогон
  python oz_price_refresh.py --limit 30      # первые N товаров (ручной тест)
  python oz_price_refresh.py --dry-run       # без записи в БД и без WhatsApp

Env (/opt/oz-parser/.env, chmod 600):
  SUPABASE_URL, SUPABASE_SERVICE_KEY            — запись в products (обходит RLS)
  UMNICO_API_TOKEN, UMNICO_WHATSAPP_SA_ID,
  UMNICO_MANAGER_PHONE                          — итог/алерты в WhatsApp (опционально)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

from oz_normalize import normalize_availability
from oz_departure import set_departure_date, is_weekday

BASE_DIR = Path(__file__).resolve().parent
STATE_FILE = BASE_DIR / "oz_state.json"
ENV_FILE = BASE_DIR / ".env"
LOG_DIR = Path("/var/log/oz-price-refresh")

NAV_TIMEOUT_MS = 60_000
AVAIL_WAIT_MS = 20_000        # ожидание XHR allStockPdpMap (как в oz_ingest)
NO_XHR_STOP_AFTER = 10        # N подряд без XHR -> стоп (протухла сессия)
# robots.txt OZ: Request-rate 1/10 — не чаще страницы раз в 10 секунд
PAUSE_RANGE_S = (8.0, 10.0)   # пауза между товарами

ORAL_TZ = timezone(timedelta(hours=5))  # Asia/Oral, UTC+5, без DST

# robots.txt OZ: Visit-time 00:00–04:00 UTC = 05:00–09:00 Asia/Oral.
# Стоп с запасом в 08:45 Oral: текущий товар дообрабатываем, остаток — следующей ночью.
DEADLINE_ORAL = (8, 45)


def run_deadline(start: datetime) -> datetime:
    """08:45 Oral того же дня; если старт позже (ручной дневной запуск) — следующего."""
    d = start.astimezone(ORAL_TZ).replace(
        hour=DEADLINE_ORAL[0], minute=DEADLINE_ORAL[1], second=0, microsecond=0)
    return d + timedelta(days=1) if start >= d else d


# ── env / лог ────────────────────────────────────────────────────────────────

def load_env() -> None:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


class Log:
    def __init__(self) -> None:
        self.path = None
        try:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            self.path = LOG_DIR / (datetime.now(ORAL_TZ).strftime("%Y-%m-%d") + ".log")
        except PermissionError:
            pass  # локальный запуск без /var/log — пишем только в stdout

    def line(self, msg: str) -> None:
        stamp = datetime.now(ORAL_TZ).strftime("%H:%M:%S")
        text = f"[{stamp}] {msg}"
        print(text, flush=True)
        if self.path:
            with self.path.open("a", encoding="utf-8") as f:
                f.write(text + "\n")


# ── Supabase REST (urllib, без зависимостей) ─────────────────────────────────

class Supa:
    def __init__(self) -> None:
        self.base = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        self.key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not self.base or not self.key:
            raise SystemExit("Нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env")
        self.base = self.base.rstrip("/")

    def _req(self, method: str, path: str, body=None, headers=None):
        h = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if headers:
            h.update(headers)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None

    def select_targets(self):
        """Все oz_catalog с URL — пагинация (PostgREST max_rows=1000).

        Порядок: самые несвежие первыми (NULLS FIRST) — если прошлый прогон
        упёрся в дедлайн окна robots.txt, его хвост обработается первым.
        """
        out = []
        page = 1000
        offset = 0
        while True:
            path = ("/rest/v1/products?select=id,oz_product_code,source_url"
                    "&source=eq.oz_catalog&source_url=not.is.null"
                    "&order=oz_stock_updated_at.asc.nullsfirst,id.asc"
                    f"&limit={page}&offset={offset}")
            chunk = self._req("GET", path) or []
            out.extend(chunk)
            if len(chunk) < page:
                break
            offset += page
        return out

    def settings(self) -> dict:
        rows = self._req(
            "GET",
            "/rest/v1/app_settings?select=key,value&key=in."
            "(preorder_markup_percent,preorder_eur_kzt_rate,preorder_round_to,"
            "oz_target_departure_date,oz_price_deactivate_enabled)",
        ) or []
        return {r["key"]: r["value"] for r in rows}

    def calc_price_kzt(self, eur: float, markup: str, rate: str, round_to: str):
        return self._req("POST", "/rest/v1/rpc/calc_preorder_price_kzt", {
            "purchase_eur": eur,
            "markup_pct": float(markup),
            "rate": float(rate),
            "round_to": float(round_to or 1),
        })

    def update_product(self, oz_code: str, payload: dict) -> None:
        # строго source=oz_catalog — спот/1С/waterdrinker не трогаем
        path = (f"/rest/v1/products?oz_product_code=eq.{urllib.parse.quote(oz_code)}"
                "&source=eq.oz_catalog")
        self._req("PATCH", path, payload, headers={"Prefer": "return=minimal"})


# ── WhatsApp (Umnico) ────────────────────────────────────────────────────────

def send_whatsapp(text: str, log: Log) -> None:
    token = os.environ.get("UMNICO_API_TOKEN")
    sa_id = os.environ.get("UMNICO_WHATSAPP_SA_ID")
    phone = os.environ.get("UMNICO_MANAGER_PHONE")
    if not (token and sa_id and phone):
        log.line("WhatsApp: UMNICO_* не настроены — пропускаю")
        return
    body = json.dumps({
        "message": {"text": text},
        "destination": "".join(ch for ch in phone if ch.isdigit()),
        "saId": int(sa_id),
    }).encode()
    req = urllib.request.Request(
        "https://api.umnico.com/v1.3/messaging/post", data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
            log.line("WhatsApp: итог отправлен")
    except Exception as e:  # noqa: BLE001 — алерт не должен ронять прогон
        log.line(f"WhatsApp: ошибка отправки — {e}")


# ── перехват XHR (логика oz_ingest.ingest_url, без meta-скрейпа) ─────────────

async def fetch_availability(context, url: str) -> dict:
    """-> {status: ok|no_stock_lines|no_availability_xhr|error, lines: [...]}"""
    page = await context.new_page()
    captured = {"payload": None}

    async def on_response(response):
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
        await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        waited = 0
        while captured["payload"] is None and waited < AVAIL_WAIT_MS:
            await page.wait_for_timeout(250)
            waited += 250
        payload = captured["payload"]
        if payload is None:
            return {"status": "no_availability_xhr", "lines": []}
        norm = normalize_availability(payload)
        return {
            "status": "ok" if norm["lines"] else "no_stock_lines",
            "lines": norm["lines"],
        }
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": str(e), "lines": []}
    finally:
        await page.close()


def summarize_lines(lines: list) -> tuple[int, float | None]:
    """Суммарная доступность в стеблях + минимальная закупка €/стебель по линиям."""
    total_stems = sum(int(l.get("available_stems") or 0) for l in lines)
    prices = [
        l["price_per_stem"] for l in lines
        if l.get("price_per_stem") is not None
        and (l.get("currency") in (None, "EUR"))     # OZ работает в евро; None = голое число
    ]
    return total_stems, (min(prices) if prices else None)


# ── основной прогон ──────────────────────────────────────────────────────────

async def run(limit: int | None, dry_run: bool) -> int:
    log = Log()
    load_env()
    supa = Supa()

    if not STATE_FILE.exists():
        log.line(f"СТОП: нет {STATE_FILE} — залей сессию (см. docs/OZ_PRICE_REFRESH.md)")
        return 1

    settings = supa.settings()
    markup = settings.get("preorder_markup_percent", "35")
    rate = settings.get("preorder_eur_kzt_rate", "525")
    round_to = settings.get("preorder_round_to", "1")
    # Фаза наполнения: пустые на целевую дату карточки НЕ гасим, пока ключ != 'true'.
    deactivate_enabled = settings.get("oz_price_deactivate_enabled") == "true"
    log.line(f"Настройки: наценка {markup}% | курс {rate} ₸/€ | округление {round_to}")
    log.line("Деактивация пустых: " + (
        "ВКЛ — пустые на дату гашу (is_active=false)" if deactivate_enabled
        else "ВЫКЛ (фаза наполнения) — пустые на дату НЕ трогаю"))

    targets = supa.select_targets()
    if limit:
        targets = targets[:limit]
    log.line(f"Товаров к обработке: {len(targets)}" + (" [DRY-RUN]" if dry_run else ""))

    stats = {"total": len(targets), "updated": 0, "deactivated": 0, "empty_kept": 0,
             "no_xhr": 0, "errors": 0, "no_price": 0}
    consecutive_no_xhr = 0
    session_dead = False
    deadline_left = 0   # сколько товаров не успели до дедлайна
    t0 = time.monotonic()
    started_at = datetime.now(ORAL_TZ)
    deadline = run_deadline(started_at)
    log.line(f"Старт прогона: {started_at.strftime('%d.%m %H:%M')} Oral | "
             f"дедлайн окна robots.txt: {deadline.strftime('%d.%m %H:%M')} Oral")
    now_iso = lambda: datetime.now(timezone.utc).isoformat()  # noqa: E731

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=str(STATE_FILE))

        # ── дата вылета: цены/наличие считаем на ту же дату, что собран каталог ──
        # (иначе availability вернёт дефолтную дату → ложные деактивации, как было)
        target_date = settings.get("oz_target_departure_date")
        if not target_date or not is_weekday(target_date):
            log.line(f"СТОП: дата вылета '{target_date}' пуста/выходной — цены НЕ обновляю.")
            if not dry_run:
                send_whatsapp(
                    f"⛔ OZ-цены: дата вылета '{target_date}' невалидна (пусто/выходной). "
                    "Цены НЕ обновлены. Поправь app_settings.oz_target_departure_date на будний день.", log)
            await browser.close()
            return 2
        ok, shown = await set_departure_date(context, target_date)
        if not ok:
            log.line(f"СТОП: дата вылета не применилась ({shown}) — цены НЕ обновляю "
                     "(иначе перезаписал бы дефолтной датой).")
            if not dry_run:
                send_whatsapp(
                    f"⛔ OZ-цены: не удалось выставить дату {target_date} в сессии ({shown}). "
                    "Цены НЕ обновлены. Обнови oz_state.json (oz_login.py → scp).", log)
            await browser.close()
            return 2
        log.line(f"  ✓ дата вылета установлена: {target_date} (поле: {shown}) — "
                 "availability и деактивация считаются на неё")

        for i, t in enumerate(targets, 1):
            # окно robots.txt (00:00–04:00 UTC): рискуем вылезти за 08:45 Oral ->
            # корректно завершаемся, остаток дойдёт следующей ночью (Persistent-таймер)
            if datetime.now(ORAL_TZ) >= deadline:
                deadline_left = len(targets) - i + 1
                log.line(f"ДЕДЛАЙН {deadline.strftime('%H:%M')} Oral: останавливаюсь, "
                         f"не успели {deadline_left} товаров — добьём следующей ночью.")
                break
            code, url = t["oz_product_code"], t["source_url"]
            res = await fetch_availability(context, url)
            status = res["status"]

            if status == "no_availability_xhr":
                stats["no_xhr"] += 1
                consecutive_no_xhr += 1
                log.line(f"[{i}/{len(targets)}] NO_XHR        {code} ({consecutive_no_xhr} подряд)")
                if consecutive_no_xhr >= NO_XHR_STOP_AFTER:
                    session_dead = True
                    log.line(f"СТОП: {NO_XHR_STOP_AFTER} товаров подряд без XHR — "
                             "похоже, сессия oz_state.json протухла. Деактивация НЕ выполнялась.")
                    break
            elif status == "error":
                stats["errors"] += 1
                consecutive_no_xhr = 0  # страница не открылась — это не сигнал о сессии
                log.line(f"[{i}/{len(targets)}] ERROR         {code}: {res.get('error', '')[:120]}")
            else:
                consecutive_no_xhr = 0
                stems, min_eur = summarize_lines(res["lines"])
                if stems > 0:
                    payload = {
                        "qty": stems,
                        "is_active": True,
                        "oz_stock_updated_at": now_iso(),
                    }
                    # реальные stock-line id (формат <digits>_<unit>) + MOQ в стеблях —
                    # для будущего батч-availability (режим B) и лимитов предзаказа
                    line_ids = [l["line_id"] for l in res["lines"] if l.get("line_id")]
                    if line_ids:
                        payload["oz_line_ids"] = line_ids
                        payload["oz_line_ids_updated_at"] = now_iso()
                    moqs = [(l.get("min_multiples") or 1) * (l.get("order_multiple_stems") or 1)
                            for l in res["lines"]]
                    if moqs:
                        payload["oz_min_order_qty"] = min(moqs)
                    if min_eur:  # >0: €0/None трактуем как «цены нет» — не перезаписываем ₸0
                        kzt = supa.calc_price_kzt(min_eur, markup, rate, round_to)
                        payload["oz_purchase_eur"] = min_eur
                        payload["price"] = kzt
                        payload["hidden_for_demo"] = False  # реальная цена -> показываем (стаб 999 скрыт)
                    else:
                        stats["no_price"] += 1  # стебли есть, цены нет — цену не трогаем
                    if not dry_run:
                        supa.update_product(code, payload)
                    stats["updated"] += 1
                    log.line(f"[{i}/{len(targets)}] OK            {code} qty={stems}"
                             f" €{min_eur if min_eur is not None else '—'}"
                             f"{' ₸' + str(payload.get('price')) if 'price' in payload else ''}")
                elif deactivate_enabled:
                    # XHR пришёл и в нём пусто + деактивация включена — единственный
                    # легальный случай гашения карточки.
                    if not dry_run:
                        supa.update_product(code, {
                            "qty": 0, "is_active": False,
                            "oz_stock_updated_at": now_iso(),
                        })
                    stats["deactivated"] += 1
                    log.line(f"[{i}/{len(targets)}] DEACTIVATED   {code} (XHR пуст)")
                else:
                    # фаза наполнения: пусто на целевую дату — НЕ гасим, заглушку
                    # оставляем как есть (is_active/qty/price не трогаем).
                    stats["empty_kept"] += 1
                    log.line(f"[{i}/{len(targets)}] EMPTY_KEEP    {code} (пусто на дату — не гашу)")

            await asyncio.sleep(random.uniform(*PAUSE_RANGE_S))

        await browser.close()

    mins = (time.monotonic() - t0) / 60
    finished_at = datetime.now(ORAL_TZ)
    log.line(f"Финиш прогона: {finished_at.strftime('%d.%m %H:%M')} Oral ({mins:.1f} мин)")
    deact_mode = "деактивировано" if deactivate_enabled else "пусто-сохранено"
    deact_num = stats["deactivated"] if deactivate_enabled else stats["empty_kept"]
    summary = (f"OZ price refresh: всего {stats['total']} | обновлено {stats['updated']} | "
               f"{deact_mode} {deact_num} | без XHR {stats['no_xhr']} | "
               f"ошибок {stats['errors']} | без цены {stats['no_price']} | "
               f"{started_at.strftime('%H:%M')}–{finished_at.strftime('%H:%M')} Oral, {mins:.1f} мин")
    if deadline_left:
        summary += (f"\n⏰ Не успели {deadline_left} до конца окна robots.txt (09:00 Oral) — "
                    "остаток дойдёт следующей ночью.")
    # строка от update_eur_rate.py (ExecStartPre) — в общий отчёт, если свежая (<24ч)
    eur_file = BASE_DIR / ".last_eur_update"
    if eur_file.exists() and time.time() - eur_file.stat().st_mtime < 86_400:
        summary += "\n" + eur_file.read_text(encoding="utf-8").strip()
    log.line(summary)

    if not dry_run:
        if session_dead:
            send_whatsapp(
                "⚠️ OZ-парсер ОСТАНОВЛЕН: сессия протухла "
                f"({NO_XHR_STOP_AFTER} товаров подряд без XHR).\n"
                "Каталог НЕ деактивирован. Нужно обновить oz_state.json: "
                "на десктопе oz_login.py, затем scp на VPS (см. docs/OZ_PRICE_REFRESH.md).\n\n"
                + summary, log)
        else:
            send_whatsapp("🌙 " + summary, log)

    return 2 if session_dead else 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="обработать первые N товаров")
    ap.add_argument("--dry-run", action="store_true", help="без записи в БД и WhatsApp")
    args = ap.parse_args()
    sys.exit(asyncio.run(run(args.limit, args.dry_run)))


if __name__ == "__main__":
    main()
