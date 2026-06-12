"""
oz_catalog_ingest.py — заливка output/<категория>.jsonl → products (Supabase REST).

Запускается каталожным парсером после каждой категории (--ingest-after-each) или
вручную:  venv/bin/python oz_catalog_ingest.py output/Lilium.jsonl [...]

Контракт (см. задание «каталожный парсер OZ»):
  Upsert по oz_product_code. ВСЕГДА строго source='oz_catalog'.
  INSERT новых:  source=oz_catalog, category=cut, is_active=true, qty=999, price=999,
                 display_name=name (латиница временно), subcategory=<маппинг>,
                 name, image_url, length_cm, colors, country_iso, farm,
                 stems_per_pack, pack_size, container_code, quality_grade, source_url=url
  UPDATE существующих — СТРОГИЙ whitelist полей:
                 source_url, container_code, quality_grade, farm, length_cm,
                 colors, country_iso, stems_per_pack, pack_size, image_url
     НЕ ТРОГАТЬ НИКОГДА: display_name, subcategory, name, is_active, qty, price
  Никаких DELETE / деактиваций. Чужие source (uralsk_*/waterdrinker/oz_preorder)
  не затрагиваются: UPDATE идёт с фильтром source=eq.oz_catalog.

Печатает машиночитаемый итог последней строкой:
  RESULT new=<N> updated=<M> errors=<E> new_subcats=<a,b,...>

Env (/opt/oz-parser/.env): SUPABASE_URL, SUPABASE_SERVICE_KEY (как у ценового парсера).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

# ── маппинг category_oz → subcategory (под существующую таксономию БД) ──────────
SUBCATEGORY_MAP = {
    "Lilium": "lilies", "Gerbera-Germini": "gerberas", "Chrysanthemum": "chrysanthemums",
    "Rosa": "roses", "Rosa-Ecuador": "roses", "Alstroemeria": "alstroemeria",
    "Anthuriums": "anthuriums", "Hydrangea": "hydrangeas", "Dianthus": "carnations",
    "Lisianthus-Eustoma": "lisianthus", "Delphinium": "delphiniums",
    "Gypsophila": "fillers", "Hypericum": "berries", "Limonium-Statice": "fillers",
    "Solidago": "fillers", "Veronica": "fillers", "Aster": "fillers",
    "Astilbe": "texture", "Bouvardia": "texture", "Chamelaucium-Waxflower": "texture",
    "Eryngium": "texture", "Paint-Wax": "texture",
    "Cymbidium": "orchids", "Phalaenopsis-Vanda": "orchids", "Orchids": "orchids",
    "Exotics": "accents", "Protea-Nutans": "proteas",
    "Branches-Wood": "branches", "Syringa-Viburnum": "branches",
    "Tulipa": "spring", "Iris": "spring", "Freesia": "spring",
    "Ranunculus": "spring", "Matthiola": "spring",
    "Paeonia": "seasonal", "Antirrhinum": "seasonal", "Zantedeschia-Calla": "seasonal",
    "Bouquets": "other", "More-flowers": "other",
    "Artificial-Flowers": "artificial",
    "Dried-flowers": "dried", "Preserved-Flowers": "dried",
    # сезонные/everlasting
    "Alchemilla": "seasonal", "Allium": "seasonal", "Campanula": "seasonal",
    "Celosia": "seasonal", "Dahlia": "seasonal", "Fritillaria": "seasonal",
    "Helianthus": "seasonal", "Lathyrus": "seasonal",
}

# поля, которые UPDATE имеет право менять (всё прочее — неприкосновенно).
# oz_departure_date — дата вылета, на которую снят ассортимент (метка консистентности).
UPDATE_WHITELIST = [
    "source_url", "container_code", "quality_grade", "farm", "length_cm",
    "colors", "country_iso", "stems_per_pack", "pack_size", "image_url",
    "oz_departure_date",
]


def load_env() -> None:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ── нормализация значений ──────────────────────────────────────────────────────

def _clean_str(v):
    """Пустые строки и '_' → None; иначе trimmed строка."""
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        if s == "" or s == "_":
            return None
        return s
    return v


def _clean_colors(v):
    """['unknown'] / [] / пустые → None; иначе список без 'unknown'/пустых."""
    if not isinstance(v, list):
        return None
    out = [c for c in v if isinstance(c, str) and c.strip() and c.strip().lower() != "unknown"]
    return out or None


def _subcat_for(category_oz: str, new_subcats: set) -> str:
    if category_oz in SUBCATEGORY_MAP:
        return SUBCATEGORY_MAP[category_oz]
    slug = (category_oz or "other").strip().lower().replace(" ", "_").replace("-", "_")
    new_subcats.add(slug)
    return slug


def _row_from_item(item: dict, new_subcats: set) -> dict | None:
    code = item.get("oz_product_code")
    name = _clean_str(item.get("name"))
    if not code or not name:
        return None
    return {
        "oz_product_code": code,
        "name": name,
        "source_url": _clean_str(item.get("url") or item.get("source_url")),
        "image_url": _clean_str(item.get("image_url")),
        "length_cm": item.get("length_cm"),
        "colors": _clean_colors(item.get("colors")),
        "country_iso": _clean_str(item.get("country_iso")),
        "farm": _clean_str(item.get("farm")),
        "stems_per_pack": item.get("stems_per_pack"),
        "pack_size": item.get("pack_size"),
        "container_code": _clean_str(item.get("container_code")),
        "quality_grade": _clean_str(item.get("quality_grade")),
        "subcategory": _subcat_for(item.get("category_oz"), new_subcats),
    }


# ── Supabase REST (urllib) ─────────────────────────────────────────────────────

class Supa:
    def __init__(self) -> None:
        self.base = (os.environ.get("SUPABASE_URL")
                     or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
        self.key = (os.environ.get("SUPABASE_SERVICE_KEY")
                    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
        if not self.base or not self.key:
            raise SystemExit("Нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env")

    def _req(self, method: str, path: str, body=None, extra_headers=None):
        h = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if extra_headers:
            h.update(extra_headers)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None

    def get_setting(self, key: str):
        r = self._req("GET", f"/rest/v1/app_settings?select=value&key=eq.{urllib.parse.quote(key)}")
        return r[0]["value"] if r else None

    def codes_with_source(self, codes: list[str]) -> dict[str, str]:
        """{oz_product_code: source} по ЛЮБОМУ source (чанками по 100).
        Уникальный индекс на oz_product_code глобальный — код может принадлежать
        чужому source (oz_preorder/uralsk/...); такие коды мы не вставляем и не трогаем."""
        found: dict[str, str] = {}
        for i in range(0, len(codes), 100):
            chunk = codes[i:i + 100]
            quoted = ",".join(urllib.parse.quote(c) for c in chunk)
            path = (f"/rest/v1/products?select=oz_product_code,source"
                    f"&oz_product_code=in.({quoted})")
            rows = self._req("GET", path) or []
            for r in rows:
                found[r["oz_product_code"]] = r["source"]
        return found

    def insert_batch(self, rows: list[dict], departure_date) -> None:
        """Bulk INSERT новых карточек (полный набор полей)."""
        payload = []
        for r in rows:
            payload.append({
                "oz_product_code": r["oz_product_code"],
                "name": r["name"],
                "display_name": r["name"],          # латиница временно; AI-перевод — отдельно
                "source": "oz_catalog",
                "category": "cut",
                "subcategory": r["subcategory"],
                "is_active": True,
                "qty": 999,
                "price": 999,
                "source_url": r["source_url"],
                "image_url": r["image_url"],
                "length_cm": r["length_cm"],
                "colors": r["colors"],
                "country_iso": r["country_iso"],
                "farm": r["farm"],
                "stems_per_pack": r["stems_per_pack"],
                "pack_size": r["pack_size"],
                "container_code": r["container_code"],
                "quality_grade": r["quality_grade"],
                "oz_departure_date": departure_date,
            })
        self._req("POST", "/rest/v1/products", payload,
                  extra_headers={"Prefer": "return=minimal"})

    def update_one(self, code: str, row: dict, departure_date) -> None:
        """UPDATE существующей карточки — только whitelist, строго source=oz_catalog."""
        patch = {k: row.get(k) for k in UPDATE_WHITELIST}
        patch["oz_departure_date"] = departure_date
        path = (f"/rest/v1/products?oz_product_code=eq.{urllib.parse.quote(code)}"
                "&source=eq.oz_catalog")
        self._req("PATCH", path, patch, extra_headers={"Prefer": "return=minimal"})


# ── основной проход ────────────────────────────────────────────────────────────

def ingest_files(paths: list[Path], departure_date: str | None = None) -> dict:
    load_env()
    supa = Supa()
    if not departure_date:
        departure_date = supa.get_setting("oz_target_departure_date")
    new_subcats: set[str] = set()

    # читаем + дедуп по oz_product_code (внутри всех переданных файлов)
    by_code: dict[str, dict] = {}
    for p in paths:
        if not p.exists():
            print(f"  ⚠ нет файла: {p}", flush=True)
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            row = _row_from_item(item, new_subcats)
            if row:
                by_code[row["oz_product_code"]] = row    # последняя строка побеждает

    rows = list(by_code.values())
    if not rows:
        print("RESULT new=0 updated=0 errors=0 skipped_foreign=0 new_subcats=", flush=True)
        return {"new": 0, "updated": 0, "errors": 0, "skipped_foreign": 0, "new_subcats": set()}

    src_by_code = supa.codes_with_source(list(by_code.keys()))
    to_insert = [r for r in rows if r["oz_product_code"] not in src_by_code]
    to_update = [r for r in rows if src_by_code.get(r["oz_product_code"]) == "oz_catalog"]
    # код занят чужим source (oz_preorder/uralsk/...) — не вставляем и НЕ трогаем
    foreign = [r for r in rows if r["oz_product_code"] in src_by_code
               and src_by_code[r["oz_product_code"]] != "oz_catalog"]
    if foreign:
        print(f"  ⏭ пропуск {len(foreign)} кодов под чужим source "
              f"(напр. {foreign[0]['oz_product_code']} → {src_by_code[foreign[0]['oz_product_code']]})",
              flush=True)

    new_cnt, upd_cnt, err_cnt = 0, 0, 0

    # INSERT — батчами по 200
    for i in range(0, len(to_insert), 200):
        batch = to_insert[i:i + 200]
        try:
            supa.insert_batch(batch, departure_date)
            new_cnt += len(batch)
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            # батч упал — пробуем по одному, чтобы не потерять всю пачку
            detail = e.read().decode("utf-8")[:160] if isinstance(e, urllib.error.HTTPError) else str(e.reason)
            print(f"  ⚠ INSERT-батч упал ({detail}); перехожу на поштучный", flush=True)
            for r in batch:
                try:
                    supa.insert_batch([r], departure_date)
                    new_cnt += 1
                except Exception as e2:  # noqa: BLE001
                    err_cnt += 1
                    print(f"    INSERT err {r['oz_product_code']}: {e2}", flush=True)

    # UPDATE — поштучно (whitelist, у каждой карточки свои значения)
    for r in to_update:
        try:
            supa.update_one(r["oz_product_code"], r, departure_date)
            upd_cnt += 1
        except Exception as e:  # noqa: BLE001
            err_cnt += 1
            print(f"    UPDATE err {r['oz_product_code']}: {e}", flush=True)

    print(f"RESULT new={new_cnt} updated={upd_cnt} errors={err_cnt} "
          f"skipped_foreign={len(foreign)} departure={departure_date} "
          f"new_subcats={','.join(sorted(new_subcats))}", flush=True)
    return {"new": new_cnt, "updated": upd_cnt, "errors": err_cnt,
            "skipped_foreign": len(foreign), "departure_date": departure_date,
            "new_subcats": new_subcats}


def main() -> None:
    departure = None
    rest = []
    argv = sys.argv[1:]
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--departure-date" and i + 1 < len(argv):
            departure = argv[i + 1]; i += 2; continue
        if a.startswith("--departure-date="):
            departure = a.split("=", 1)[1]; i += 1; continue
        if not a.startswith("--"):
            rest.append(a)
        i += 1
    if not rest:
        print("Использование: oz_catalog_ingest.py [--departure-date YYYY-MM-DD] output/<кат>.jsonl [...]")
        sys.exit(1)
    ingest_files([Path(a) for a in rest], departure)


if __name__ == "__main__":
    main()
