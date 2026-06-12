# Внутреннее API ozexport.nl — карта служебных эндпоинтов

**Снято 12.06.2026** живой headed-сессией (Playwright + xvfb на VPS) под нашим
B2B-логином (customer unit `KZ-CVET`). У OZ нет публичной документации — это наша
внутренняя карта. Скрипты-разведчики: `scripts/oz-parser/oz_api_recon.py`,
`oz_api_forms.py`, `oz_diag_*.py`. Базовый префикс: `https://www.ozexport.nl/ozexport/ru/EUR`.

> ⚠️ Соблюдаем robots.txt OZ: Request-rate 1/10 с, Visit-time 00:00–04:00 UTC.
> Эта карта — для **понимания**, не для массового опроса. Любой автообход — только
> ночным окном с паузами (см. `docs/OZ_PRICE_REFRESH.md`).

## Главный вывод

1. **Стандартный SAP Commerce OCC REST у OZ ВЫКЛЮЧЕН.** Все пробы 404:
   `/occ/v2/ozexport/products/{code}`, `/products/{code}/stock`, `?fields=FULL`,
   `/rest/v2/...`, `/occ/v2/ozexportSite/...`. Типового документированного REST-пути
   нет — остаёмся на storefront-эндпоинте `/stockLines/availability`.

2. **Доступность привязана к дате вылета в серверной сессии, а не к параметру запроса.**
   В теле `/stockLines/availability` параметра даты НЕТ вообще. Выбранная дата живёт
   в HTTP-сессии (JSESSIONID); availability всегда отдаёт сток на *текущую дату сессии*.
   → Товар с пустым `allStockPdpMap` на дате X может иметь сток на дате Y.
   **Наши 84% деактивированных корректны для дефолтной даты сессии, но это не «нет товара
   совсем».** Цены с плашкой Grower Direct, которые менеджер видит на сайте, — вероятно,
   на другой выбранной дате вылета.

3. **`noOfPricesShown: 2` — константа конфигурации**, а НЕ признак скрытых цен.
   Приходит даже при пустом `allStockPdpMap`. (Ранняя гипотеза «=2 значит цены есть» — неверна.)

4. **Категорийный availability — батчевый.** Одна страница категории шлёт ОДИН POST со
   всеми line-id товаров и получает сток+цены пачкой. Это путь к ускорению парсера и
   меньшему числу запросов (1 на категорию вместо 1 на товар) — см. ниже.

---

## Эндпоинты

### 1. `POST /stockLines/availability` — сток и цены (ядро)

Единственный рабочий источник цены/остатка. Два режима по полю `stockLines`:

**Режим A — карточка (PDP):** одна или несколько line-id одного товара.
```
Content-Type: application/x-www-form-urlencoded
body: CSRFToken=<token>&stockLines=18010895255501_8&productType=&isFromSearch=false&sortBy=
```
Ответ: `{ allStockPdpMap: { <STOCK|VMP|PROMOTION>: [line, ...] }, errMsg, noOfPricesShown }`.
Если `stockLines` пуст ИЛИ у товара нет линий на дату сессии → `allStockPdpMap: {}`.

**Режим B — категория (батч):** перечень line-id многих товаров через запятую.
```
body: CSRFToken=<token>&stockLines=11033724040_36,11033722957_36,...,150195382020_21&...
```
Ответ: `{ products: [ { code, stock: {…одна линия…} }, … ], errMsg, noOfPricesShown }`.
Структура `stock` — та же, что элемент `allStockPdpMap[*]`.

**Структура линии** (ключевые поля, остальное null):
| Поле | Пример | Смысл |
|---|---|---|
| `type` | `VMP` / `STOCK` / `PROMOTION` | тип склада/поставки |
| `totalAvailableStockAmount` | `840` | доступно стеблей (источник правды) |
| `additionalStem` | `0` | россыпь сверх полных упаковок |
| `availableQuantity` | `14` | доступно упаковок |
| `piecesinUnit` | `60` | стеблей в упаковке (ведро/коробка) |
| `incrementalOrderQuantity` | `10` | кратность заказа (стеблей) |
| `startDate` | `1781254800000` | дата вылета (epoch ms) |
| `stockLineIdList` | `["18010895255501_8"]` | id линии (для cart/повторного availability) |
| `price.lowestFromPrice` | `0.43` | €/стебель (это число берёт наш парсер) |
| `price.bucketPrices` | `{"1":"€ 0,43"}` | цена за упаковку, форматированная |
| `price.lowestStemPrice` | `"€ 0,43"` | мин. цена за стебель, форматированная |
| `price.erpResponse[lineId][0]` | `{b2bPrices:[0.43], b2b2bPrices:[0.43], minimumOrderQuantity:[60]}` | ERP-цены B2B + MOQ |
| `price.defaultPackagingUnitCode` | `"520"` | код упаковки (VBN) |

Нормализатор: `scripts/oz-parser/oz_normalize.py`.

### 2. `POST /cart/update` — изменить позицию корзины

Форма `update_cart_form`. Поля:
`entryNumber, productCode, initialQuantity, buckets, stems, piecesInUnit,
incrementalOrderQuantity, stockLineType, quantityStems, quantityBuckets,
quantityAlternative, quantity, erpResponse, isBucketAdded, isAlternativeOrderAdded,
isStemAdded`. `erpResponse` передаётся JSON-строкой с ценами линии.

### 3. `POST /{productUrl}/p/{code}` — добавить в корзину

Форма `addToCartForm{code}` (action = URL самой карточки). Поля:
`productCodePost, productNamePost, productPostPrice, qty, isBucketAdded,
isAlternativeOrderAdded, isStemAdded, CSRFToken`. Кнопка добавления на PDP скрыта,
пока не введено количество для линии (поэтому слепой клик в headless не срабатывает).

### 4. `POST /view/SelectSubunitComponentController/sessionSet` — выбор субъюнита

Поля: `selectedCustomerUnitName` (у нас `KZ-CVET`), `selectedCustomerUnit`, `CSRFToken`.
Подтверждает: сессия — авторизованный B2B-аккаунт нашего юнита (важно для валидности цен).

### 5. Прочее
| Эндпоинт | Назначение |
|---|---|
| `GET /cart` | страница корзины (`?showSuccessMsg=true` после добавления) |
| `POST /_s/language` | смена языка (`code`, `CSRFToken`) |
| `GET /search/?text=` | поиск |
| `GET /login/updateUserLoggedInToFalse` | внутренний тоггл состояния сессии; **не разлогинивает** — B2B-цены продолжают приходить. Имя обманчиво, тревоги не требует |
| `POST /.../p/{code}/review` | отзыв о товаре (не используем) |

### CSRF
`CSRFToken` есть на каждой странице: `input[name=CSRFToken]` (или `ACC.config.CSRFToken`).
Один токен валиден для всех POST в рамках загрузки страницы. Все мутации (cart, language,
subunit, availability) его требуют.

### Cookies
Именованной cookie с датой вылета НЕТ (`date/day/depart/delivery` — пусто). Дата и выбранный
субъюнит — в серверной сессии (JSESSIONID из `oz_state.json`).

---

## Что это даёт парсеру (бэклог, не реализовано)

1. **Батч по категориям вместо обхода карточек.** Пройти дерево категорий, на каждой
   странице снять `products[]` из батч-availability → резко меньше запросов (1/категория),
   проще уложиться в окно robots.txt. Минус: нужно собрать дерево категорий и их URL.

2. **Перебор дат вылета.** Чтобы не терять товары, доступные не на дефолтную дату:
   ставить дату в сессии (механизм через модалку/reload — захвачен частично, отдельного
   XHR с датой нет; дата применяется на уровне сессии) и повторять availability. Это
   умножает число запросов на число дат — взвесить против robots.txt.

3. **MOQ и кратность из ERP.** `erpResponse[lineId][0].minimumOrderQuantity` +
   `incrementalOrderQuantity` — для корректных лимитов предзаказа на витрине.
