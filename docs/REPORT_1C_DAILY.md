# Ежедневный отчёт об автосинхронизации 1С (WhatsApp)

Контроль, что выгрузка остатков из 1С работает, и сигнал, если сломалась.

## Что это
- Эндпоинт `GET /api/admin/reports/1c-daily` собирает отчёт за вчера + статус на утро и шлёт в WhatsApp через `umnicoClient`.
- Источник данных: RPC `report_1c_daily()` (Asia/Oral): `stock_apply_log` (журнал применённых снимков, переживает очистку staging) + `stock_import_rows` живого фида `source='1c-ip'`.
- Защита: `Authorization: Bearer $CRON_SECRET` (как `/api/cron/*`).

## Параметры
| Параметр | Назначение | По умолчанию |
|---|---|---|
| `?dry=1` | собрать и вернуть текст, **не отправлять** (превью) | — |
| `?stale=2` | макс. возраст последнего снимка в рабочее время (08–20), часов | 2 |
| `?min=10` | ниже — «выгрузка шла с перебоями» | 10 |
| `?max=100` | выше — «выросло число непривязанных» | 100 |

## Логика тревог
- **CRITICAL ⚠️**: за вчера ноль снимков, ИЛИ в рабочее время (08–20 Oral) последний снимок старше `stale` часов → «выгрузка не приходила, проверьте 1С».
- **WARNING ⚠️**: снимков за день `< min` (перебои); ИЛИ `unmatched > max` (рост непривязанных).
- **OK ✅**: обычный отчёт с цифрами.

## ENV (на VPS `/srv/flowers-b2b/.env.production`)
```
CRON_SECRET              # уже есть (общий для /api/cron/*)
REPORT_PHONE             # получатель(и) отчёта, можно несколько через запятую;
                         # если не задан — fallback на UMNICO_MANAGER_PHONE
UMNICO_API_TOKEN         # уже есть (WhatsApp)
UMNICO_WHATSAPP_SA_ID    # уже есть
```

## Боевой запуск — systemd-таймер на VPS (08:30 Asia/Oral)
По образцу `oz_price_refresh` / `flowers-cleanup`. Создать два файла от root:

`/etc/systemd/system/report-1c-daily.service`
```ini
[Unit]
Description=Daily 1C sync report to WhatsApp
After=network-online.target

[Service]
Type=oneshot
# CRON_SECRET читаем из env-файла приложения
EnvironmentFile=/srv/flowers-b2b/.env.production
ExecStart=/usr/bin/curl -fsS -X GET "http://localhost:3000/api/admin/reports/1c-daily" -H "Authorization: Bearer ${CRON_SECRET}"
```

`/etc/systemd/system/report-1c-daily.timer`
```ini
[Unit]
Description=Run daily 1C report at 08:30 Asia/Oral

[Timer]
# системное время VPS — UTC; 08:30 Oral (UTC+5) = 03:30 UTC
OnCalendar=*-*-* 03:30:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

Активировать:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now report-1c-daily.timer
systemctl list-timers report-1c-daily.timer
# разовый прогон вручную:
sudo systemctl start report-1c-daily.service
```

> ⏰ Время VPS — UTC. 08:30 Asia/Oral = **03:30 UTC**. (Если на VPS включён TZ Asia/Oral — можно `OnCalendar=*-*-* 08:30` без `UTC`.)

## Превью без отправки
```bash
curl -fsS "http://localhost:3000/api/admin/reports/1c-daily?dry=1" \
  -H "Authorization: Bearer $CRON_SECRET" | jq -r .text
```
