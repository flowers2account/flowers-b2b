# Cron — настройка и фактическое расписание (Flowers B2B)

> **Обновлено:** 2026-06-26 (сверено с `vercel.json` и `src/app/api/cron/*`).  
> ⚠️ Старая версия обещала запуск «каждые 5 минут» и правку `stock.qty_reserved`. Фактически: раз в сутки, таблицы `stock` нет.

## `vercel.json`

```json
{
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 0 * * *" }],
  "git": { "deploymentEnabled": { "main": false } }
}
```

- **Один** крон: `/api/cron/cleanup`, `0 0 * * *` — **раз в сутки**, 00:00 UTC = 05:00 Asia/Oral. (Vercel Hobby допускает только суточные кроны.)
- Авто-деплой Vercel с `main` отключён (прод — на VPS через GitHub Actions).

## `/api/cron/cleanup` (GET)

- **Что делает:** удаляет просроченные резервы — `DELETE FROM reservations WHERE expires_at < now()`. Логирует число удалённых. Никакой синхронизации `qty_reserved`/`stock` не нужно: доступность считается на лету во view `stock_available`.
- **Клиент БД:** raw `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
- **Защита:** заголовок `Authorization: Bearer ${CRON_SECRET}`.

```bash
# локальный тест (PowerShell)
Invoke-RestMethod -Uri http://localhost:3000/api/cron/cleanup `
  -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

## `/api/cron/widget-amo-sync` (GET)

- **Что делает:** `runWidgetAmoSync()` — (1) досылает в amoCRM сводки бесед виджета с новыми сообщениями после `last_note_at`; (2) помечает «застрявшие» анонимные обращения (есть лид, телефон не оставлен, давно молчат) → уведомление менеджеру. Идемпотентно. Параметры `?stuck=<мин>&since=<часов>`.
- **Защита:** `Authorization: Bearer ${CRON_SECRET}`.
- **Запуск:** НЕ из `vercel.json` — внешним планировщиком (VPS-крон, по образцу flowers-cleanup, ~каждые 10 мин). См. `docs/INFRA.md`.

## ENV

- `CRON_SECRET` — защита обоих кронов.
- `SUPABASE_SERVICE_ROLE_KEY` — мутации.

## Отладка

- Логи Vercel: Deployments → Functions → `/api/cron/cleanup`.
- Резервы по-прежнему «висят»? Проверить, что cron отработал: `SELECT count(*) FROM reservations WHERE expires_at < now();` (должно быть ~0 после запуска). До суточного запуска просроченные резервы всё равно не влияют на доступность — `stock_available` учитывает только `expires_at > now()`.
</content>
