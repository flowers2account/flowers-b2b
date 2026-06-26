# Импорт остатков из XLS — Flowers B2B

> **Обновлено:** 2026-06-26 (сверено с `src/app/api/import-xls/*` и БД).  
> ⚠️ Прежняя версия описывала `batches`/`stock`/`sync_stock_from_1c` — всё удалено. Текущий импорт работает по **staging-схеме** (буфер → ревью → применение) поверх плоской таблицы `products`.

## Обзор

Импорт из XLS-выгрузок 1С — двухфазный, через буферную таблицу `stock_import_rows`. Это позволяет менеджеру проверить матчинг (что к какому товару привязалось) до записи в каталог. Клиент `createAdminClient()` (service-role) во всех роутах.

```
XLS  →  /api/import-xls (парсинг + матч + AI-обогащение)  →  stock_import_rows (буфер)
                                                                  │
                            ревью в UI: /api/import-xls/{pending,rows,match,create-product}
                                                                  │
        /api/import-xls/apply  →  UPDATE products (qty, price, is_active, обогащение)
                                                                  │
        /api/import-xls/finalize  →  категориальная деактивация отсутствующих
```

## Фаза 1 — парсинг и матчинг (`POST /api/import-xls`)

1. Парсит XLSX (`XLSX.read`), берёт строки `название / количество / цена`.
2. **Категория — по имени файла** (`fileCategory`):
   | В имени файла | category |
   |---|---|
   | `горшок`, `горш` | `pot` |
   | `сопут`, `упаков`, `расход` | `accessories` |
   | иначе | `cut` |
3. **Страна — по имени файла** (`countryFromText`): эквадор→EC, кения→KE, голланд→NL, китай→CN, и т.д.
4. **Подкатегория аксессуаров** — `getSubcatByKeyword()` по ключевым словам названия → канон-slug из `category-tree.ts` (набор.*коробок→`gift_boxes`, пакет→`film_bags`, плёнк/пленк→`cover_film`/`film`, бумаг/крафт/гофр→`paper`, краск→`paints`, кашпо→`kashpo`, горшок→`pots`, корзин→`baskets`, грунт→`soil`, удобрен→`fertilizers`, сухоцвет→`dried`, …). Неизвестное → `null` (строка скрыта).
5. **Матч товара** — по нормализованному имени `normName(s)` (`lowercase + trim + схлоп пробелов`):
   - приоритет 1: алиас из `stock_aliases` (`norm_name → product_id`);
   - приоритет 2: точное совпадение `products.name` (нормализованное);
   - иначе `matched_product_id = null`, `status = 'unmatched'`.
   - **Ключ матчинга — только имя/алиас.** Ни SKU, ни кода 1С.
6. **AI-обогащение** (для `cut`/`pot`, не для `accessories`): цвет, `species_id`, `country_iso`, `cultivar_cyrillic` (через Gemini/`translation_memory`).
7. Пишет строки в **`stock_import_rows`**: `import_id, raw_name, norm_name, qty, price, matched_product_id, status, match_source, file_category, file_country, enriched_*`. Прямого UPDATE `products` на этой фазе нет.
8. Дубликаты строк в одном файле **не схлопываются** — пишутся как есть (разбираются на ревью/apply).

## Ревью (UI)

| Роут | Назначение |
|---|---|
| `GET /api/import-xls/pending` | Список импортов со строками `unmatched`/`matched`, сгруппировано по `import_id` |
| `GET /api/import-xls/rows` | Полный снимок строк импорта (пагинация 1000/стр) + обогащение |
| `POST /api/import-xls/match` | Привязать/снять/пропустить строку → товар; апсертит алиас в `stock_aliases` |
| `POST /api/import-xls/create-product` | Создать новый товар из несматченной строки + алиас |

Все — гард `getAuthedWithRole(['admin','manager'])`.

## Фаза 2 — применение (`POST /api/import-xls/apply`)

Берёт сматченные строки буфера и обновляет `products`:
- пишет `qty`, `price`, `is_active = true`;
- сохраняет ручные правки (`arrival_date`, `length_cm`, `display_name`, `image_url` и т.п. не перезатираются);
- `previous_price` ← старая цена при снижении (тег «Акция»);
- обогащение (`colors`, `country_iso`, `subcategory`) пишется только если поле было пустым.

## Деактивация (`POST /api/import-xls/finalize`)

```json
{ "keepIds": [1,5,23,...], "categories": ["cut","pot"] }
```
Деактивирует (`is_active=false, qty=0`) только активные товары **тех категорий, что были в импорте**, отсутствующие в `keepIds`. Позволяет грузить срезку и горшечные раздельно без взаимного обнуления.

## Смежные пути импорта

- **1С-интеграция:** `POST /api/integrations/1c/stock` (гард `x-integration-secret`) — полный snapshot, авто-матч по коду/алиасу/имени, для `1c-ip` авто-apply.
- **Каталоги поставщиков:** скрипты `scripts/import-oz.mjs`, `scripts/import-waterdrinker.mjs` → `products` с `source='oz_catalog'/'waterdrinker'`, `is_active=false`, до прихода в 1С. См. `docs/CATALOG_IMPORT.md`, `docs/OZ_CATALOG_SYNC.md`.
- **OZ-предзаказы:** `POST /api/import-oz-preorder` (гард `x-import-secret`) — ключ `oz_product_code`.

## Что устарело

- ❌ `sync_stock_from_1c` / `batches` / `stock` — удалены (функция осталась в БД мёртвой).
- ⚠️ Раздел «Импорт из XLS» в `CLAUDE.md` описывает более ранний прямой upsert в `products`; фактический боевой путь — staging (`stock_import_rows`) выше. `finalize` (keepIds/categories) — общий для обоих.

Таблицы импорта: `stock_import_rows` (буфер), `stock_aliases` (алиасы матчинга), `imports`/`stock_apply_log` (журналы).
</content>
