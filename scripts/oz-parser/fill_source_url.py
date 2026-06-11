"""
fill_source_url.py — разовая заливка URL карточек OZ в products.source_url.

Читает все output/*.jsonl (результаты parser_oz_catalog), берёт из каждой строки
oz_product_code + url, проставляет products.source_url по коду через Supabase REST.

Зачем: парсеру цен (oz_price_refresh) нужен URL страницы товара, чтобы открыть её и
снять цену/доступность из XHR. Код товара URL не заменяет — в адресе OZ есть путь
категории, из голого кода ссылку не собрать.

Запуск:
    python fill_source_url.py
    (читает все output/*.jsonl; либо: python fill_source_url.py output/Rosa-Ecuador.jsonl ...)

Читает .env.local в папке flowers-b2b (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
"""
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

OUTPUT_DIR = Path("output")
ENV_PATH = Path(__file__).resolve().parent / ".env"


def load_env():
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def collect_pairs(paths):
    pairs = {}
    for p in paths:
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            code = rec.get("oz_product_code")
            url = rec.get("url") or rec.get("source_url")
            if code and url:
                pairs[code] = url
    return pairs


def patch_one(base_url, headers, code, url):
    endpoint = f"{base_url}/rest/v1/products?oz_product_code=eq.{code}"
    body = json.dumps({"source_url": url}).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, method="PATCH", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status in (200, 204), None
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8')[:200]}"
    except urllib.error.URLError as e:
        return False, str(e.reason)


def main():
    load_env()
    base_url = (
        os.environ.get("SUPABASE_URL") or
        os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    )
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY") or
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )
    if not base_url or not key:
        print("Нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в .env.local")
        sys.exit(1)

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        paths = [Path(a) for a in args if Path(a).exists()]
    else:
        paths = sorted(OUTPUT_DIR.glob("*.jsonl"))
        paths = [p for p in paths if p.name != "ingest.jsonl"]

    if not paths:
        print("Нет jsonl-файлов. Передай путь аргументом или запусти из папки с output/")
        sys.exit(1)

    pairs = collect_pairs(paths)
    print(f"Файлов: {len(paths)} | уникальных кодов с URL: {len(pairs)}")
    if not pairs:
        print("В файлах нет пар oz_product_code+url.")
        sys.exit(0)

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    ok, fail = 0, 0
    errors = []
    total = len(pairs)
    for i, (code, url) in enumerate(pairs.items(), 1):
        success, err = patch_one(base_url, headers, code, url)
        if success:
            ok += 1
        else:
            fail += 1
            if len(errors) < 10:
                errors.append(f"{code}: {err}")
        if i % 50 == 0 or i == total:
            print(f"  [{i}/{total}] ok={ok} fail={fail}")

    print(f"\nГотово: проставлено {ok}, ошибок {fail}")
    if errors:
        print("Первые ошибки:")
        for e in errors:
            print("  ", e)


if __name__ == "__main__":
    main()
