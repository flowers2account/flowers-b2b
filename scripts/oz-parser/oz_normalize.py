"""
OZ Export — нормализатор ответа stockLines/availability (PDP).

Превращает сырой JSON (allStockPdpMap) в плоский список коммерческих
позиций под предзаказы. Единица = ВЕДРО (1:1 с OZ).

Наценка здесь НЕ применяется — отдаём чистую закупочную цену OZ.
Правило наценки живёт в Supabase и применяется на сайте.
"""
from __future__ import annotations
import math
from datetime import datetime, timezone

CURRENCY_SYMBOLS = {"€": "EUR", "$": "USD", "£": "GBP", "₸": "KZT", "₽": "RUB"}


def _money_to_float(s):
    """'€ 8,59' -> 8.59 ; вернёт None если не распарсилось."""
    if not s or not isinstance(s, str):
        return None
    cleaned = "".join(ch for ch in s if ch.isdigit() or ch in ".,")
    if not cleaned:
        return None
    # европейский формат: запятая = десятичный разделитель
    cleaned = cleaned.replace(".", "").replace(",", ".") if "," in cleaned else cleaned
    try:
        return float(cleaned)
    except ValueError:
        return None


def _detect_currency(*formatted_values):
    for v in formatted_values:
        if isinstance(v, str):
            for sym, iso in CURRENCY_SYMBOLS.items():
                if sym in v:
                    return iso
    return None


def _epoch_ms_to_date(ms):
    if not ms:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, TypeError, OverflowError):
        return None


def _erp_for_line(price: dict, line_id: str | None):
    """Достаёт {b2bPrices, minimumOrderQuantity} для конкретной stock-line."""
    erp = (price or {}).get("erpResponse") or {}
    if line_id and line_id in erp and erp[line_id]:
        return erp[line_id][0] or {}
    # фолбэк: первая попавшаяся линия
    for v in erp.values():
        if v:
            return v[0] or {}
    return {}


def normalize_stock_line(line: dict, stock_type: str) -> dict:
    """Одна stock-line -> нормализованная позиция (единица = ведро)."""
    price = line.get("price") or {}
    line_id = (line.get("stockLineIdList") or [None])[0]
    erp = _erp_for_line(price, line_id)

    pieces_in_unit = line.get("piecesinUnit") or 0          # стеблей в упаковке (ведро/коробка)
    bucket_prices = price.get("bucketPrices") or {}
    stem_prices = price.get("stemPrices") or {}

    # ЦЕНА ЗА СТЕБЕЛЬ при покупке упаковкой.
    # Источник: lowestFromPrice (чистое число) -> фолбэк bucketPrices['1'] -> stemPrices['1'].
    price_per_stem = price.get("lowestFromPrice")
    if price_per_stem is None:
        price_per_stem = _money_to_float(bucket_prices.get("1")) or _money_to_float(stem_prices.get("1"))

    # МУЛЬТИПЛИКАТОР = кратность заказа в стеблях (×25 розы, ×60 хризантема, ×100/×10 и т.д.)
    order_multiple = line.get("incrementalOrderQuantity") or 1

    # цена за один шаг заказа (банч/пак)
    price_per_multiple = (
        round(price_per_stem * order_multiple, 2)
        if (price_per_stem is not None and order_multiple) else None
    )

    total_stems = line.get("totalAvailableStockAmount") or 0    # источник правды по стеблям
    additional_stems = line.get("additionalStem") or 0          # россыпь сверх полных упаковок
    available_multiples = total_stems // order_multiple if order_multiple else None

    moq_pieces = (erp.get("minimumOrderQuantity") or [None])[0]
    if moq_pieces and order_multiple:
        min_multiples = max(1, math.ceil(moq_pieces / order_multiple))
    else:
        min_multiples = 1

    currency = _detect_currency(
        bucket_prices.get("1"), stem_prices.get("1"),
        price.get("lowestStemPrice"), price.get("formattedValue"),
    )

    return {
        "product_code": line.get("productCode"),
        "stock_type": stock_type,                   # VMP / STOCK / PROMOTION / ...
        "line_id": line_id,
        # --- цена (БЕЗ наценки; наценка считается на сайте) ---
        "price_per_stem": price_per_stem,
        "currency": currency,
        # --- кратность заказа ---
        "order_multiple_stems": order_multiple,     # ← кратность (мультипликатор OZ)
        "price_per_multiple": price_per_multiple,    # цена за 1 шаг заказа
        "min_multiples": min_multiples,             # минимум шагов
        # --- остаток ---
        "available_stems": total_stems,
        "available_multiples": available_multiples, # сколько шагов можно купить
        "additional_loose_stems": additional_stems,
        # --- доставка / упаковка / инфо ---
        "delivery_date": _epoch_ms_to_date(line.get("startDate")),
        "packaging_unit_stems": pieces_in_unit,     # ведро/коробка (транспорт)
        "vbn_unit_code": price.get("defaultPackagingUnitCode"),
        "buy_buckets": line.get("buyBuckets"),
        "buy_stems": line.get("buyStems"),
        "status_hex": line.get("hexValue"),
        "price_tiers_bucket": bucket_prices,
        "price_tiers_stem": stem_prices,
        "allow_null_price": line.get("allowNullPriceOrder"),
    }


def normalize_availability(payload: dict) -> dict:
    """
    Весь ответ stockLines/availability -> {product_code, lines[], err}.
    Итерирует ВСЕ типы складов (allStockPdpMap может содержать
    несколько типов/линий с разными датами поставки).
    """
    out_lines = []
    product_code = None
    for stock_type, lines in (payload.get("allStockPdpMap") or {}).items():
        for line in (lines or []):
            nl = normalize_stock_line(line, stock_type)
            product_code = product_code or nl["product_code"]
            out_lines.append(nl)
    return {
        "product_code": product_code,
        "lines": out_lines,
        "err": payload.get("errMsg") or None,
    }


if __name__ == "__main__":
    import json, sys
    data = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "_sample.json", encoding="utf-8"))
    result = normalize_availability(data)
    print(json.dumps(result, ensure_ascii=False, indent=2))
