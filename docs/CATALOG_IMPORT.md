# Импорт каталога поставщиков

**Обновлено:** 27.05.2026  
**Статус:** Актуально

---

## Суть и цель

Мы парсим сайты поставщиков и заполняем таблицу `products` через скрипты импорта.  
Это даёт нам фотографии, цвета, подкатегории и размеры ещё до того, как товар появится в 1С.

**Источники:**
- **OZ Export** (oz-export.com) — срезанные цветы, Голландия + Эквадор
- **Waterdrinker** (waterdrinker.nl) — горшечные растения, Голландия

**Что НЕ приходит из парсинга:**
- Реальная цена (`price = null` у Waterdrinker, `888` у OZ — плейсхолдер)
- Реальный остаток (у OZ `qty = 999`, у Waterdrinker берётся из `item.stock`)

Цены и остатки приходят из **1С через XLS-импорт** (отдельный процесс).

---

## Скрипты

| Скрипт | Поставщик | Категория товаров | JSONL по умолчанию |
|--------|-----------|-------------------|--------------------|
| `scripts/import-oz.mjs` | OZ Export | Срезка (`cut`) | `waterdrinker-scraper/output/oz_export_cut_flowers.jsonl` |
| `scripts/import-waterdrinker.mjs` | Waterdrinker | Горшечные (`pot`) | `waterdrinker-scraper/output/waterdrinker_catalog.jsonl` |

### Запуск

```bash
# OZ — все категории
node --env-file=.env.local scripts/import-oz.mjs

# OZ — одна категория
node --env-file=.env.local scripts/import-oz.mjs "Rosa Ecuador"

# OZ — из конкретного файла
node --env-file=.env.local scripts/import-oz.mjs ALL "C:\path\to\file.jsonl"

# Waterdrinker — все категории
node --env-file=.env.local scripts/import-waterdrinker.mjs

# Waterdrinker — одна категория
node --env-file=.env.local scripts/import-waterdrinker.mjs "Anthurium"
```

---

## Формат JSONL

Каждая строка — один JSON-объект.

### OZ (`oz_export_cut_flowers.jsonl`)

```json
{
  "name": "Rosa Red Naomi Roses",
  "category": "Rosa",
  "color_line": "Red",
  "height_cm": 70,
  "producer": "Porta Nova",
  "quantity_stems": 25,
  "image_urls": ["https://cdn.oz-export.com/...jpg", "https://cdn.oz-export.com/...jpg"]
}
```

Категория `Rosa Ecuador` обрабатывается отдельно → `country_iso = 'EC'`, `variety_type = 'single'`.

### Waterdrinker (`waterdrinker_catalog.jsonl`)

```json
{
  "name": "Anthurium Tropic Jade",
  "_category_name": "Anthurium",
  "mainAttributes": [
    { "code": "S01", "value": "13 cm" },
    { "code": "S02", "value": "60 cm" }
  ],
  "attributes": [
    { "code": "S50", "value": "Groen" },
    { "code": "S62", "value": "Netherlands" }
  ],
  "stock": 120,
  "packing": { "code": "P12" },
  "pictures": ["https://img.waterdrinker.nl/.../w240xh240/...jpg"]
}
```

Атрибуты: `S01` = диаметр горшка, `S02` = высота, `S50` / `B01` = цвет (по-нидерландски), `S62` = страна.

---

## Логика UPDATE vs INSERT

Ключ поиска в БД — `products.name` (verbatim строка из парсера).

### UPDATE (товар найден)

Обновляется:
- `qty`, `is_active`
- `colors` — только если поле было пустым
- `image_url`, `campaign_image_url` — только если поле было пустым (OZ) или `display_name` пустой (Waterdrinker)

**Не перезаписывается:**
- `display_name` — ручные правки
- `length_cm`, `country_iso`, `farm` — уже заполненные вручную
- `price` — приходит из XLS, не из парсера

### INSERT (новый товар)

Устанавливается всё: `name`, `category`, `subcategory`, `length_cm`, `pot_diameter`, `country_iso`, `colors`, `image_url`, `campaign_image_url`, `farm`, `pack_size`, `stems_per_pack`, `is_active`, `arrival_date = today`.

**Упаковка (OZ):**
- `pack_size = 1` — кратность заказа, всегда 1 (редактируется вручную в AdminTable)
- `stems_per_pack = quantity_stems` из OZ — информационное поле (10, 25 и т.д.)

`display_name` генерирует триггер `generate_product_display_name` автоматически после INSERT.

---

## Маппинги цветов

### OZ (английские названия → palette key)

| OZ `color_line` | palette key |
|-----------------|-------------|
| White | `white` |
| Cream / Ivory / Champagne | `cream` |
| Yellow | `yellow` |
| Yellow-orange | `yellow_orange` |
| Orange | `orange` |
| Orange light | `light_orange` |
| Apricot / Salmon / Peach | `peach` |
| Coral / Orange-red | `coral` |
| Red | `red` |
| Dark red / Burgundy / Aubergine | `burgundy` |
| Pink light / Light pink | `light_pink` |
| Pink / Pink old / Pink dark | `pink` |
| Pink white / Pink/white | `bicolor_pink_white` |
| Hot pink / Fuchsia / Cerise | `hot_pink` |
| Purple / Violet | `purple` |
| Lilac / Milka | `lilac` |
| Lilac dark | `lilac_dark` |
| Lavender | `lavender` |
| Blue / Light blue | `blue` |
| Dark blue | `navy` |
| Green | `green` |
| Bronze | `terracotta` |
| Grey | `silver` |
| Brown | `brown` |
| Black | `black` |
| Blue/White | `bicolor_blue_white` |
| Orange/Green | `bicolor_orange_green` |
| Orange/Yellow | `bicolor_orange_yellow` |
| Red/White | `bicolor_red_white` |
| Red/Yellow | `bicolor_red_yellow` |
| White green / White/Green | `bicolor_white_green` |
| Bicolor / Bicolour | `bicolor` |
| Mixed / Mix / Multicolor | `multicolor` |
| Любой паттерн `X/Y` | `bicolor` (regex fallback) |

### Waterdrinker (нидерландские названия → palette key)

| Waterdrinker | palette key |
|--------------|-------------|
| Wit | `white` |
| Creme / Pastel | `cream` |
| Geel / Licht geel | `yellow` |
| Oranje | `orange` |
| Zalm / Zalmroze | `peach` |
| Koraal | `coral` |
| Rood | `red` |
| Bordeaux / Donker rood | `burgundy` |
| Roze / Licht roze / Roze-rood | `pink` |
| Felroze | `hot_pink` |
| Lila / Licht paars | `lilac` |
| Lavendel | `lavender` |
| Paars | `purple` |
| Blauw / Licht blauw | `blue` |
| Donkerblauw | `navy` |
| Groen | `green` |
| Lichtgroen | `lime` |
| Zilver | `silver` |
| Bruin / Rood bruin | `brown` / `terracotta` |
| Zwart | `black` |
| Rood wit | `bicolor` |
| Gemengd / Diverse / Mix | `multicolor` |

---

## variety_type у OZ (Rosa)

| Условие | `variety_type` |
|---------|----------------|
| `category = 'Rosa Ecuador'` | `single` |
| `name.startsWith('Rosa Garden')` или `Rosa Large` или `Rosa Austin` | `decorative` |
| `name.startsWith('Rosa Spray')` | `spray` |
| Остальные | `null` |

---

## Пропускаемые категории

| Скрипт | SKIP_CATEGORIES |
|--------|-----------------|
| OZ | Bouquets, Artificial Flowers |
| Waterdrinker | Bonsai |

---

## Дальнейший план: маппинг 1С → каталог

Сейчас товары из парсинга и товары из 1С/XLS — это **отдельные миры**.  
1С присылает строки вида `"роза диана 70"`, а в `products.name` у нас `"Rosa Diana Roses"`.

Варианты маппинга (не реализовано):

1. **Ручная таблица синонимов** — `name_aliases: text[]` в `products`, туда добавляем 1С-строку при первом совпадении через UI.
2. **AI-маппинг при импорте** — при XLS-импорте если точное совпадение не найдено, вызываем LLM для нечёткого матчинга и предлагаем вариант администратору.
3. **Нормализованный ключ** — выработать алгоритм нормализации (убрать язык, привести к `subcategory + сорт + длина`) и применять к обоим источникам.

Текущий временный механизм: XLS-импорт создаёт новый `products` с 1С-именем если совпадения нет → дубли.
