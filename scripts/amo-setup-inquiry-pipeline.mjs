// Создаёт (или находит) воронку amoCRM «Обращения с сайта» для анонимных обращений
// виджета (Версия B Такт 1.5). Печатает env-значения для добавления на Vercel/VPS.
//
// Запуск:
//   node --env-file=.env.local scripts/amo-setup-inquiry-pipeline.mjs          # dry-run: только показать
//   node --env-file=.env.local scripts/amo-setup-inquiry-pipeline.mjs --create # создать, если нет
//
// ОТДЕЛЬНАЯ воронка, НЕ трогает воронку заказов (10853806). Идемпотентно: если воронка
// с таким именем уже есть — просто печатает её id и id этапов (ничего не меняет).

const BASE = 'https://tropinvladislav1.amocrm.ru/api/v4'
const TOKEN = process.env.AMO_ACCESS_TOKEN
if (!TOKEN) { console.error('AMO_ACCESS_TOKEN not set'); process.exit(1) }

const PIPELINE_NAME = 'Обращения с сайта'
const STAGES = [
  { key: 'AMO_INQUIRY_STATUS_NEW',        name: 'Новое обращение',  sort: 10, color: '#fffeb2' },
  { key: 'AMO_INQUIRY_STATUS_PHONE',      name: 'Оставил телефон',  sort: 20, color: '#ffeab2' },
  { key: 'AMO_INQUIRY_STATUS_REGISTERED', name: 'Зарегистрировался', sort: 30, color: '#d6eaff' },
  { key: 'AMO_INQUIRY_STATUS_CLOSED',     name: 'Закрыто',          sort: 40, color: '#d6c9c9' },
]

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function listPipelines() {
  const r = await fetch(`${BASE}/leads/pipelines`, { headers })
  const d = await r.json()
  return d?._embedded?.pipelines ?? []
}

function printEnv(pipeline) {
  const byName = new Map((pipeline._embedded?.statuses ?? []).map((s) => [s.name.trim(), s.id]))
  console.log('\n=== ENV (добавить на Vercel / VPS) ===')
  console.log(`AMO_INQUIRY_PIPELINE_ID=${pipeline.id}`)
  for (const st of STAGES) {
    const id = byName.get(st.name)
    console.log(`${st.key}=${id ?? '??? (этап не найден — создайте «' + st.name + '» вручную)'}`)
  }
  console.log('======================================\n')
}

async function main() {
  const create = process.argv.includes('--create')
  const existing = (await listPipelines()).find((p) => p.name.trim() === PIPELINE_NAME)

  if (existing) {
    console.log(`✓ Воронка «${PIPELINE_NAME}» уже есть (id=${existing.id}). Этапы:`)
    for (const s of existing._embedded?.statuses ?? []) console.log(`   ${s.id}  ${s.name}  (type=${s.type})`)
    printEnv(existing)
    return
  }

  if (!create) {
    console.log(`Воронка «${PIPELINE_NAME}» НЕ найдена.`)
    console.log('Запустите с флагом --create, чтобы создать её:')
    console.log('  node --env-file=.env.local scripts/amo-setup-inquiry-pipeline.mjs --create')
    return
  }

  console.log(`Создаю воронку «${PIPELINE_NAME}»…`)
  const r = await fetch(`${BASE}/leads/pipelines`, {
    method: 'POST', headers,
    body: JSON.stringify([{
      name: PIPELINE_NAME,
      is_main: false,
      _embedded: { statuses: STAGES.map((s) => ({ name: s.name, sort: s.sort, color: s.color })) },
    }]),
  })
  if (!r.ok) { console.error('Ошибка создания:', r.status, await r.text()); process.exit(1) }
  const d = await r.json()
  const created = d?._embedded?.pipelines?.[0]
  console.log(`✓ Создана воронка id=${created.id}. Этапы:`)
  for (const s of created._embedded?.statuses ?? []) console.log(`   ${s.id}  ${s.name}  (type=${s.type})`)
  printEnv(created)
}

main().catch((e) => { console.error(e); process.exit(1) })
