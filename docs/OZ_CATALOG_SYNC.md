# OZ-каталог — полный сбор справочника (parser_oz_catalog)

Разовый (по факту — за 2–3 ночи) полный обход раздела «Цветы» OZ (48 категорий) под
B2B-сессией с автозаливкой карточек в `products` (`source='oz_catalog'`). Цена/остаток
сюда НЕ пишутся — их подставляет ночной `oz_price_refresh.py` (см. `docs/OZ_PRICE_REFRESH.md`),
он сам подхватит новые карточки, как только у них появится `source_url`.

Цель прогона: вырастить `oz_catalog` с ~1334 до ~8–10к карточек. Таймер НЕ включается —
запуск только вручную в окне robots.txt.

## ⚠️ Дата вылета — обязательна и определяет ассортимент

Листинг категорий и наличие зависят от **даты вылета в сессии** (см. `docs/OZ_INTERNAL_API.md`).
Парсер первым делом:
1. читает `app_settings.oz_target_departure_date` (не хардкод);
2. ставит её в сессии через `oz_departure.set_departure_date()` (эндпоинт `updateDepartureDate`);
3. проверяет, что применилась (поле `.js-show_date`); **не применилась → СТОП + WhatsApp**,
   без парсинга (иначе соберём дефолтную дату как мусор).

Каждой карточке ingest проставляет `oz_departure_date = <целевая дата>` (метка консистентности).
**OZ принимает только будни** — если в `app_settings` выходной, парсер останавливается.
Текущая цель: **2026-06-29** (понедельник). Сменить — обновить `app_settings.oz_target_departure_date`
на будний день.

### Бэклог: лилии/герберы на смешанной дате
Lilium (≈150) и Gerbera-Germini (≈450) залиты с десктопа, спарсенного на ДРУГУЮ дату
(дату, что стояла в браузере при парсинге). Для консистентности их надо **перепарсить на
2026-06-29**: удалить `output/Lilium.jsonl` и `output/Gerbera-Germini.jsonl` на VPS и дать
парсеру пройти их заново (без `--skip-done` по ним). Пока оставлены как есть.

## Состав на VPS (`/opt/oz-parser/`)

| Файл | Назначение |
|---|---|
| `parser_oz_catalog.py` | парсер каталога: обход категорий, пагинация, характеристики |
| `oz_catalog_ingest.py` | заливка `output/<кат>.jsonl` → `products` (upsert по `oz_product_code`) |
| `categories.txt` | 48 ссылок категорий (по одной на строку) |
| `oz_state.json` | B2B-сессия OZ (обновляется с десктопа перед прогоном) |
| `output/` | jsonl по категориям + `_bad_urls.txt`, `_failed.txt` |
| `.env` | `SUPABASE_URL/SERVICE_KEY`, `UMNICO_*` (общий с ценовым парсером) |

Логи: `/var/log/oz-catalog-sync/YYYY-MM-DD.log` (+ `journalctl -u oz-catalog-sync`).
Сервис: `/etc/systemd/system/oz-catalog-sync.service` (oneshot, **без таймера**).

## Правила robots.txt (соблюдаются)

- **Request-rate 1/10** → пауза 8–10 с между карточками товаров.
- **Visit-time 00:00–04:00 UTC = 05:00–09:00 Asia/Oral** → запускать так, чтобы работа
  шла в этом окне. Дедлайн **08:45 Oral**: перед каждой категорией и внутри цикла
  товаров проверяется время; не успеваем — частичный jsonl НЕ пишется, парсер корректно
  выходит, продолжение следующей ночью через `--skip-done`.

Полный объём ≈ 8–10к товаров × ~10 с ≈ **3 ночи**. Это нормально и заложено в дизайн.

## Как запустить (вечерний/ночной старт в окне)

1. **Обновить сессию** (обязательно — без логина OZ режет ассортимент, напр. Anthuriums 72 vs 483):
   ```bash
   # на десктопе:
   cd Desktop/oz-parser-new && python oz_login.py     # залогиниться в открывшемся браузере
   scp -i deploy_vps.key oz_state.json deploy@109.235.118.214:/opt/oz-parser/
   ssh -i deploy_vps.key deploy@109.235.118.214 "chmod 600 /opt/oz-parser/oz_state.json"
   ```
2. **Старт** (в окне 05:00–09:00 Oral; на старте парсер сам проверит, что сессия залогинена):
   ```bash
   ssh -i deploy_vps.key deploy@109.235.118.214
   sudo systemctl start oz-catalog-sync.service
   journalctl -u oz-catalog-sync.service -f          # следить за ходом
   ```
   Если сессия протухла — парсер не начнёт и пришлёт WhatsApp «сессия протухла».

## Продолжение после обрыва / выхода из окна

Та же команда: `sudo systemctl start oz-catalog-sync.service`. Флаг `--skip-done`
(зашит в сервис) пропустит категории с уже готовым непустым `output/<кат>.jsonl` и
продолжит с недоделанных. Прерванная на полпути категория jsonl не пишет — переделается
начисто. Повторять по ночам, пока WhatsApp не пришлёт финал «48/48».

## WhatsApp-отчёты

По каждой категории: `[7/48] Gerbera-Germini ✓ спарсено 511, залито: +450 новых,
~61 обновлено` + первые ~10 оставшихся категорий. Особые случаи: `⚠ URL пуст/не открылся`,
`⚠ ошибка, повторю в конце`, `⏰ остановился на <кат>` (дедлайн), финал
`✅ проход завершён … спарсено X`.

## Фолбэки

- **URL категории 404/пусто** → строка в `output/_bad_urls.txt`, WhatsApp ⚠, идём дальше.
  Коды `/c/...` у новых категорий (Everlasting/Seasonal: Alchemilla, Allium, Campanula,
  Celosia, Dahlia, Fritillaria, Helianthus, Lathyrus, Artificial-Flowers) построены по
  шаблону и могут не совпасть — это ожидаемо, поправить точечно (см. ниже).
- **Ошибка в середине категории** → строка в `output/_failed.txt`, WhatsApp ⚠, после
  основного прохода — один повторный проход по упавшим. Снова упало → финальный алерт
  «не справился: X, Y».

### Как поправить URL категории

Открыть нужную категорию на сайте OZ в браузере, скопировать её `/c/<КОД>`-ссылку,
заменить строку в `/opt/oz-parser/categories.txt`. Удалить ошибочную строку из
`output/_bad_urls.txt` и перезапустить сервис (`--skip-done` доберёт только её).

## Заливка в БД (oz_catalog_ingest.py)

Upsert по `oz_product_code`, строго `source='oz_catalog'`.
- **INSERT новых**: `source=oz_catalog, category=cut, is_active=true, qty=999, price=999`
  (заглушки — ценовой парсер подменит), `display_name=name` (латиница временно, AI-перевод —
  отдельной задачей), `subcategory` по маппингу, + `name, image_url, length_cm, colors,
  country_iso, farm, stems_per_pack, pack_size, container_code, quality_grade, source_url`.
- **UPDATE существующих** — строгий whitelist: `source_url, container_code, quality_grade,
  farm, length_cm, colors, country_iso, stems_per_pack, pack_size, image_url`.
  **Никогда не трогает**: `display_name` (в БД ~1333 русских перевода!), `subcategory,
  name, is_active, qty, price`.
- Нормализация: `container_code='_'`→null, `colors=['unknown']`→null, пустые строки→null.
  Дедуп внутри jsonl по `oz_product_code`.
- Никаких DELETE/деактиваций. Чужие `source` (uralsk_*/waterdrinker/oz_preorder) не трогаются.

Ручной запуск ingest по готовому файлу:
`cd /opt/oz-parser && venv/bin/python oz_catalog_ingest.py output/Lilium.jsonl`

### Маппинг category_oz → subcategory

`Lilium→lilies, Gerbera-Germini→gerberas, Chrysanthemum→chrysanthemums, Rosa/Rosa-Ecuador→roses,
Alstroemeria→alstroemeria, Anthuriums→anthuriums, Hydrangea→hydrangeas, Dianthus→carnations,
Lisianthus-Eustoma→lisianthus, Delphinium→delphiniums, Gypsophila/Limonium-Statice/Solidago/
Veronica/Aster→fillers, Hypericum→berries, Astilbe/Bouvardia/Chamelaucium-Waxflower/Eryngium/
Paint-Wax→texture, Cymbidium/Phalaenopsis-Vanda/Orchids→orchids, Exotics→accents,
Protea-Nutans→proteas, Branches-Wood/Syringa-Viburnum→branches, Tulipa/Iris/Freesia/
Ranunculus/Matthiola→spring, Paeonia/Antirrhinum/Zantedeschia-Calla→seasonal,
Bouquets/More-flowers→other, Artificial-Flowers→artificial, Dried-flowers/Preserved-Flowers→dried,
Alchemilla/Allium/Campanula/Celosia/Dahlia/Fritillaria/Helianthus/Lathyrus→seasonal`.
Неизвестная категория → `slug` (lowercase) + строка в WhatsApp «новая subcategory: X».

## Что НЕ делать

- НЕ включать таймер каталожного парсера (запуск только ручной — урок инцидента с дневным
  авто-стартом ценового).
- НЕ трогать `oz_price_refresh.py`, его таймер, `update_eur_rate.py`.
- НЕ переводить `display_name` здесь (AI-перевод — отдельная задача после прогона).
- НЕ сносить/деактивировать карточки — активностью управляет ценовой парсер.
