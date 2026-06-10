// Регистрация вебхука ИИ-бота в Umnico.
// Запуск:
//   node --env-file=.env.local scripts/register-umnico-webhook.ts https://<домен>/api/webhooks/umnico
// Либо URL из env WEBHOOK_URL / NEXT_PUBLIC_SITE_URL (тогда добавляется /api/webhooks/umnico):
//   node --env-file=.env.local scripts/register-umnico-webhook.ts

const token = process.env.UMNICO_API_TOKEN
if (!token) {
  console.error('❌ UMNICO_API_TOKEN не задан. Добавьте его в .env.local (Umnico → Настройки → API).')
  process.exit(1)
}

function resolveUrl(): string {
  const arg = process.argv[2]
  if (arg) return arg
  const envUrl = process.env.WEBHOOK_URL
  if (envUrl) return envUrl
  const site = process.env.NEXT_PUBLIC_SITE_URL
  if (site) return `${site.replace(/\/$/, '')}/api/webhooks/umnico`
  console.error('❌ Не указан URL вебхука. Передайте аргументом или задайте WEBHOOK_URL / NEXT_PUBLIC_SITE_URL.')
  console.error('   Пример: node --env-file=.env.local scripts/register-umnico-webhook.ts https://uralskflowers.kz/api/webhooks/umnico')
  process.exit(1)
}

const url = resolveUrl()

const res = await fetch('https://api.umnico.com/v1.3/webhooks', {
  method: 'POST',
  headers: {
    'Authorization': `bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ url, name: 'AI bot' }),
})

const text = await res.text()
let data: unknown = text
try { data = JSON.parse(text) } catch { /* оставляем как текст */ }

console.log('HTTP', res.status, res.ok ? '✅' : '❌')
console.log('URL :', url)

const id = (data as { id?: unknown; data?: { id?: unknown } })?.id
  ?? (data as { data?: { id?: unknown } })?.data?.id
if (id !== undefined) console.log('webhook id:', id)

console.log('Ответ:', typeof data === 'string' ? data : JSON.stringify(data, null, 2))

if (!res.ok) process.exit(1)

export {}
