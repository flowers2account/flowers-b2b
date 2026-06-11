"""
update_eur_rate.py — автообновление курса EUR/KZT для предзаказной полки.

1. Качает официальный курс НБ РК (https://nationalbank.kz/rss/rates_all.xml, публичный XML).
2. Прибавляет надбавку app_settings.eur_rate_extra_percent: итог = НБ × (1 + extra/100),
   округление до 1 тенге.
3. Пишет app_settings.preorder_eur_kzt_rate и вызывает recalc_oz_prices() —
   цены всех oz_catalog пересчитываются из сохранённых oz_purchase_eur без перепарсинга.

ЗАЩИТА: XML не скачался / EUR не найден / курс вне 400–900 / изменение к прошлому
больше ±10%  ->  курс НЕ обновляется, старый остаётся, алерт в WhatsApp, exit 1.

Результат-строка для общего ночного отчёта кладётся в /opt/oz-parser/.last_eur_update —
oz_price_refresh.py подклеивает её к своему WhatsApp-итогу.

Запуск:  python update_eur_rate.py [--dry-run]
Расписание: systemd oz-eur-rate.timer (07:00 и 19:00 Asia/Oral)
            + ExecStartPre в oz-price-refresh.service (свежий курс перед ночным прогоном).
Env: тот же /opt/oz-parser/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY, UMNICO_*).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.etree import ElementTree

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"
LAST_UPDATE_FILE = BASE_DIR / ".last_eur_update"
LOG_FILE = Path("/var/log/oz-price-refresh/eur_rate.log")

NBK_URL = "https://nationalbank.kz/rss/rates_all.xml"
RATE_MIN, RATE_MAX = 400.0, 900.0
MAX_JUMP_PCT = 10.0

ORAL_TZ = timezone(timedelta(hours=5))


def load_env() -> None:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def log(msg: str) -> None:
    stamp = datetime.now(ORAL_TZ).strftime("%Y-%m-%d %H:%M:%S")
    text = f"[{stamp}] {msg}"
    print(text, flush=True)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(text + "\n")
    except PermissionError:
        pass


# ── Supabase REST ────────────────────────────────────────────────────────────

def supa_req(method: str, path: str, body=None, headers=None):
    base = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or ""
    if not base or not key:
        raise SystemExit("Нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env")
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def get_setting(key: str):
    rows = supa_req("GET", f"/rest/v1/app_settings?select=value&key=eq.{key}") or []
    return rows[0]["value"] if rows else None


def send_whatsapp(text: str) -> None:
    token = os.environ.get("UMNICO_API_TOKEN")
    sa_id = os.environ.get("UMNICO_WHATSAPP_SA_ID")
    phone = os.environ.get("UMNICO_MANAGER_PHONE")
    if not (token and sa_id and phone):
        log("WhatsApp: UMNICO_* не настроены — пропускаю")
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
            log("WhatsApp: отправлено")
    except Exception as e:  # noqa: BLE001
        log(f"WhatsApp: ошибка — {e}")


# ── курс НБ РК ───────────────────────────────────────────────────────────────

def fetch_nbk_eur() -> float | None:
    """EUR из rss НБ РК: <item><title>EUR</title><description>602.5</description>."""
    try:
        req = urllib.request.Request(NBK_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            xml = resp.read()
    except Exception as e:  # noqa: BLE001
        log(f"НБ РК: не скачался XML — {e}")
        return None
    try:
        root = ElementTree.fromstring(xml)
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip().upper()
            if title == "EUR":
                desc = (item.findtext("description") or "").strip()
                m = re.search(r"[\d.,]+", desc)
                if m:
                    return float(m.group(0).replace(",", "."))
        log("НБ РК: элемент EUR не найден в XML")
        return None
    except ElementTree.ParseError as e:
        log(f"НБ РК: XML не парсится — {e}")
        return None


# ── основной поток ───────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="без записи и WhatsApp")
    args = ap.parse_args()

    load_env()

    old_raw = get_setting("preorder_eur_kzt_rate")
    old_rate = float(old_raw) if old_raw else None
    extra_raw = get_setting("eur_rate_extra_percent") or "0"
    extra = float(extra_raw)

    nbk = fetch_nbk_eur()
    if nbk is None:
        msg = f"⚠️ Курс EUR НЕ обновлён: НБ РК недоступен/не распарсился. Оставлен старый {old_raw} ₸."
        log(msg)
        if not args.dry_run:
            send_whatsapp(msg)
        return 1

    new_rate = round(nbk * (1 + extra / 100))  # до 1 тенге
    log(f"НБ РК EUR={nbk} | надбавка {extra}% | итог {new_rate} ₸ | старый {old_raw} ₸")

    # защиты: диапазон и скачок
    if not (RATE_MIN <= new_rate <= RATE_MAX):
        msg = (f"⚠️ Курс EUR НЕ обновлён: {new_rate} ₸ вне диапазона {RATE_MIN:.0f}–{RATE_MAX:.0f}. "
               f"Оставлен старый {old_raw} ₸. (НБ={nbk}, надбавка {extra}%)")
        log(msg)
        if not args.dry_run:
            send_whatsapp(msg)
        return 1
    if old_rate and abs(new_rate - old_rate) / old_rate * 100 > MAX_JUMP_PCT:
        msg = (f"⚠️ Курс EUR НЕ обновлён: скачок {old_rate:.0f} → {new_rate} ₸ "
               f"больше ±{MAX_JUMP_PCT:.0f}%. Оставлен старый. Проверь вручную. (НБ={nbk})")
        log(msg)
        if not args.dry_run:
            send_whatsapp(msg)
        return 1

    if old_rate is not None and int(new_rate) == int(old_rate):
        log(f"Курс не изменился ({new_rate} ₸) — запись и пересчёт не нужны")
        if not args.dry_run:
            LAST_UPDATE_FILE.write_text(
                f"Курс EUR: {new_rate} ₸ (без изменений, НБ={nbk} +{extra}%)", encoding="utf-8")
        return 0

    if args.dry_run:
        log(f"[DRY-RUN] обновил бы {old_raw} → {new_rate} и вызвал recalc_oz_prices()")
        return 0

    supa_req("PATCH", "/rest/v1/app_settings?key=eq.preorder_eur_kzt_rate",
             {"value": str(new_rate)}, headers={"Prefer": "return=minimal"})
    n = supa_req("POST", "/rest/v1/rpc/recalc_oz_prices", {})
    summary = f"Курс EUR: {old_raw} → {new_rate} ₸ (НБ={nbk} +{extra}%), пересчитано {n} цен"
    log(summary)
    LAST_UPDATE_FILE.write_text(summary, encoding="utf-8")
    send_whatsapp("💶 " + summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
