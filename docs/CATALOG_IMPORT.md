# Импорт каталога поставщиков

**Обновлено:** 28.05.2026  
**Статус:** Актуально

---

## Суть и цель

Мы парсим сайты поставщиков и заполняем таблицу `products` через скрипты импорта.  
Это даёт нам фотографии, цвета, подкатегории и размеры ещё до того, как товар появится в 1С.

**Источники:**
- **OZ Export** (oz-export.com) — срезанные цветы, Голландия + Эквадор
- **Waterdrinker** (waterdrinker.nl) — горшечные растения, Голландия

**Что НЕ приходит из парсинга:**
- Реальная цена (`price = null` у Waterdrinker, `999` у OZ — плейсхолдер)
- Реальный остаток (`qty = 999` у OZ — плейсхолдер; у Waterdrinker `qty = 0`, `is_active = false` — до прихода из 1С)

Цены и остатки приходят из **1С через XLS-импорт** (отдельный процесс).

---

## Скрипты

| Скрипт | Поставщик | Категория товаров | JSONL по умолчанию |
|--------|-----------|-------------------|--------------------|
| `scripts/import-oz.mjs` | OZ Export | Срезка (`cut`) | `waterdrinker-scraper/output/oz_export_cut_flowers.jsonl` |
| `scripts/import-waterdrinker.mjs` | Waterdrinker | Горшечные (`pot`) | `waterdrinker-v2-parser/output/waterdrinker_catalog_v2.jsonl` |

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

# Waterdrinker — из конкретного файла
node --env-file=.env.local scripts/import-waterdrinker.mjs ALL "C:\path\to\file.jsonl"
```

---

## Формат JSONL

Каждая строка — один JSON-объект.

### OZ (`oz_export_cut_flowers.jsonl`)

```json
{
  "id": "FBEAD09004CF11D72A7CB1737CD442E5",
  "name": "Rosa Red Naomi",
  "category": "Rosa",
  "color_line": "Red",
  "height_cm": 70,
  "weight_gram": 120,
  "producer": "Porta Nova",
  "quantity_stems": 25,
  "image_urls": ["https://cdn.oz-export.com/...jpg", "https://cdn.oz-export.com/...jpg"]
}
```

- `id` → сохраняется в `products.supplier_ref` (для маппинга цен и предзаказов)
- Категория `Rosa Ecuador` → `country_iso = 'EC'`, `variety_type = 'single'`
- `quantity_stems` — у хризантем OZ ставит `1` (поштучная продажа), не кратность пачки
- `qty = 999`, `price = 999` — плейсхолдеры до прихода из 1С

### Waterdrinker v2 (`waterdrinker_catalog_v2.jsonl`)

Новый формат парсера (с 28.05.2026). Прямые поля вместо `mainAttributes`/`attributes`.

```json
{
  "id": "3835233",
  "name": "Anthurium  'Karma White'",
  "category_id": "170101",
  "category_name": "Anthurium",
  "pot_size": 12,
  "height": 40,
  "color": "wit",
  "stems": 1,
  "quality": "A1",
  "country": "Nederland",
  "packing_units": 6,
  "min_plants": 2,
  "min_flowers": 4,
  "substrate": "potgrond",
  "pot_color": "wit",
  "pot_material": "keramiek gedecoreerd",
  "pot_form": "sierpot",
  "supplier_info": null,
  "images": ["https://waterdrinker.blob.core.windows.net/media/Original/...jpg"]
}
```

| Поле парсера | Поле products | Примечание |
|---|---|---|
| `id` | `supplier_ref` | строка |
| `name` | `name` (SKU) | чистое название сорта |
| `category_name` | `subcategory` (через SUBCAT_MAP) | |
| `pot_size` | `pot_diameter` | число, см |
| `height` | `length_cm` | число, см |
| `color` | `colors` | нидерл. → palette key |
| `stems` | `stems_per_pack`, `pack_size` | |
| `country` | `country_iso` | "Nederland" → "NL" |
| `images[0/1]` | `image_url` / `campaign_image_url` | полное разрешение (Original) |
| `supplier_info` | `farm` | ферма-производитель |
| `packing_units` | `container_code` | единиц в упаковке |
| `quality` | `quality_grade` | "A1", "A2" |
| `min_plants` | `min_plants_per_pot` | |
| `min_flowers` | `min_flowers_per_pot` | |
| `pot_color` | `pot_color` | нидерл. цвет горшка |
| `pot_material` | `pot_material` | материал горшка |
| `pot_form` | `pot_form` | тип горшка |
| `substrate` | `substrate` | субстрат |

**Ключ SKU:** `"${item.name.trim()} ${item.pot_size}"` — один сорт в разных горшках это разные позиции.  
**qty = 0, is_active = false** — активируются после XLS-импорта из 1С.

---

## Логика UPDATE vs INSERT

Ключ поиска в БД — `products.name`.

### OZ — ключ: `item.name` (verbatim)

**UPDATE** (товар найден):
- Всегда: `qty`, `is_active`, `subcategory`, `length_cm`, `country_iso`, `pack_size`, `stems_per_pack`, `supplier_ref`
- Только если пустое: `weight_gram`, `variety_type`, `colors`, `image_url` + `campaign_image_url`

**INSERT** (новый товар):  
Устанавливается всё: `name`, `category`, `subcategory`, `length_cm`, `country_iso`, `colors`, `image_url`, `campaign_image_url`, `farm`, `pack_size`, `stems_per_pack`, `weight_gram`, `supplier_ref`, `qty = 999`, `price = 999`, `arrival_date = today`.

### Waterdrinker — ключ: `"${item.name} ${item.pot_size}"`

**UPDATE** (товар найден):
- Всегда: `pot_diameter`, `length_cm`, `country_iso`, `pack_size`, `stems_per_pack`, `supplier_ref`, `farm`, `container_code`, `quality_grade`, `min_plants_per_pot`, `min_flowers_per_pot`, `pot_color`, `pot_material`, `pot_form`, `substrate`
- Только если пустое: `colors`, `image_url` + `campaign_image_url`
- НЕ трогается: `qty`, `price`, `is_active`, `display_name` (данные из 1С)

**INSERT** (новый товар): полный набор полей, `qty = 0`, `price = null`, `is_active = false`

---

## Переводы OZ-товаров

После импорта OZ-товары имеют `display_name = name` (английское название).  
Переводим через `/api/translations/batch` (Gemini Flash Lite + кэш TM).

### Текущий статус переводов

| Категория | Импортировано | Переведено |
|-----------|--------------|-----------|
| Alstroemeria | 28 | ✅ 28 |
| Chrysanthemum | 51 | ✅ 51 |
| Остальные | — | — |

### Рабочий процесс перевода

```sql
-- 1. Получить имена непереведённых товаров категории
SELECT name FROM products 
WHERE subcategory = 'roses' AND display_name = name AND qty = 999;

-- 2. Прогнать через POST /api/translations/batch
-- { "products": ["Rosa Red Naomi", ...] }

-- 3. Применить UPDATE CASE ... END
```

### Правила аббревиатур (OZ хризантемы)

| OZ-префикс | Тип | Перевод |
|-----------|-----|---------|
| `Chrys Sp` | Spray | «Хризантема ветковая» |
| `Chrys Bl` | Blooms (disbud, single-head, ping pong) | «Хризантема одноголовая» |
| `Chrys Sa` | Santini | «Хризантема сантини» |
| `Chrys T` | Top | «Хризантема одноголовая» |

### Правило «Микс»

Если в оригинале есть слово `Mix` — в переводе сохранять «микс».  
Пример: `Alstroemeria Fl Mix Florinca Rich` → `«Флоринка Рич Микс»`

---

## Маппинги цветов

### OZ (английские → palette key)

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

### Waterdrinker (нидерландские → palette key)

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
| `name.startsWith('Rosa Garden\|Rosa Large\|Rosa Austin')` | `decorative` |
| `name.startsWith('Rosa Spray')` | `spray` |
| Остальные | `null` |

---

## Пропускаемые категории

| Скрипт | SKIP_CATEGORIES |
|--------|-----------------|
| OZ | Bouquets, Artificial Flowers |
| Waterdrinker | Bonsai |

---

## Особенности парсера Waterdrinker v2

- `category_name` берётся из URL — может быть на русском ("Комнатные цветы") для корневых страниц. Таких записей немного (~69), они попадают в дефолтную подкатегорию `'flowering'`.
- Некоторые URL картинок без расширения `.jpg` — это нормально, Supabase Storage отдаёт их корректно.
- `supplier_info` (ферма) заполнен редко — у большинства `null`.
- `packing_units` = число упаковок в коробе (логистика); `packaging_material` — тип упаковки (нидерл., не переводится).

---

## Дальнейший план: маппинг 1С → каталог

`supplier_ref` сохраняется для OZ и Waterdrinker — UUID/ID из источника.  
В будущем: при получении прайса с OZ для предзаказов джойнить по `supplier_ref`.

Для маппинга 1С ↔ каталог (разные названия):
1. **Ручная таблица синонимов** — `product_aliases(raw_name, product_id)`: XLS-импорт ищет алиас, потом `products.name`
2. **AI-маппинг** — при XLS-импорте вызывать LLM для нечёткого матчинга
3. **Нормализованный ключ** — `subcategory + сорт + длина` для обоих источников

Текущий временный механизм: XLS создаёт новый `products` с 1С-именем если совпадения нет → дубли.
