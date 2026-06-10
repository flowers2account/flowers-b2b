// Список сотрудников Umnico — чтобы найти userId бота для UMNICO_BOT_USER_ID.
// Запуск:
//   node --env-file=.env.local scripts/list-umnico-managers.ts

const token = process.env.UMNICO_API_TOKEN
if (!token) {
  console.error('❌ UMNICO_API_TOKEN не задан. Добавьте его в .env.local (Umnico → Настройки → API).')
  process.exit(1)
}

const res = await fetch('https://api.umnico.com/v1.3/managers', {
  method: 'GET',
  headers: { 'Authorization': `bearer ${token}` },
})

if (!res.ok) {
  console.error('❌ HTTP', res.status, await res.text().catch(() => ''))
  process.exit(1)
}

const data = await res.json()
const list: Array<Record<string, unknown>> = Array.isArray(data)
  ? data
  : (data?.data ?? data?.managers ?? [])

if (!Array.isArray(list) || list.length === 0) {
  console.log('Сотрудники не найдены. Сырой ответ:')
  console.log(JSON.stringify(data, null, 2))
  process.exit(0)
}

const rows = list.map((m) => ({
  id: String(m.id ?? ''),
  name: String(m.name ?? m.fullName ?? ''),
  login: String(m.login ?? m.email ?? ''),
}))

console.table(rows)
console.log(`\nВсего: ${rows.length}. Скопируйте id бота в UMNICO_BOT_USER_ID.`)
