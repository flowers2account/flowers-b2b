# OZ-парсер цен/остатков на VPS + автокурс EUR/KZT

**Работает с 11.06.2026.** Хост: VPS `109.235.118.214`, каталог `/opt/oz-parser/`.
Исходники версионируются в репо: `scripts/oz-parser/` (на VPS — копии).

## Что и когда ходит

| Юнит | Расписание (Asia/Oral) | Что делает |
|---|---|---|
| `oz-price-refresh.timer` | ежедневно 03:00 (+ RandomizedDelay до 20 мин) | обновляет qty/цены всех `products` `source='oz_catalog'` c `source_url` |
| `oz-eur-rate.timer` | 07:00 и 19:00 (+до 5 мин) | курс EUR НБ РК + `eur_rate_extra_percent`(2%) → `app_settings.preorder_eur_kzt_rate` → `recalc_oz_prices()` |

Ночной прогон **первым шагом сам обновляет курс** (`ExecStartPre`), так что парсер всегда считает по свежему.

## Поток парсера (oz_price_refresh.py)

1. Выборка: `products` where `source='oz_catalog' and source_url is not null` (сейчас **967 из 1334**; 367 без URL — см. «Дыры покрытия»).
2. Каждый товар: Playwright headless + сессия `oz_state.json` → перехват XHR `allStockPdpMap` → `oz_normalize.normalize_availability`.
3. Запись (строго `source='oz_catalog'`, спот/1С/waterdrinker не задеваются):
   - сток есть → `qty`=суммарные стебли, `oz_purchase_eur`=мин €/стебель, `price`=`calc_preorder_price_kzt` (наценка/курс из `app_settings`), `is_active=true`, `oz_stock_updated_at=now()`
   - XHR пришёл, но пуст → `qty=0`, `is_active=false`
4. Паузы 1–2 с между товарами. Полный прогон ~60–90 мин.

### Защиты
- **10 товаров подряд без XHR → СТОП + WhatsApp-алерт, БЕЗ деактивации** (протухшая сессия ≠ нет товара; иначе мёртвая сессия за ночь погасила бы каталог). Exit code 2 (для systemd это «успех» — алерт уже ушёл).
- Деактивация — только когда XHR реально пришёл и в нём пусто.
- Курс: не обновляется при недоступном XML НБ РК, курсе вне 400–900 ₸ или скачке >±10% к прошлому — алерт, старый курс остаётся.

## Логи

```
/var/log/oz-price-refresh/YYYY-MM-DD.log   # ночной прогон, по дню
/var/log/oz-price-refresh/eur_rate.log     # курс, накопительный
journalctl -u oz-price-refresh.service     # дубль stdout
```
Строка-итог прогона: `всего | обновлено | деактивировано | без XHR | ошибок | без цены | минут` + строка курса. Итог уходит в WhatsApp менеджеру (Umnico, номер из `.env`).

## Ручной запуск

```bash
ssh -i deploy_vps.key deploy@109.235.118.214
sudo systemctl start oz-price-refresh.service     # полный прогон сейчас
sudo systemctl start oz-eur-rate.service          # обновить курс сейчас
# или напрямую, с опциями:
cd /opt/oz-parser && venv/bin/python oz_price_refresh.py --limit 30 --dry-run
```

## Смена расписания

```bash
sudo nano /etc/systemd/system/oz-price-refresh.timer   # OnCalendar=*-*-* 03:00:00 Asia/Oral
sudo systemctl daemon-reload && sudo systemctl restart oz-price-refresh.timer
systemctl list-timers 'oz-*'                            # проверить NEXT
```

## Обновление сессии oz_state.json (когда пришёл алерт «сессия протухла»)

Сессию на сервере получить нельзя (логин OZ интерактивный). Порядок:
1. На десктопе: `cd Desktop/ingest_oz && python oz_login.py` — залогиниться в открывшемся браузере, скрипт сохранит `oz_state.json`.
2. Закинуть на VPS:
   ```bash
   scp -i deploy_vps.key "C:/Users/Владелец/Desktop/ingest_oz/oz_state.json" deploy@109.235.118.214:/opt/oz-parser/
   ssh -i deploy_vps.key deploy@109.235.118.214 "chmod 600 /opt/oz-parser/oz_state.json"
   ```
3. Проверить: `sudo systemctl start oz-price-refresh.service` или `--limit 10 --dry-run`.

## Секреты

`/opt/oz-parser/.env` (chmod 600, владелец deploy): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
(service role — штатный путь записи после включения RLS), `UMNICO_API_TOKEN`,
`UMNICO_WHATSAPP_SA_ID`, `UMNICO_MANAGER_PHONE`. Собран из `/srv/flowers-b2b/.env.production`.

## Дыры покрытия (бэклог)

**367 из 1334 карточек без `source_url`** — их кодов нет в jsonl каталога (десктоп
`oz-parser-new/output/`): fillers 85, gerberas 61, roses 58, lilies 35, delphiniums 20,
anthuriums 18, hydrangeas 16, alstroemeria 16, прочие <12. Парсер цен их не обходит.
Закрыть: догнать каталог парсером на десктопе по этим категориям → новые jsonl →
`venv/bin/python fill_source_url.py` на VPS.
