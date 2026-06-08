# Accessories: Smart Search + URL-шаринг + сортировка фильтра

**Дата:** 2026-06-08
**Прод:** VPS `109.235.118.214` (домен `uralskflowers.kz` — ждёт DNS), превью — Vercel `flowers-b2b-phi`
**Supabase project_id:** `jwastcmasactymmzojhi`

> Документ сверён с живой БД и кодом. Источник истины таксономии — `src/lib/category-tree.ts`.

---

## Что сделано (3 фичи)

### 1. Smart Search — синонимы для accessories
- Таблица `search_synonyms`: **59 строк = 34 цветочные (не тронуты) + 25 accessories**.
- `term` = **канон-slug листа** (совпадает с `category-tree.ts`). Это обязательно: `expand_search_query()` возвращает `term`, а `/api/products` матчит `subcategory.eq.<slug>`.
- Синонимы: разговорные, профессиональные, опечатки. Массивы дедуплицированы.
- Миграции: `accessories_search_synonyms` (v1, 20 строк) → `accessories_search_synonyms_v2` (25 строк, текущая). Идемпотентно: `DELETE WHERE category='accessories' + INSERT`, цветочные строки не затрагиваются.
- Зеркало в репозитории: `docs/accessories-search-synonyms.sql`.

Примеры (проверено через `expand_search_query`):
| Запрос | Находит |
|--------|---------|
| `горшек` (опечатка) | pots |
| `удбрение` / `удобренея` | fertilizers |
| `искуственные` | artificial |
| `агроволокно` / `спандбонд` | cover_fabric |
| `мишка` | toys |
| `флористическая плёнка` | film |

Сохранены из v1 (нет в новом списке, но есть подкатегории/товары — чтобы поиск не регрессировал): `growth_stim`, `dried`, `floral_foam`, `fillers`, `tools`.

**Не добавлено:** синонимы уровня **группы** («упаковка для цветов», «товары для сада»). У группы нет единственной подкатегории, текущий движок матчит по листу — групповой запрос не отфильтрует на все листья группы без доработки (см. «Дальше»).

### 2. URL-шаринг выбранных листьев
- `selectedLeaves` ⇄ URL: `/?category=accessories&leaves=film,paper,pots`.
- Реализация — `src/components/catalog/CatalogLayout.tsx`:
  - **чтение** при маунте (`urlInit` ref, один раз): `setCategory('accessories')` затем `setSelectedLeaves([...])` (порядок важен — `setCategory` чистит листья);
  - **запись** при смене `category`/`selectedLeaves` через `history.replaceState` на **реальном** `window.location.pathname` (каталог — `/`, не `/catalog`);
  - ничего не выбрано → параметры удаляются (URL = `/`).
- F5 и так сохраняет выбор (persist `selectedLeaves` в sessionStorage, версия 3).

### 3. Выбранные листья — вверх группы + разделитель
- `src/components/catalog/FilterPanel.tsx` → `AccessoriesLeaves`: внутри группы сначала выбранные, затем разделитель (только если есть и выбранные, и невыбранные), затем остальные. Порядок дерева внутри подгрупп сохраняется (курируемый, не алфавит).
- Лист виден ⟺ `count>0` ИЛИ выбран. Выбранные подсвечены (фон `var(--accent)`, белый текст). **Мульти-выбор** (менеджеры собирают наборы), не одиночный.

---

## Архитектура

### БД (Supabase)
```
search_synonyms (59):  34 цветочные + 25 accessories (term = slug листа)
expand_search_query(text) -> text[]:
  WHERE search_text ILIKE ANY(synonyms) OR term ILIKE search_text
  RETURN distinct( [search_text] + term + synonyms )
```

### API (Next.js 16)
```
POST /api/facets   in: {category, subcat, varietyType, subgroup, volumeRanges, onlyAvailable}
                   out: {subcatCounts, vtCounts, colorCounts, lengthCounts, originCounts, farmCounts, seasonCounts}
  • для accessories subcatCounts キ-ключи = leaf.slug (сумма по members)
  • счётчики НЕ сужаются выбором selectedLeaves (статичные на лист)

GET  /api/products ?search=...
  • expand_search_query(search) -> термы
  • name.ilike.%терм%  для всех; subcategory.eq.<терм>  только для slug-подобных (^[a-z0-9_]+$)
  • НЕ принимает ?leaves — фильтрация листьев клиентская (ProductGrid)
```

### Store (Zustand, `src/lib/filter-store.ts`)
```
selectedLeaves: string[]        // мульти-выбор листьев accessories (sessionStorage, persist v3)
subcat / varietyType: string    // одиночный выбор для cut/pot (не тронут)
facets: { subcatCounts, ... } | null
toggleLeaf(slug) / setSelectedLeaves(slugs[]) / clearLeaves()
loadFacets()  // зависит от category/subcat/varietyType/subgroup/volumeRanges/onlyAvailable (НЕ от selectedLeaves)
```

### Компоненты
```
src/app/page.tsx (SSR) → CatalogLayout (client)
  ├── FilterPanel
  │    ├── cut/pot: AccordionSubcats (одиночный subcat + variety)
  │    └── accessories: AccessoriesLeaves (мульти-выбор; выбранные вверх + разделитель)
  │         источник дерева — src/lib/category-tree.ts (6 групп → листья, members[])
  ├── ProductGrid  (фильтр: subcatInLeaves(p.subcategory, selectedLeaves))
  └── (CatalogLayout) URL sync: read on mount + write on change
```

### Источник истины — `src/lib/category-tree.ts`
6 групп → листья; `members[]` агрегируют 42 существующих `products.subcategory` без миграции данных. Хелперы: `leafForSubcat`, `labelForSubcat`, `unitForProduct`, `variantLabelForSubcat`, `subcatInLeaves`, `LEAF_BY_RAW_SUBCAT`, `LEAF_BY_SLUG`. Build-time ассерт: ровно 42 slug в members, без пересечений.

---

## End-to-end: менеджер собирает набор

1. Открывает `/` (категория accessories по умолчанию).
2. Раскрывает «Упаковка», ставит галки **Плёнка + Бумага** → URL `/?category=accessories&leaves=film,paper`; выбранные всплывают вверх группы.
3. Добавляет «Горшки» → URL `...&leaves=film,paper,pots`.
4. Копирует ссылку, шлёт клиенту (WhatsApp).
5. Клиент открывает → `CatalogLayout` читает URL → `setCategory('accessories')` + `setSelectedLeaves(['film','paper','pots'])` → видит тот же набор.
6. Клиент ищет «удобрение» → `expand_search_query` → `fertilizers` → `name.ilike` + `subcategory.eq.fertilizers` → находятся и товары без слова «удобрение» в названии (бренды типа Bona Forte).

> ⚠️ Счётчики листьев при шаге 2–3 **не** пересчитываются под текущий выбор — они статичные на лист (по всей категории). Динамический пересчёт — в «Дальше».

---

## Затронутые файлы / миграции

| Слой | Что |
|------|-----|
| БД | миграции `accessories_search_synonyms`, `accessories_search_synonyms_v2`; зеркало `docs/accessories-search-synonyms.sql` |
| API | `src/app/api/products/route.ts` (subcategory.eq для slug-термов); `src/app/api/facets/route.ts` (счётчики по leaf.slug) |
| Компоненты | `src/components/catalog/FilterPanel.tsx` (AccessoriesLeaves, сортировка); `CatalogLayout.tsx` (URL sync); `ProductGrid.tsx`, `DetailPanel.tsx`, `CartSidebar.tsx`, `Header.tsx` (единицы/лейблы/пилюля из источника) |
| Store/прочее | `src/lib/filter-store.ts` (selectedLeaves); `src/lib/category-tree.ts` (источник); `src/lib/filter-chips.ts`, `src/components/admin/AdminTable.tsx`, `src/app/product/[id]/page.tsx` (лейблы из источника) |

Коммиты в этой серии: `e6def60` (поиск по подкатегории), `c02ace8` (URL-шаринг), `828b3a0` (сортировка листьев), `d10acd4` (синк синонимов v2). Все деплои зелёные.

---

## Дальше (бэклог)

**Поиск/фильтры**
- Динамический пересчёт счётчиков под мульти-выбор (сейчас статичные).
- Subgroup-вкладки для accessories (типы бумаги/декора/защиты) — перестали показываться после перехода на мульти-выбор (были завязаны на одиночный `subcat`).
- Групповой поиск («упаковка для цветов» → все листья группы) — нужен multi-slug expand.
- Логи поисковых запросов → расширение синонимов по реальным данным.

**Каталог**
- Фасет `pot_diameter` (заполнено ~165/445) со скрытием при `count=0`.
- Headless-тесты: выбор листьев → URL; открытие ссылки → предвыбор; сброс → чистый URL.

**Данные (отдельные баги, вне этой серии)**
- `ProductEditModal`: нет списка подкатегорий accessories (`SUBCAT_ACC`) — ручная раскладка расходки.
- `source='1c_manual'` не виден на витрине (`/api/products` фильтрует `source IN ('uralsk_site','uralsk_1c')`).
