// Снятие регистрации вебхука ИИ-бота в Umnico (парный к register-umnico-webhook.ts).
// Список вебхуков:
//   node --env-file=.env.local scripts/unregister-umnico-webhook.ts
// Удалить по id:
//   node --env-file=.env.local scripts/unregister-umnico-webhook.ts <webhookId>

const token = process.env.UMNICO_API_TOKEN
if (!token) {
  console.error('❌ UMNICO_API_TOKEN не задан. Добавьте его в .env.local (Umnico → Настройки → API).')
  process.exit(1)
}

const BASE = 'https://api.umnico.com/v1.3'
const headers = {
  'Authorization': `bearer ${token}`,
  'Content-Type': 'application/json',
}

async function listWebhooks(): Promise<void> {
  const res = await fetch(`${BASE}/webhooks`, { method: 'GET', headers })
  const text = await res.text()
  let data: unknown = text
  try { data = JSON.parse(text) } catch { /* оставляем как текст */ }

  console.log('HTTP', res.status, res.ok ? '✅' : '❌')
  if (!res.ok) {
    console.error('Ответ:', typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    process.exit(1)
  }

  const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data ?? []
  if (!Array.isArray(list) || list.length === 0) {
    console.log('Вебхуков нет.')
    return
  }
  console.log(`Вебхуки (${list.length}):`)
  for (const w of list as Array<Record<string, unknown>>) {
    console.log(`  id=${w.id}  url=${w.url ?? ''}  name=${w.name ?? ''}`)
  }
  console.log('\nЧтобы удалить: node --env-file=.env.local scripts/unregister-umnico-webhook.ts <id>')
}

async function deleteWebhook(id: string): Promise<void> {
  const res = await fetch(`${BASE}/webhooks/${id}`, { method: 'DELETE', headers })
  const text = await res.text()
  let data: unknown = text
  try { data = JSON.parse(text) } catch { /* оставляем как текст */ }

  console.log('HTTP', res.status, res.ok ? '✅ удалён' : '❌')
  console.log('webhook id:', id)
  if (text) console.log('Ответ:', typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  if (!res.ok) process.exit(1)
}

const id = process.argv[2]
if (id) {
  await deleteWebhook(id)
} else {
  await listWebhooks()
}
