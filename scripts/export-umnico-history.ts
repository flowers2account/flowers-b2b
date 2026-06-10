// Выгрузка переписки Umnico за период для анализа.
// Запуск (примеры):
//   node --env-file=.env.local scripts/export-umnico-history.ts --days 30
//   node --env-file=.env.local scripts/export-umnico-history.ts --from 2026-05-01 --to 2026-06-01
//   node --env-file=.env.local scripts/export-umnico-history.ts --days 30 --sample 50
//
// Складывает exports/umnico-history-{from}_{to}.jsonl — по строке на сообщение:
//   { leadId, channelType, datetime, incoming, text }
// Вложения без текста пропускаются. Токен — UMNICO_API_TOKEN из env.

import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

const DELAY_MS = 200
const PAGE_LIMIT = 200 // max для /leads/all
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── аргументы ────────────────────────────────────────────────────────────────
function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function resolvePeriod(): { from: number; to: number; label: string } {
  const daysArg = getArg('days')
  const fromArg = getArg('from')
  const toArg = getArg('to')

  let fromMs: number
  let toMs: number
  if (fromArg || toArg) {
    fromMs = fromArg ? Date.parse(fromArg) : 0
    toMs = toArg ? Date.parse(toArg) : Date.now()
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      console.error('❌ Неверный формат --from/--to. Пример: --from 2026-05-01 --to 2026-06-01')
      process.exit(1)
    }
  } else {
    const days = Number(daysArg ?? '30')
    if (!Number.isFinite(days) || days <= 0) {
      console.error('❌ --days должно быть положительным числом.')
      process.exit(1)
    }
    toMs = Date.now()
    fromMs = toMs - days * 24 * 60 * 60 * 1000
  }
  const label = `${new Date(fromMs).toISOString().slice(0, 10)}_${new Date(toMs).toISOString().slice(0, 10)}`
  return { from: fromMs, to: toMs, label }
}

const sampleN = (() => {
  const v = getArg('sample')
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
})()

// ── шаг 1: лиды за период ────────────────────────────────────────────────────
async function fetchLeads(from: number, to: number): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = []
  let offset = 0
  for (;;) {
    const params = new URLSearchParams({
      lastMessageFrom: String(from),
      lastMessageTo: String(to),
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    })
    const res = await fetch(`${BASE}/leads/all?${params.toString()}`, { method: 'GET', headers })
    if (!res.ok) {
      console.error('❌ /leads/all', res.status, await res.text().catch(() => ''))
      process.exit(1)
    }
    const data = await res.json().catch(() => null)
    const page = (Array.isArray(data) ? data : (data?.data ?? data?.leads ?? data?.items ?? [])) as Array<Record<string, unknown>>
    if (!Array.isArray(page) || page.length === 0) break
    all.push(...page)
    process.stdout.write(`\r  лидов получено: ${all.length}`)
    if (page.length < PAGE_LIMIT) break
    offset += PAGE_LIMIT
    await sleep(DELAY_MS)
  }
  process.stdout.write('\n')
  return all
}

function leadId(lead: Record<string, unknown>): string | number | undefined {
  return (lead.id ?? lead.leadId ?? lead.lead_id) as string | number | undefined
}

// ── шаг 2: источники лида ────────────────────────────────────────────────────
async function fetchSources(id: string | number): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${BASE}/messaging/${id}/sources`, { method: 'GET', headers })
  if (!res.ok) {
    console.error(`  ⚠ sources lead=${id}:`, res.status)
    return []
  }
  const data = await res.json().catch(() => null)
  const list = Array.isArray(data) ? data : (data?.data ?? data?.sources ?? [])
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : []
}

// ── шаг 2: история по источнику (пагинация cursor) ───────────────────────────
interface OutMsg {
  leadId: string | number
  channelType: string
  datetime: string
  incoming: boolean
  text: string
}

async function fetchHistory(id: string | number, realId: string | number, channelType: string): Promise<OutMsg[]> {
  const out: OutMsg[] = []
  let cursor: string | undefined
  for (;;) {
    const body: Record<string, unknown> = {}
    if (cursor) body.cursor = cursor
    const res = await fetch(`${BASE}/messaging/${id}/history/${realId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error(`  ⚠ history lead=${id} source=${realId}:`, res.status)
      break
    }
    const data = await res.json().catch(() => null)
    const page = (Array.isArray(data) ? data : (data?.data ?? data?.messages ?? data?.history ?? data?.items ?? [])) as Array<Record<string, unknown>>
    if (!Array.isArray(page) || page.length === 0) break

    for (const m of page) {
      const inner = (m.message ?? m) as Record<string, unknown>
      const rawText = (inner.text ?? m.text ?? m.body) as unknown
      const text = typeof rawText === 'string' ? rawText.trim() : ''
      if (!text) continue // вложения без текста пропускаем
      const ts = (m.createdAt ?? m.created_at ?? m.datetime ?? m.timestamp ?? m.date) as unknown
      const datetime =
        typeof ts === 'number' ? new Date(ts).toISOString()
        : typeof ts === 'string' ? ts
        : ''
      const incoming = m.incoming === true || m.direction === 'incoming'
      out.push({ leadId: id, channelType, datetime, incoming, text })
    }

    cursor = (data?.cursor ?? data?.nextCursor ?? data?.next_cursor) as string | undefined
    if (!cursor) break
    await sleep(DELAY_MS)
  }
  return out
}

// ── случайная выборка ────────────────────────────────────────────────────────
function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

// ── main ─────────────────────────────────────────────────────────────────────
const { from, to, label } = resolvePeriod()
console.log(`Период: ${new Date(from).toISOString()} → ${new Date(to).toISOString()}`)

let leads = await fetchLeads(from, to)
if (sampleN !== undefined) {
  leads = sample(leads, sampleN)
  console.log(`Выборка: ${leads.length} случайных лидов (--sample ${sampleN})`)
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'exports')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, `umnico-history-${label}.jsonl`)
writeFileSync(outFile, '') // очистка/создание

let totalMsgs = 0
let incoming = 0
let outgoing = 0
const byChannel: Record<string, number> = {}
let leadsWithMsgs = 0

for (let i = 0; i < leads.length; i++) {
  const id = leadId(leads[i])
  if (id === undefined) continue
  process.stdout.write(`\r  лид ${i + 1}/${leads.length} (id=${id})        `)

  const sources = await fetchSources(id)
  await sleep(DELAY_MS)

  let leadMsgs = 0
  for (const s of sources) {
    const realId = (s.realId ?? s.real_id) as string | number | undefined
    if (realId === undefined) continue
    const channelType = String(s.type ?? 'unknown')
    const msgs = await fetchHistory(id, realId, channelType)
    await sleep(DELAY_MS)
    if (msgs.length === 0) continue

    const lines = msgs.map((m) => JSON.stringify(m)).join('\n') + '\n'
    appendFileSync(outFile, lines)

    for (const m of msgs) {
      totalMsgs++
      leadMsgs++
      if (m.incoming) incoming++; else outgoing++
      byChannel[m.channelType] = (byChannel[m.channelType] ?? 0) + 1
    }
  }
  if (leadMsgs > 0) leadsWithMsgs++
}
process.stdout.write('\n')

// ── сводка ───────────────────────────────────────────────────────────────────
console.log('\n=== Сводка ===')
console.log(`Файл:            ${outFile}`)
console.log(`Лидов (всего):   ${leads.length}`)
console.log(`Лидов с текстом: ${leadsWithMsgs}`)
console.log(`Сообщений:       ${totalMsgs}`)
console.log(`  входящих:      ${incoming}`)
console.log(`  исходящих:     ${outgoing}`)
console.log('По каналам:')
for (const [ch, n] of Object.entries(byChannel).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ch}: ${n}`)
}
