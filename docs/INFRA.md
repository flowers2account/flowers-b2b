# INFRA.md — Инфраструктура и деплой

> Актуально на: 06.06.2026
> Источник истины: VPS (`ssh -i deploy_vps.key deploy@109.235.118.214`), `.github/workflows/deploy-vps.yml`, `next.config.ts`, `ecosystem.config.js`.

Прод переехал с Vercel на собственный VPS. Vercel остаётся как **превью/стейджинг** (проект `flowers-b2b-phi`).

---

## 1. Сервер (production)

| Параметр | Значение |
|----------|----------|
| Хостер | hoster.kz |
| IP | `109.235.118.214` |
| Локация | Астана |
| Тариф | Cloud 2-4-100 (2 vCPU / 4 ГБ RAM / 100 ГБ) |
| ОС | Ubuntu 24.04 (kernel 6.8.0-31-generic) |
| Hostname | `cloud-001` |
| Пользователь деплоя | `deploy` |

### Вход на сервер

```bash
ssh -i deploy_vps.key deploy@109.235.118.214
```

Ключ `deploy_vps.key` лежит в корне репозитория локально (в git **не** коммитится — проверить `.gitignore`). На Windows перед использованием: `chmod 600 deploy_vps.key` (через Git Bash) или права через ACL.

---

## 2. Установленное ПО

| Компонент | Версия | Назначение |
|-----------|--------|-----------|
| Node.js | v22.22.3 | runtime приложения |
| pm2 | — | процесс-менеджер (`flowers-b2b`, cluster, 1 instance) |
| nginx | 1.24.0 | reverse-proxy + раздача статики |
| certbot | 2.9.0 (+ python3-certbot-nginx) | TLS-сертификаты Let's Encrypt — **установлен, сертификат ещё не выпущен** |
| ufw | 0.36.2 | firewall — активен (открыты 22, 80, 443) |
| fail2ban | 1.0.2 | защита от брутфорса — активен |

---

## 3. Пути на сервере

```
/srv/flowers-b2b/
├── server.js               # Next.js standalone-сервер (output: 'standalone')
├── ecosystem.config.js     # конфиг pm2
├── .env.production         # переменные окружения (chmod 600, владелец deploy)
├── .next/static/           # статика (раздаётся nginx напрямую)
├── public/                 # публичные файлы
├── node_modules/           # зависимости standalone-сборки
├── docs/
└── logs/                   # err.log, out.log (pm2)
```

### ecosystem.config.js (pm2)

```js
{
  name: 'flowers-b2b',
  script: '/srv/flowers-b2b/server.js',
  cwd: '/srv/flowers-b2b',
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: '1G',
  env: { NODE_ENV: 'production', PORT: 3000 },
  env_file: '/srv/flowers-b2b/.env.production',
  error_file: '/srv/flowers-b2b/logs/err.log',
  out_file: '/srv/flowers-b2b/logs/out.log',
}
```

Приложение слушает `127.0.0.1:3000`, наружу проксирует nginx.

---

## 4. Переменные окружения (.env.production — только ИМЕНА)

Файл `/srv/flowers-b2b/.env.production` (значения не хранятся в репо):

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
# Внутренние секреты
ADMIN_ACTION_SECRET
CRON_SECRET
OZ_IMPORT_SECRET
OZ_IMPORT_URL            # сейчас → https://flowers-b2b-phi.vercel.app/api/import-oz-preorder (TODO: на домен)
# Оплата epay (см. docs/PAYMENTS.md)
EPAY_CLIENT_ID
EPAY_CLIENT_SECRET
EPAY_TERMINAL_ID
EPAY_OAUTH_URL           # сейчас test-epay-oauth.epayment.kz (тестовый контур)
NEXT_PUBLIC_EPAY_JS_URL  # сейчас test-epay.epayment.kz/payform/payment-api.js
NEXT_PUBLIC_PAYMENTS_MODE # сейчас 'test'
# amoCRM
AMO_ACCESS_TOKEN
# Уведомления
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
UMNICO_API_TOKEN
UMNICO_MANAGER_PHONE
UMNICO_WHATSAPP_SA_ID
# AI / поиск фото
GOOGLE_API_KEY
GOOGLE_CX
GOOGLE_GEMINI_API_KEY
SERPER_API_KEY
# Сайт
NEXT_PUBLIC_SITE_URL     # https://uralskflowers.kz
NODE_ENV
PORT
```

> ⚠️ `NEXT_PUBLIC_*` вшиваются в бандл **на этапе сборки** (в CI), а не читаются из `.env.production` в рантайме. Значения для них берутся из GitHub Secrets (см. ниже). Серверные переменные (без `NEXT_PUBLIC_`) читаются процессом из `.env.production` в рантайме.

---

## 5. Деплой (`.github/workflows/deploy-vps.yml`)

Триггер: **push в `main`**.

Шаги:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 22, npm cache)
3. `npm ci`
4. `npm run build` — с env для сборки (см. секреты ниже), `NEXT_PUBLIC_SITE_URL` захардкожен `https://uralskflowers.kz`
5. Упаковка артефактов:
   - `deploy.tar.gz` ← `.next/standalone/.`
   - `static.tar.gz` ← `.next/static`
   - `public.tar.gz` ← `public`
6. `appleboy/scp-action` → загрузка в `/tmp/flowers-upload`
7. `appleboy/ssh-action` → на сервере: распаковка поверх `/srv/flowers-b2b`, затем **`pm2 reload flowers-b2b`** (без downtime), очистка tmp.

### GitHub Secrets (Settings → Secrets and variables → Actions)

| Секрет | Назначение |
|--------|-----------|
| `VPS_HOST` | `109.235.118.214` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | приватный SSH-ключ для деплоя |
| `NEXT_PUBLIC_SUPABASE_URL` | вшивается в бандл при сборке |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | вшивается в бандл при сборке |
| `NEXT_PUBLIC_EPAY_JS_URL` | вшивается в бандл при сборке |
| `NEXT_PUBLIC_PAYMENTS_MODE` | вшивается в бандл при сборке |

> ⚠️ Серверные секреты (`SUPABASE_SERVICE_ROLE_KEY`, `EPAY_CLIENT_*`, `AMO_ACCESS_TOKEN` и т.д.) в CI **не передаются** — они живут только в `.env.production` на сервере. При смене серверного секрета правим файл на VPS вручную и делаем `pm2 reload flowers-b2b`.

### Ручные команды на сервере

```bash
pm2 status                    # состояние
pm2 logs flowers-b2b          # логи (или logs/out.log, logs/err.log)
pm2 reload flowers-b2b        # перезапуск без downtime
nginx -t && sudo systemctl reload nginx
```

---

## 6. nginx (`/etc/nginx/sites-enabled/flowers-ip`)

Сейчас — **только HTTP, без домена** (`server_name _`, `listen 80 default_server`):

- `client_max_body_size 25m`, gzip включён
- `/_next/static/` → alias `/srv/flowers-b2b/.next/static/` (cache 1y, immutable)
- `/public/` → alias `/srv/flowers-b2b/public/` (cache 7d)
- `/` → `proxy_pass http://127.0.0.1:3000` (proxy_read_timeout 120s — важно для поллинга оплаты)

---

## 7. Роль Vercel

- Проект: `flowers-b2b-phi` (`prj_k80BCcMseVVbEQP3tOu46yQzmgXT`, org `team_NyU4Y0SDJBVTXLbswr41VFH5`)
- URL: `https://flowers-b2b-phi.vercel.app`
- Теперь это **превью/стейджинг**, не прод.
- ⚠️ `OZ_IMPORT_URL` на VPS всё ещё указывает на Vercel-домен — python-парсер OZ постит туда. После переезда на домен обновить и URL, и конфиг парсера.

---

## 8. Чек-лист «ждёт DNS» (домен uralskflowers.kz, регистратор Megagroup)

Пока A-запись `uralskflowers.kz` → `109.235.118.214` не прописана, нельзя завершить:

- [ ] **DNS**: A-запись `uralskflowers.kz` и `www` → `109.235.118.214` (через Megagroup).
- [ ] **nginx домен**: заменить `server_name _;` на `server_name uralskflowers.kz www.uralskflowers.kz;` в `/etc/nginx/sites-enabled/flowers-ip`, `nginx -t`, reload.
- [ ] **TLS**: выпустить сертификат —
  ```bash
  sudo certbot --nginx -d uralskflowers.kz -d www.uralskflowers.kz
  ```
  (certbot и плагин nginx уже установлены; автопродление через systemd-таймер certbot). Проверить редирект 80→443.
- [ ] **OZ_IMPORT_URL**: сменить `https://flowers-b2b-phi.vercel.app/api/import-oz-preorder` → `https://uralskflowers.kz/api/import-oz-preorder` в `.env.production` и в конфиге python-парсера; `pm2 reload`.
- [ ] **Боевая оплата epay**: получить от Halyk Bank боевые ключи и переключить контур (см. `docs/PAYMENTS.md` §6), сделать контрольный платёж на минимальную сумму.
- [ ] **Хардкоды vercel.app**: вычистить упоминания `flowers-b2b-phi.vercel.app` / `flowers-b2b.vercel.app` в коде/доках (фоллбэки в коде уже используют `uralskflowers.kz`; остаются ссылки в `README.md`, `docs/UX_DESIGN_BRIEF.md`, `docs/BANK_AUDIT_2026-06-04.md` — обновить при финализации).
- [ ] **amoCRM/постлинк**: убедиться, что postlink-URL оплаты (`/api/payments/postlink`) резолвится по публичному HTTPS-домену (epay требует публичный HTTPS — на голом IP без TLS postlink не дойдёт).

---

## Эксплуатация

- **Ротация логов**: `pm2-logrotate` установлен (`max_size 10M`, `retain 14`, ежедневная ротация `0 0 * * *`). Логи — `/srv/flowers-b2b/logs/{out,err}.log`.
- **Бэкап `.env.production`**: офлайн-копия у владельца. На сервере файл `chmod 600` (владелец `deploy`). При смене секрета — обновить и серверный файл, и офлайн-копию.

## Резервное копирование БД (Supabase → VPS)

Ночной логический дамп Supabase на VPS — независимая копия помимо бэкапов самого Supabase.

| Параметр | Значение |
|----------|----------|
| Расписание | **02:00 UTC ежедневно** (часовой пояс сервера — UTC; это 07:00 по Уральску, UTC+5) |
| Cron | `/etc/cron.d/supabase-backup` → запускает `/usr/local/bin/supabase-backup.sh` (от root) |
| Скрипт | `/usr/local/bin/supabase-backup.sh` (root, `chmod 700`) — `pg_dump -Fc --no-owner --no-privileges` |
| Каталог дампов | `/srv/backups/supabase/` (root, `750`) |
| Имя файла | `supabase_YYYY-MM-DD_HHMMSS.dump` (формат custom, `-Fc`) |
| Хранение | 14 дней (старше — удаляются в скрипте через `find -mtime +14 -delete`) |
| Логи | `/srv/backups/supabase/backup.log` (успехи) + `cron.log` (вывод cron) |
| Подключение | Session pooler, IPv4: `aws-1-ap-northeast-2.pooler.supabase.com:5432`, user `postgres.<ref>`, db `postgres` |
| Креды | `/root/.supabase-backup.env` (root, `chmod 600`, `PG*` + `PGPASSWORD`) — **в репо не хранятся** |
| Клиент | `postgresql-client-17` из PGDG (pg_dump 17.x ≥ сервер PG 17; client 16 из Ubuntu-repo НЕ годится) |

> ⚠️ Дамп делается под обычной ролью пула (не суперюзер), поэтому это **логическая копия доступных объектов** (public + auth схемы, таблицы, данные, функции, политики, индексы; ~1000 TOC-записей). Объекты, требующие суперюзера, могут не попасть — для полного DR полагаться также на бэкапы Supabase.
>
> Прямой хост `db.<ref>.supabase.co` использовать нельзя — он IPv6-only, VPS работает по IPv4. Только pooler.

### Ручной запуск
```bash
sudo /usr/local/bin/supabase-backup.sh
```

### Проверить содержимое дампа (без восстановления)
```bash
sudo pg_restore --list /srv/backups/supabase/<файл>.dump | less
```

### Восстановление одной командой

В **новую/другую** БД (заменить строку подключения на целевую; `--no-owner` — роли Supabase локально не нужны):
```bash
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "postgresql://postgres.<ref>:<PASSWORD>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" \
  /srv/backups/supabase/<файл>.dump
```
> ⚠️ `--clean --if-exists` дропает существующие объекты перед восстановлением — для отката прод-БД использовать осознанно. Для выборочного восстановления одной таблицы: добавить `-t public.<table>` и убрать `--clean`.

## TODO / вопросы

- **TODO**: уточнить у поддержки hoster.kz, есть ли резервное копирование/снапшоты VPS на их стороне.
- **TODO**: рассмотреть выгрузку ночных дампов с VPS во внешнее хранилище (off-site) — сейчас дампы только на самом сервере.
