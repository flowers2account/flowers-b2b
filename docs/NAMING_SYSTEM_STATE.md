# Состояние системы нейминга на витрине Flowers B2B

> **Snapshot БД**: 25 мая 2026 (live данные из Supabase project `jwastcmasactymmzojhi`)
> **Автор**: совместный анализ с Claude
> **Назначение**: единый источник правды по тому, как сейчас именуются товары на витрине, какие поля используются, где дубли, где разрывы.

---

## 0. Контекст

Платформа B2B оптовой торговли цветами обслуживает 60+ флористических магазинов в Уральске. Поставщики: Голландия (RFH), Эквадор, Колумбия, Кения, Эфиопия, Китай, Турция, Израиль, Италия, ОАЭ, Россия.

В системе **параллельно** живут две подсистемы работы с именами товаров — они **не связаны друг с другом**, и это корневая причина пересорта:

1. **Витрина** (`products`, `varieties`, `flower_types`) — то, что видит флорист
2. **AI-переводчик** (`translation_memory`, `species`, `characteristic_*`) — переводит инвойсы поставщиков в кириллицу для импорта в 1С

Цель этого документа — зафиксировать текущее состояние перед интеграцией двух систем.

---

## 1. Сводка по таблицам

| Таблица | Записей | Назначение | Подсистема |
|---------|---------|------------|------------|
| `products` | 655 | Товары на витрине (то, что заказывает флорист) | Витрина |
| `varieties` | 541 | Сорта (Red Naomi, Эксплоуер, Барб Уилл) | Витрина |
| `flower_types` | 10 | Старый справочник видов | Витрина (легаси) |
| `species` | 25 | Новый справочник видов с VBN group codes | Переводчик |
| `translation_memory` | 127 | Переводы латиница → кириллица | Переводчик |
| `characteristic_colors` | 14 | Канонические цвета (S50-002 = белый) | Переводчик |
| `characteristic_countries` | 13 | Канонические страны (S62-EC = Эквадор) | Переводчик |
| `characteristic_lengths` | 9 | Канонические длины | Переводчик |
| `stop_words` | 17 | Мусор для очистки имён | Переводчик |
| `search_synonyms` | 34 | Синонимы для поиска | Витрина |
| `batches` | 4969 | Партии (стоковые приходы) | Витрина |
| `imports` | 0 | Лог импорта XLS (не используется) | — |

---

## 2. Схема `products` — текущая (32 поля)

```sql
products (
  id                   integer NOT NULL,
  variety_id           integer,
  category             product_category NOT NULL DEFAULT 'cut',  -- enum: cut | pot
  name                 text NOT NULL,             -- raw имя из 1С
  length_cm            integer,
  pot_diameter         numeric,
  pack_size            integer NOT NULL DEFAULT 1,
  unit                 text NOT NULL DEFAULT 'шт',
  image_url            text,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL,
  variety_name         text,                      -- legacy дубль varieties.name
  length_str           text,                      -- "40", "75-80", "100-55"
  previous_price       numeric,
  color                text,                      -- legacy, заменён на colors[]
  subcategory          text,
  description          text,
  images               text[],
  tags                 text[],
  origin               text,                      -- "china", "ecuador" (не ISO)
  pot_size             text,                      -- не используется (0/655)
  variety_type         text,
  floral_role          text,
  stem_durability      text,
  season               text,
  colors               text[],                    -- ["red", "white"]
  normalized_slug      text,                      -- 5/655 (почти не используется)
  search_aliases       text[] DEFAULT '{}',
  stems_per_pack       integer,                   -- 0/655 NULL
  campaign_image_url   text,
  arrival_date         date
)
```

### Заполненность полей (live data)

| Поле | Заполнено | % | Замечание |
|------|-----------|---|-----------|
| `name` | 655/655 | 100% | Raw имя из 1С |
| `variety_name` | 655/655 | 100% | Дубль varieties.name |
| `variety_id` | 655/655 | 100% | Все привязаны |
| `pack_size` | 655/655 | 100% | Всегда =5 (дефолт) |
| `search_aliases` | 655/655 | 100% | Часто пустые массивы |
| `length_cm` | 295/655 | 45% | Только у тех, где длина одна цифра |
| `length_str` | 295/655 | 45% | Дубль length_cm как text |
| `origin` | 356/655 | 54% | "china", "ecuador" — НЕ ISO |
| `colors` (array) | 330/655 | 50% | Канонический |
| `color` (text) | 89/655 | 14% | **Дубль colors[]** |
| `normalized_slug` | 5/655 | <1% | Заброшено |
| `stems_per_pack` | 0/655 | 0% | Не заполняется |
| `pot_diameter` | 0/655 | 0% | Не заполняется |
| `pot_size` | 0/655 | 0% | Не заполняется |

---

## 3. Реальные примеры имён на витрине (топ-25)

```
id    name                                         variety_name                   length_str  length_cm  origin   colors
2673  эксплоуер 80                                 Эксплоуер                      80          80         NULL     NULL
2672  эксплоуер 50                                 Эксплоуер [425₸]               50          50         NULL     NULL
2671  чико типея 70                                Чико типея                     70          70         NULL     NULL
2664  фисташка корт 50                             Фисташка корт                  50          50         NULL     NULL
2663  тибет 50                                     Тибет                          50          50         NULL     NULL
2662  рускус 80                                    Рускус                         80          80         NULL     NULL
2661  ромашка/ танацетум камерон/ сингл вегмо      то же самое целиком            NULL        NULL       NULL     NULL
2660  роза ветковая сильва пинк 70                 Роза ветковая сильва пинк      70          70         NULL     NULL
2659  ред пантера 40                               Ред пантера                    40          40         NULL     NULL
2658  ранункулюс шамалоу 50/58 розовый             то же самое целиком            NULL        NULL       NULL     NULL
2657  ранункулюс маршмеллоу 45/30 розовый          то же самое целиком            NULL        NULL       NULL     NULL
2656  протея карнивал 70                           Протея карнивал                70          70         NULL     NULL
2655  прауд 50                                     Прауд [425₸]                   50          50         NULL     NULL
2645  лилия ор замбези 100/55                      Лилия ор замбези               100-55      78         NULL     NULL
2644  лилия ла скотланд 90/55                      Лилия ла скотланд              90-55       73         NULL     NULL
2635  роза спрей софи бейби А класс 75-80          ...                            NULL        NULL       china    NULL
2634  роза спрей ред пиано 70-75                   ...                            NULL        NULL       china    NULL
2237  Бамбук Китай                                 ...                            NULL        NULL       NULL     [green]
257   роза ветковая салинеро 60                    ...                            60          60         NULL     [orange,yellow,peach]
943   клузия принцесс 55  17                       ...                            NULL        NULL       NULL     [green,cream]
2267  ирис касабланка бел                          ...                            NULL        NULL       NULL     [white]
```

### Наблюдения

1. **Большинство имён — то, как ввёл менеджер в 1С**: lowercase, без страны, длина в конце цифрой.
2. **Цена иногда попала в variety_name** (`Эксплоуер [425₸]`, `Прауд [425₸]`) — баг.
3. **Длина не парсится при сложном формате**: `90/55` (лилия — длина 90, бутон 55) → `length_cm = 73` (среднее? битый парсер).
4. **Длинные имена не парсятся**: `ромашка/ танацетум камерон/ сингл вегмо` — целиком в variety_name.
5. **Страна почти всегда отсутствует**: 54% origin = "china"/"ecuador", остальное null.
6. **Цвета частично заполнены** (50%) — но в формате массива `["green","cream"]`, а у некоторых **дублируется** в text-поле `color`.

---

## 4. Критическая проблема: дубли товаров

Запрос (группировка по нормализованному имени, игнорируя длину):

```sql
WITH cleaned AS (
  SELECT id, name, lower(regexp_replace(name, '\s+\d+(\W|$).*$', '', 'g')) AS base
  FROM products WHERE is_active = true
)
SELECT base, count(*), array_agg(name)
FROM cleaned GROUP BY base HAVING count(*) > 1 ORDER BY count(*) DESC;
```

Результат (топ-10):

| Base | Кол-во | Примеры имён |
|------|--------|--------------|
| `эксплоуер` | **16** | "эксплоуер 60", "эксплоуер 40", "эксплоуер 50" (×4!), "Эксплоуер 40 см", "Эксплоуер 50 см" |
| `пинк флойд` | **12** | "пинк флойд 70", "Пинк Флойд 75-80 см Китай", "пинк флойд 50" (×2), "Пинк флойд 60 см" |
| `рускус` | 9 | "рускус 80", "Рускус 70 см", "рускус 50" (×2) |
| `прауд` | 6 | "прауд 40", "прауд 50" (×4) |
| `ред пантера` | 6 | "ред пантера 40", "Ред пантера 90 см", "ред пантера 90" (×2) |
| `тибет` | 5 | "тибет 50", "Тибет 40/50 см", "тибет 40" (×2) |
| `кантри блюз` | 4 | "кантри блюз 40" (×3), "Кантри блюз 40 см" |

### Что показывают дубли

- **Один и тот же товар** (например, «Эксплоуер 50см») существует **в 4 экземплярах** с одной длиной.
- Разные форматы: `"эксплоуер 50"` vs `"Эксплоуер 50 см"` — разный регистр, разный суффикс.
- Часть дублей с китайским происхождением: `"Пинк Флойд 75-80 см Китай"` отдельно от `"пинк флойд 70"`.
- Это значит: при импорте остатков система **не находит существующий товар** и создаёт новый. Менеджер тоже создаёт вручную.

**Это и есть та "пересортица", про которую ты говорил.**

---

## 5. Схема `varieties` (541 запись)

```sql
varieties (
  id              integer NOT NULL,
  name            text NOT NULL,
  color           text,
  origin_country  text,
  flower_type_id  integer,       -- legacy → flower_types
  category        text,
  image_url       text,
  is_active       boolean NOT NULL,
  created_at      timestamptz NOT NULL
)
```

### Заполненность

- `name`: 100% — имя сорта на кириллице (например, "Эксплоуер", "Ред Наоми")
- `flower_type_id`: **0/541** — все NULL, связи с видом нет
- `color`, `origin_country`: частично

**Ключевая проблема**: `varieties` не привязан ни к `species`, ни к `flower_types`. То есть сорт существует "сам по себе", без вида.

---

## 6. Схема `species` (25 записей) — справочник видов

```sql
species (
  id              integer NOT NULL,
  code            text NOT NULL,       -- 'rose_large_flowered'
  name_ru         text NOT NULL,       -- 'Роза одноголовая'
  name_ru_abbrev  text,                -- 'однг'
  name_en         text NOT NULL,
  category        text,                -- 'cut' | 'pot'
  vbn_group       text                 -- '10101' (VBN group code)
)
```

### Все 25 species

| id | code | name_ru | abbrev | category | VBN |
|----|------|---------|--------|----------|-----|
| 1 | rose_large_flowered | Роза одноголовая | однг | cut | 10101 |
| 2 | rose_spray | Роза кустовая | куст | cut | 10101 |
| 3 | rose_garden | Роза пионовидная | пион | cut | 10101 |
| 4 | chrysanthemum_disbud | Хризантема одноголовая | однг | cut | 10401 |
| 5 | chrysanthemum_spray | Хризантема ветковая | ветк | cut | 10401 |
| 6 | chrysanthemum_santini | Хризантема сантини | сант | cut | 10401 |
| 7 | lily_la | Лилия ла-гибрид | ла | cut | 10501 |
| 8 | lily_oriental | Лилия восточная | от | cut | 10501 |
| 9 | lily_longiflorum | Лилия лонгифлорум | лонг | cut | 10501 |
| 10 | gerbera | Гербера | | cut | 10201 |
| 11 | tulip | Тюльпан | | cut | 10301 |
| 12 | carnation | Гвоздика | | cut | 10601 |
| 13 | eustoma | Эустома | | cut | 10701 |
| 14 | alstroemeria | Альстромерия | | cut | 10801 |
| 15 | hydrangea | Гортензия | | cut | 10901 |
| 16 | peony | Пион | | cut | 11001 |
| 17 | ranunculus | Ранункулюс | | cut | 11101 |
| 18 | freesia | Фрезия | | cut | 11201 |
| 19 | anthurium | Антуриум | | cut | 11301 |
| 20 | gypsophila | Гипсофила | | cut | 11401 |
| 21 | eucalyptus | Эвкалипт | | cut | 10701 |
| 22 | ruscus | Рускус | | cut | 10702 |
| 23 | pittosporum | Питтоспорум | | cut | 10703 |
| 24 | monstera | Монстера | | cut | 10704 |
| 25 | orchid_phalaenopsis | Фаленопсис | | pot | 20105 |

**Богатая структура, но не используется витриной** — `products` не знает про `species`.

---

## 7. Канонические справочники

### `characteristic_colors` (14)
```
S50-002  белый        white       #FFFFFF
S50-003  красный      red         #FF0000
S50-005  желтый       yellow      #FFFF00
S50-007  оранжевый    orange      #FFA500
S50-009  зеленый      green       #008000
S50-010  синий        blue        #0000FF
S50-011  фиолетовый   purple      #800080
S50-012  розовый      pink        #FFC0CB
S50-013  кремовый     cream       #FFFDD0
S50-014  персиковый   peach       #FFE5B4
S50-015  лавандовый   lavender    #E6E6FA
S50-016  тёмно-красный dark red    #8B0000
S50-089  абрикосовый  apricot     #FBCEB1
S50-124  марсала      marsala     #964F4C
```

### `characteristic_countries` (13)
```
S62-AE  AE  ОАЭ          UAE
S62-CN  CN  Китай        China
S62-CO  CO  Колумбия     Colombia
S62-EC  EC  Эквадор      Ecuador
S62-ET  ET  Эфиопия      Ethiopia
S62-FR  FR  Франция      France
S62-IL  IL  Израиль      Israel
S62-IT  IT  Италия       Italy
S62-KE  KE  Кения        Kenya
S62-KZ  KZ  Казахстан    Kazakhstan
S62-NL  NL  Голландия    Netherlands
S62-RU  RU  Россия       Russia
S62-TR  TR  Турция       Turkey
```

### `stop_words` (17)
```
LINFLOWERS, zento  — commercial префиксы
2кор, box, bunch, cor, pcs, pieces, st, stem, stems  — packaging
A1, A2, Premium, Select, Standard, оф  — quality
```

---

## 8. `translation_memory` (127) — AI-переводчик инвойсов

### Схема

```sql
translation_memory (
  id                      uuid NOT NULL,
  original                text NOT NULL,            -- "Pelargonium zona. 'Cast Isab White'"
  translated              text NOT NULL,            -- "пеларгония зональная 'каст изабель вайт'"
  normalized_original     text NOT NULL,
  normalized_translated   text,
  cultivar_latin          text,                     -- 0/127 NULL
  cultivar_cyrillic       text,                     -- 0/127 NULL
  species_id              integer,                  -- 47/127
  species_type            text,
  category                text,                     -- 0/127 NULL
  color                   text,                     -- 32/127
  country_iso             text,                     -- 47/127
  length_cm               integer,                  -- 5/127 (почти не работает!)
  confidence              numeric,
  source                  text,                     -- 'ai' | 'manual'
  usage_count             integer,
  -- модерация
  is_flagged              boolean,
  flagged_reason          text,
  flagged_by              uuid,
  flagged_at              timestamptz,
  approved_by             uuid,
  approved_at             timestamptz,
  last_used_at            timestamptz,
  created_at              timestamptz
)
```

### Заполненность полей (важно для понимания, что AI извлекает)

| Поле | Заполнено | % | Замечание |
|------|-----------|---|-----------|
| original, translated, normalized_* | 127/127 | 100% | Базовый перевод работает |
| confidence | 127/127 | 100% | Обычно 0.90–0.95 |
| country_iso | 47/127 | 37% | Извлекается частично |
| species_id | 47/127 | 37% | Привязка к виду частична |
| color | 32/127 | 25% | Извлекается слабо |
| length_cm | 5/127 | **4%** | Почти не извлекается |
| cultivar_latin | 0/127 | **0%** | Не используется вовсе |
| cultivar_cyrillic | 0/127 | **0%** | Не используется вовсе |
| category | 0/127 | **0%** | Не заполняется |

### Реальные примеры переводов

```
"Taxus baccata"                          → "тис ягодный"           (confidence 0.95)
"Pelargonium zona. 'Cast Isab White'"    → "пеларгония зональная 'каст изабель вайт'" (color=white, country=IT)
"Pelargonium zona. ..."                  → "пеларгония зональная"  (без атрибутов)
"Oxalis trian. 'Mijke'"                  → "оксалис треугольный 'мийке'" (country=KE)
"Juniperus squamata 'Blue Star'"         → "можжевельник чешуйчатый 'блю стар'" (color=blue, country=RU)
"Dracaena marg."                         → "драцена маргината"     (country=AE)
"Conifers ...mix"                        → "кониферен микс 35"     (manual, country=CO)
"Spathiphyllum 'Strauss'"                → "спатифиллум 'штраус'"  (country=TR)
"Spathiphyllum 'Pearl Cupido'"           → "спатифиллум 'перл купидо'"
```

### Связь с витриной

**Никакой.** В `translation_memory` нет `product_id` или `variety_id`. То есть AI переводит, но **результат никак не попадает в каталог витрины**.

---

## 9. Как сейчас отображается имя на витрине

UI берёт **`products.name`** как есть (raw имя из 1С). Никакой генерации, никакой канонизации, никакого fallback.

Что видит флорист:
- ❌ `"эксплоуер 50"` (нижний регистр)
- ❌ `"Эксплоуер 50 см"` (тот же товар, другая запись)
- ❌ `"Пинк Флойд 75-80 см Китай"` (длинная форма)
- ❌ `"ромашка/ танацетум камерон/ сингл вегмо"` (косая черта, спецсимволы)
- ❌ `"Кактус Микс 104 (D-15; H-18)"` (горшок с параметрами в скобках)

**Нет единого формата.** Каждая запись выглядит по-разному.

---

## 10. Целевая система (для понимания вектора)

После интеграции витрина должна показывать:
- ✅ `"Роза однг эксплоуер 50см"` (по шаблону)
- ✅ `"Роза однг пинк флойд КИТАЙ 75см"` (со страной, когда есть)
- ✅ `"Танацетум камерон ЭФИОПИЯ"` (без слэшей и хлама)
- ✅ `"Кактус микс ⌀15 h18"` (горшечные с параметрами)

Шаблон: `{species.name_ru} {species.name_ru_abbrev} {variety.name} {country_ru?} {length}см`

Источники полей:
- `species.name_ru` ← через `varieties.species_id` (пока NULL — нужно заполнить)
- `species.name_ru_abbrev` ← из того же справочника
- `variety.name` ← уже есть
- страна ← из `characteristic_countries` по `country_iso`
- длина/диаметр горшка ← из products

---

## 11. Корневые проблемы (root causes)

### P1. Две системы не связаны
`translation_memory` (переводчик) и `products` (витрина) — изолированы. AI переводит инвойсы для 1С, но эти переводы не обогащают витрину.

### P2. `varieties` не привязан к `species`
541 сорт существует без вида. Шаблон display_name невозможно собрать, потому что неизвестно «это роза или хризантема».

### P3. Дубли полей в products
- `color` vs `colors[]`
- `length_cm` vs `length_str`
- `pot_size` vs `pot_diameter`
- `variety_name` vs `varieties.name`

Менеджеры/импорты пишут в разные поля → данные расщепляются.

### P4. Имя — raw из 1С, без канонизации
`products.name` = что ввёл бухгалтер в 1С. При импорте парсер не нормализует, не lookup'ит существующий товар, не дедуплицирует.

### P5. Происхождение в свободной форме
`origin = "china"/"ecuador"` вместо ISO. Не связано с `characteristic_countries`.

### P6. Длина парсится плохо для сложных форматов
`"100/55"` → `length_cm=78` (видимо, среднее) вместо двух полей.

### P7. `pack_size` всегда 5 по дефолту
Не отражает реальную упаковку от поставщика. `stems_per_pack` — пустое поле.

---

## 12. Что НЕ нужно делать (защита от плодения полей)

При интеграции систем **запрещено**:

- ❌ Создавать новые таблицы для имён (`display_names`, `product_translations` и т.д.)
- ❌ Добавлять третье поле для цвета (`color_canonical`, `display_color`)
- ❌ Дублировать справочники (есть `species` — не создавать `flower_kinds`)
- ❌ Хранить готовое display_name в `translation_memory` (генерируется триггером в `products`)
- ❌ Подгружать ARS Modern Roses / KAVB / 7flowers как seed (на масштабе 655 SKU не оправдано)

---

## 13. Минимально необходимые изменения (план)

```sql
-- 1. Связать витрину с переводчиком (2 поля)
ALTER TABLE translation_memory
  ADD COLUMN product_id INTEGER REFERENCES products(id),
  ADD COLUMN variety_id INTEGER REFERENCES varieties(id);

-- 2. Связать сорт с видом (1 поле)
ALTER TABLE varieties
  ADD COLUMN species_id INTEGER REFERENCES species(id);

-- 3. Готовое отображаемое имя на витрине (1 поле)
ALTER TABLE products
  ADD COLUMN display_name TEXT;

-- 4. Упаковка из инвойса в translation_memory (2 поля)
ALTER TABLE translation_memory
  ADD COLUMN pack_size INTEGER,
  ADD COLUMN stems_per_pack INTEGER;

-- 5. ISO-код страны на витрине (1 поле, опционально)
ALTER TABLE products
  ADD COLUMN country_iso TEXT;
```

**Итого: 7 полей, 0 новых таблиц.**

Плюс расширение AI-переводчика, чтобы он:
- Заполнял `cultivar_latin`, `cultivar_cyrillic`, `category`, `pack_size`, `stems_per_pack`
- Искал/создавал `variety_id` и `product_id`
- Привязывал результат к витрине

Плюс SQL-функция `generate_display_name(product_id)` + триггер на products.

---

## 14. Метрики «до» для замеров улучшений

Замерь эти метрики ДО любых изменений, чтобы потом сравнить:

| Метрика | Сейчас | Цель |
|---------|--------|------|
| Товаров на витрине | 655 | 400–500 после дедупа |
| Дублей (одно имя сорта × длина в нескольких записях) | ~120 | 0 |
| `products.colors` заполнено | 50% | 90% |
| `products.country_iso` заполнено | — (поля нет) | 80% |
| `varieties.species_id` заполнено | 0% | 95% |
| `translation_memory.product_id` заполнено | — (поля нет) | 90% |
| Имена в формате «{вид} {сорт} {страна} {длина}см» | ~0% | 95% |

---

## 15. Что использовать в будущей работе

Когда будешь работать с этой темой — **открой этот файл первым**. Он отвечает на:

- Что у нас уже есть?
- Какие поля заполняются, какие — нет?
- Где живут справочники?
- Что считается дублем?
- Что **не делать** при добавлении новых полей?

**Этот файл нужно обновлять** после каждой структурной миграции (новые поля, удаление дублей, миграция данных).

---

## Приложение A. Связанные документы

- `TRANSLATION_SYSTEM_DOCUMENTATION.md` — детали AI-переводчика
- `PROJECT_STATUS.md` — общий статус проекта
- `CLAUDE.md` — журнал сессий разработки
- Исследование global naming practices — отдельный артефакт (B2B Flower Catalog Naming and Structure)

## Приложение B. SQL-запросы для повторного снятия snapshot

```sql
-- Заполненность полей products
SELECT count(*) as total,
  count(color) as has_color_text,
  count(colors) as has_colors_array,
  count(origin) as has_origin,
  count(length_cm) as has_length_cm,
  count(stems_per_pack) as has_stems_per_pack
FROM products;

-- Дубли по нормализованному имени
WITH cleaned AS (
  SELECT id, name,
    lower(regexp_replace(name, '\s+\d+(\W|$).*$', '', 'g')) AS base
  FROM products WHERE is_active = true
)
SELECT base, count(*), array_agg(name)
FROM cleaned GROUP BY base HAVING count(*) > 1 ORDER BY count(*) DESC;

-- Заполненность translation_memory
SELECT count(*) as total,
  count(color) as has_color,
  count(country_iso) as has_country,
  count(length_cm) as has_length,
  count(cultivar_latin) as has_cultivar_latin,
  count(species_id) as has_species_id
FROM translation_memory;

-- Все species
SELECT id, code, name_ru, name_ru_abbrev, name_en, category, vbn_group
FROM species ORDER BY id;
```

---

*Документ создан 25.05.2026 для project knowledge и репозитория `flowers2account/flowers-b2b`.*
