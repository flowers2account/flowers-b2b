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
- Реальная цена (`price = null` у Waterdrinker, `999` у OZ — плейсхолдер)
- Реальный остаток (`qty = 999` у OZ — плейсхолдер; у Waterdrinker берётся из `item.stock`)

Цены и остатки приходят из **1С через XLS-импорт** (отдельный процесс).

---

## Скрипты

| Скрипт | Поставщик | Категория товаров | JSONL по умолчанию |
|--------|-----------|-------------------|--------------------|
| `scripts/import-oz.mjs` | OZ Export | Срезка (`cut`) | `waterdrinker-scraper/output/oz_export_cut_flowers.jsonl` |
| `scripts/import-waterdrinker.mjs` | Waterdrinker | Горшечные (`pot`) | `waterdrinker-scraper/output/waterdrinker_catalog_v2.jsonl` |

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

```json
{
  "id": 3835233,
  "name": "Anthurium   ...",
  "description": "Magnificum",
  "stock": 25,
  "packing": { "code": "206" },
  "mainAttributes": [
    { "code": "S01", "value": "12 cm" },
    { "code": "S02", "value": "35 cm" }
  ],
  "attributes": [
    { "code": "S50", "value": "diverse kleuren" },
    { "code": "S62", "value": "Netherlands" },
    { "code": "L11", "value": "6" }
  ],
  "pictures": ["https://waterdrinker.blob.core.windows.net/media/w240xh240/...jpg"],
  "_category_name": "Anthurium"
}
```

- `id` (числовой) → `supplier_ref` ⚠️ пока не реализовано в скрипте
- `name` содержит мусор — реальный сорт в `description`
- Атрибуты: `S01` = диаметр горшка, `S02` = высота, `S50` / `B01` = цвет (нидерландский), `S62` = страна, `L11` = стеблей в пачке (`pack_size`) ⚠️ пока не читается скриптом
- Фото: `w240xh240` → `Original` для полного разрешения
- `qty = item.stock`, `price = null`

---

## Логика UPDATE vs INSERT

Ключ поиска в БД — `products.name`.

### OZ — ключ: `item.name` (verbatim)

**UPDATE** (товар найден):
- Всегда: `qty`, `is_active`, `subcategory`, `length_cm`, `country_iso`, `pack_size`, `stems_per_pack`, `supplier_ref`
- Только если пустое: `weight_gram`, `variety_type`, `colors`, `image_url` + `campaign_image_url`

**INSERT** (новый товар):  
Устанавливается всё: `name`, `category`, `subcategory`, `length_cm`, `country_iso`, `colors`, `image_url`, `campaign_image_url`, `farm`, `pack_size`, `stems_per_pack`, `weight_gram`, `supplier_ref`, `qty = 999`, `price = 999`, `arrival_date = today`.

### Waterdrinker — ключ: `"${item.name} ${pot_size}"` (SKU включает горшок)

**UPDATE**: `qty`, `is_active`, `container_code` + если пустое: `colors`, `image_url`  
**INSERT**: полный набор полей

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
| `Chrys Bl` | Branch/Block | «Хризантема ветковая» (стандарт) |
| `Chrys Sa` | Santini | «Хризантема сантини» |
| `Chrys T` | Top (одноголовая) | «Хризантема одноголовая» |

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

## Известные проблемы Waterdrinker v2 (требуют доработки скрипта)

- `name` в JSONL содержит мусор ("Anthurium   ...") — сорт в `description`
- `L11` (стеблей в пачке) не читается → `pack_size` всегда `1`
- `supplier_ref` (`item.id`) не сохраняется
- Дефолтный путь в скрипте указывает на v1 (`waterdrinker_catalog.jsonl`)

---

## Дальнейший план: маппинг 1С → каталог

`supplier_ref` сохраняется для OZ-товаров — UUID из OZ Export.  
В будущем: при получении прайса с OZ для предзаказов джойнить по `supplier_ref`.

Для маппинга 1С ↔ каталог (разные названия):
1. **Ручная таблица синонимов** — `product_aliases(raw_name, product_id)`: XLS-импорт ищет алиас, потом `products.name`
2. **AI-маппинг** — при XLS-импорте вызывать LLM для нечёткого матчинга
3. **Нормализованный ключ** — `subcategory + сорт + длина` для обоих источников

Текущий временный механизм: XLS создаёт новый `products` с 1С-именем если совпадения нет → дубли.
