// amoCRM API v4 integration — server-only
// Token: process.env.AMO_ACCESS_TOKEN (never NEXT_PUBLIC)

const BASE = 'https://tropinvladislav1.amocrm.ru/api/v4'

export const AMO_PIPELINE_ID = 10853806

// ── Воронка «Обращения с сайта» (Версия B Такт 1.5) ───────────────────────────
// ОТДЕЛЬНАЯ от воронки заказов (10853806). ID воронки и этапов — из env (создаются
// скриптом scripts/amo-setup-inquiry-pipeline.mjs, который печатает значения).
// Не заданы → inquiryConfigured()=false → анонимные лиды/захват телефона тихо
// отключены (прод не падает; обычная регистрация и заказы не затронуты).
export const AMO_INQUIRY_PIPELINE_ID     = Number(process.env.AMO_INQUIRY_PIPELINE_ID || 0)
export const AMO_INQUIRY_STATUS_NEW        = Number(process.env.AMO_INQUIRY_STATUS_NEW || 0)         // «Новое обращение»
export const AMO_INQUIRY_STATUS_PHONE      = Number(process.env.AMO_INQUIRY_STATUS_PHONE || 0)       // «Оставил телефон»
export const AMO_INQUIRY_STATUS_REGISTERED = Number(process.env.AMO_INQUIRY_STATUS_REGISTERED || 0)  // «Зарегистрировался»
export const AMO_INQUIRY_STATUS_CLOSED     = Number(process.env.AMO_INQUIRY_STATUS_CLOSED || 0)      // «Закрыто»

export function inquiryConfigured(): boolean {
  return AMO_INQUIRY_PIPELINE_ID > 0 && AMO_INQUIRY_STATUS_NEW > 0
}

// ── Воронка «Школьная рассылка (1 сентября)» (кампания school_september_2026) ─
// Создана вручную в amoCRM UI 26.08.2026, id 11235862 (владелец прислал ссылку на
// воронку). ОТДЕЛЬНАЯ от воронки заказов (10853806) и от «Обзвон LAPS» (11053958 —
// другая кампания, холодный обзвон флористов Актобе/Атырау; НЕ переиспользовать).
// Используется src/app/api/webhooks/umnico/route.ts при ответе кампанейного контакта
// (см. src/lib/outreach/campaign-handoff.ts). Не настроено → сделка не создаётся,
// остальной конвейер не падает (см. campaignConfigured()).
export const AMO_CAMPAIGN_PIPELINE_ID = Number(process.env.AMO_CAMPAIGN_PIPELINE_ID || 0)
export const AMO_CAMPAIGN_STATUS_NEW  = Number(process.env.AMO_CAMPAIGN_STATUS_NEW || 0)
// «материал отправлен» — этап добавлен владельцем в воронку 26.08.2026 (сверено GET
// /leads/pipelines/11235862). Источник истины «материал уже отправлен клиенту» —
// стадия сделки, НЕ текст истории диалога. См. materialAlreadySent() в
// src/lib/bot/campaign-bot.ts.
export const AMO_CAMPAIGN_STATUS_MATERIAL_SENT = 88149794

// Финальные статусы воронки кампании (глобальные id amoCRM «Успешно/Закрыто»).
export const AMO_CAMPAIGN_STATUS_WON  = 142  // «Успешно реализовано»
export const AMO_CAMPAIGN_STATUS_LOST = 143  // «Закрыто и не реализовано»

// Кастомные поля СДЕЛКИ для follow-up-механики кампании (созданы вручную в UI amoCRM
// 27.08.2026, id прочитаны через GET /api/v4/leads/custom_fields). Пишет: крон
// campaign-followup.ts (счётчик + окно) и campaign-handoff.ts (umnico ref при первом
// входящем + сброс цепочки при ответе клиента). См. src/lib/bot/campaign-followup.ts.
export const CF_CAMPAIGN_NEXT_FOLLOWUP  = 1689675  // «Campaign next followup not before» (text, ISO-8601 UTC)
export const CF_CAMPAIGN_FOLLOWUP_COUNT = 1689679  // «Campaign followup count» (numeric)
export const CF_CAMPAIGN_UMNICO_REF     = 1689681  // «Campaign umnico ref» (text, "leadId:realId")

export function campaignConfigured(): boolean {
  return AMO_CAMPAIGN_PIPELINE_ID > 0 && AMO_CAMPAIGN_STATUS_NEW > 0
}

// Этапы воронки 10853806 (GET /api/v4/leads/pipelines/10853806, перестроена 21.06.2026)
// Порядок: Новый → Подтверждён → СОГЛАСОВАНИЕ → В сборке → Готово к выдаче → на доставке → Выдан/Отменён.
// Этап «В брони» (85413466) УДАЛЁН из воронки.
export const AMO_STATUS_INVOICE_ISSUED = 86847106  // Счёт выставлен (документ, не продажа; перед «Новый»)
export const AMO_STATUS_NEW         = 85413462  // Новый
export const AMO_STATUS_CONFIRMED   = 85413470  // Подтверждён
export const AMO_STATUS_NEGOTIATION = 86646726  // СОГЛАСОВАНИЕ (новый)
export const AMO_STATUS_ASSEMBLING  = 86286418  // В сборке
export const AMO_STATUS_ASSEMBLED   = 86286422  // Готово к выдаче
export const AMO_STATUS_ON_DELIVERY = 86646730  // на доставке (новый)
export const AMO_STATUS_DELIVERED   = 142        // Выдан (финал успешно)
export const AMO_STATUS_CANCELLED   = 143        // Отменён (финал)

// Двусторонний маппинг order_status ↔ этап воронки 10853806 (полное соответствие).
// НЕ двигаем (нет в маппинге): pending/cart/arrived; «Новый»/«Incoming leads» — вход не маппим.
// ⚠️ reserved — этап «В брони» удалён из воронки; не маппим → updateLeadStage no-op.
//    reserved остаётся живым статусом сайта (канбан «В работе», касса) до заморозки кнопок.
const ORDER_STATUS_TO_AMO: Record<string, number> = {
  confirmed:   AMO_STATUS_CONFIRMED,
  negotiation: AMO_STATUS_NEGOTIATION,
  assembling:  AMO_STATUS_ASSEMBLING,
  assembled:   AMO_STATUS_ASSEMBLED,
  in_transit:  AMO_STATUS_ON_DELIVERY,
  delivered:   AMO_STATUS_DELIVERED,
  cancelled:   AMO_STATUS_CANCELLED,
}

// Обратный маппинг этап amoCRM → order_status (для вебхука CRM→сайт).
// «Новый» (85413462) и «Incoming leads» (85413458) намеренно отсутствуют → вебхук их игнорит.
export const AMO_STATUS_TO_ORDER: Record<number, string> = {
  [AMO_STATUS_CONFIRMED]:   'confirmed',
  [AMO_STATUS_NEGOTIATION]: 'negotiation',
  [AMO_STATUS_ASSEMBLING]:  'assembling',
  [AMO_STATUS_ASSEMBLED]:   'assembled',
  [AMO_STATUS_ON_DELIVERY]: 'in_transit',
  [AMO_STATUS_DELIVERED]:   'delivered',
  [AMO_STATUS_CANCELLED]:   'cancelled',
}

// Custom field IDs (from /api/v4/leads/custom_fields)
export const CF_ORDERID            = 1394611   // ORDERID  (textarea)
export const CF_DATA_DOSTAVKI      = 1394599   // ДАТА_ДОСТАВКИ (textarea)
export const CF_DRIVER_NAME        = 1680531   // «Имя водителя» (text)            → orders.driver_name
export const CF_DRIVER_PHONE       = 1363771   // «Номер водителя» (text, телефон) → orders.driver_phone
export const CF_CAR_PLATE          = 1363769   // «Номер машины» (text, госномер)  → orders.driver_car_plate
export const CF_DELIVERY_PRICE     = 1394623   // DELIVERY_PRICE (numeric)         → orders.delivery_cost
export const CF_POLUCHATEL_FIO     = 1394593   // POLUCHATEL_FIO (textarea)
export const CF_POLUCHATEL_PHONE   = 1394595   // POLUCHATEL_PHONE (textarea)
export const CF_ADRES_POLUCHATELYA = 1394597   // АДРЕС_ПОЛУЧАТЕЛЯ (textarea)
export const CF_KOMMENTARII        = 1394607   // КОММЕНТАРИЙ (textarea)

// Контактные кастомные поля (from /api/v4/contacts/custom_fields) — реквизиты юр.лица.
// Созданы 29.06.2026 скриптом (раньше БИН/компании на контакте не было).
export const CF_CONTACT_BIN        = 1681921   // «БИН/ИИН» (text) → clients.bin
export const CF_CONTACT_COMPANY    = 1681923   // «Организация» (text) → clients.company_name

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function token(): string {
  const t = process.env.AMO_ACCESS_TOKEN
  if (!t) throw new Error('AMO_ACCESS_TOKEN not set')
  return t
}

export class AmoApiError extends Error {
  readonly status: number
  readonly staleEntity: boolean

  constructor(status: number, body = '') {
    super(`amo_http_${status}`)
    this.name = 'AmoApiError'
    this.status = status
    this.staleEntity = isMissingAmoEntity(status, body)
  }
}

function isMissingAmoEntity(status: number, body: string): boolean {
  if (status === 404 || status === 410) return true
  if (status !== 400) return false

  const normalized = body.toLowerCase()
  const identifiesEntity = /(contact|lead|entity|conversation|chat|dialog)/.test(normalized)
  const identifiesMissing = /(not[ _-]?found|does not exist|deleted|dead|unknown|invalid)/.test(normalized)
  const isPayloadValidation = /(receiver|origin user|signature|payload|validation)/.test(normalized)
  return identifiesEntity && identifiesMissing && !isPayloadValidation
}

async function amoFetch(
  path: string,
  opts: RequestInit = {},
  attempt = 0
): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> ?? {}),
    },
  })

  // Retriable: 429 (rate limit) or 5xx
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const delay = res.status === 429
      ? parseInt(res.headers.get('Retry-After') ?? '1', 10) * 1000
      : [1000, 2000, 4000][attempt]
    await new Promise(r => setTimeout(r, delay))
    return amoFetch(path, opts, attempt + 1)
  }

  // Non-retriable errors
  if (res.status >= 400 && res.status !== 204) {
    const body = await res.text().catch(() => '')
    throw new AmoApiError(res.status, body)
  }

  return res
}

async function readAmoJson<T>(res: Response): Promise<T | null> {
  const body = await res.text()
  if (!body.trim()) return null
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('json')) {
    throw new Error(`amoCRM ${res.status} non_json_response`)
  }
  try {
    return JSON.parse(body) as T
  } catch {
    throw new Error(`amoCRM ${res.status} invalid_json_response`)
  }
}

// ── Phone normalisation ───────────────────────────────────────────────────────

export function normalizePhoneAmo(raw: string): string[] {
  const digits = raw.replace(/\D/g, '')
  // Convert to 11-digit Russian number
  let normalized = digits
  if (digits.length === 10) normalized = '7' + digits
  else if (digits.startsWith('8') && digits.length === 11) normalized = '7' + digits.slice(1)
  else if (digits.startsWith('7') && digits.length === 11) normalized = digits
  if (normalized.length !== 11) return [raw]
  return [`+${normalized}`, `8${normalized.slice(1)}`]
}

// ── Contacts ──────────────────────────────────────────────────────────────────

// ВСЕ контакты amoCRM, совпавшие по телефону (по всем переданным вариантам номера).
// Порядок выдачи сохраняется, дубли по id убраны. Пусто → []. Нужна там, где телефон
// может числиться за несколькими контактами-дублями (выдача amoCRM по query
// нестабильна): см. findLeadByPhoneInPipeline.
export async function findContactIdsByPhone(phones: string[]): Promise<number[]> {
  const seen = new Set<number>()
  const out: number[] = []
  for (const phone of phones) {
    const res = await amoFetch(`/contacts?query=${encodeURIComponent(phone)}&limit=10`)
    if (res.status === 204) continue
    const data = await readAmoJson<{ _embedded?: { contacts?: Array<{ id: number }> } }>(res)
    for (const c of data?._embedded?.contacts ?? []) {
      if (Number.isFinite(c.id) && !seen.has(c.id)) { seen.add(c.id); out.push(c.id) }
    }
  }
  return out
}

// Первый контакт по телефону (обратная совместимость — checkout, регистрация, синк
// заказов/реквизитов и т.п., где нужен ровно один контакт).
export async function findContactByPhone(phones: string[]): Promise<number | null> {
  const ids = await findContactIdsByPhone(phones)
  return ids[0] ?? null
}

export async function assertAmoContactExists(contactId: number): Promise<void> {
  const res = await amoFetch(`/contacts/${contactId}`)
  if (res.status === 204) throw new AmoApiError(404, 'contact not found')
}

export async function assertAmoLeadExists(leadId: number): Promise<void> {
  const res = await amoFetch(`/leads/${leadId}`)
  if (res.status === 204) throw new AmoApiError(404, 'lead not found')
}

// Best-effort: найти сделку контакта в указанной воронке по телефону (для аутрич-захвата).
// Возвращает { leadId, contactId } первой подходящей сделки или null. Не кидает на «не найдено».
// Перебирает ВСЕ контакты, совпавшие по телефону (номер может числиться за несколькими
// контактами-дублями — выдача amoCRM по query нестабильна), и возвращает сделку из
// первого контакта, у которого она реально нашлась в нужной воронке. Раньше проверялся
// только первый контакт из выдачи → срабатывание было недетерминированным.
export async function findLeadByPhoneInPipeline(
  phones: string[],
  pipelineId: number,
): Promise<{ leadId: number; contactId: number } | null> {
  const contactIds = await findContactIdsByPhone(phones)
  if (!contactIds.length) return null

  for (const contactId of contactIds) {
    const cRes = await amoFetch(`/contacts/${contactId}?with=leads`)
    if (cRes.status === 204) continue
    const cData = await readAmoJson<{ _embedded?: { leads?: Array<{ id: number }> } }>(cRes)
    const leadIds = (cData?._embedded?.leads ?? [])
      .map((l) => l.id).filter((x) => Number.isFinite(x))
    if (!leadIds.length) continue

    const qs = leadIds.map((id) => `filter[id][]=${id}`).join('&')
    const lRes = await amoFetch(`/leads?${qs}&filter[pipeline_id]=${pipelineId}&limit=1`)
    if (lRes.status === 204) continue
    const lData = await readAmoJson<{ _embedded?: { leads?: Array<{ id: number }> } }>(lRes)
    const lead = lData?._embedded?.leads?.[0]
    if (lead?.id) return { leadId: lead.id, contactId }
  }
  return null
}

// Проверяет, выглядит ли строка как номер телефона (без имени)
function looksLikePhone(s: string): boolean {
  return /^[\d\s\+\-\(\)]{7,}$/.test(s.trim())
}

// После find/create: если контакт без имени или имя = телефон → PATCH с реальным именем
export async function ensureContactName(contactId: number, realName: string): Promise<void> {
  if (!realName || looksLikePhone(realName)) return // нет смысла обновлять телефоном
  const res = await amoFetch(`/contacts/${contactId}`)
  if (res.status === 204) throw new AmoApiError(404, 'contact not found')
  const data = await readAmoJson<{ name?: string }>(res) ?? {}
  const current = (data.name ?? '').trim()
  if (current && !looksLikePhone(current)) return // уже есть нормальное имя — не перетираем
  await amoFetch(`/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: realName }),
  })
}

export async function createContact(params: {
  name: string
  phone: string
}): Promise<number> {
  const res = await amoFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify([{
      name: params.name,
      custom_fields_values: [{
        field_code: 'PHONE',
        values: [{ value: params.phone, enum_code: 'WORK' }],
      }],
    }]),
  })
  const data = await readAmoJson<{ _embedded?: { contacts?: Array<{ id: number }> } }>(res)
  const id = data?._embedded?.contacts?.[0]?.id
  if (!id) throw new Error('amoCRM: createContact — no id returned')
  return id
}

// PATCH кастомных полей контакта (реквизиты). Пустые значения шлём как [] — очищают поле.
export async function patchContactFields(
  contactId: number,
  fields: Array<{ field_id: number; value: string }>,
): Promise<void> {
  const custom_fields_values = fields.map((f) => ({
    field_id: f.field_id,
    values: f.value ? [{ value: f.value }] : [],
  }))
  await amoFetch(`/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify({ custom_fields_values }),
  })
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export async function createLead(params: {
  name: string
  price: number
  contactId?: number          // опционален: лид обращения может быть без контакта (аноним)
  pipelineId: number
  statusId: number
  customFields?: Array<{ field_id: number; values: Array<{ value: string }> }>
  tags?: string[]
}): Promise<number> {
  const body: Record<string, unknown> = {
    name:        params.name,
    price:       Math.round(params.price),
    pipeline_id: params.pipelineId,
    status_id:   params.statusId,
    _embedded: {
      ...(params.contactId ? { contacts: [{ id: params.contactId }] } : {}),
      tags: (params.tags ?? []).map(name => ({ name })),
    },
  }
  if (params.customFields?.length) {
    body.custom_fields_values = params.customFields
  }
  const res = await amoFetch('/leads', {
    method: 'POST',
    body: JSON.stringify([body]),
  })
  const data = await readAmoJson<{ _embedded?: { leads?: Array<{ id: number }> } }>(res)
  const id = data?._embedded?.leads?.[0]?.id
  if (!id) throw new Error('amoCRM: createLead — no id returned')
  return id
}

// Полная сделка из amoCRM (для вебхука — источник истины по этапу и кастомным полям).
export async function getLead(leadId: number): Promise<any> {
  const res = await amoFetch(`/leads/${leadId}`)
  if (res.status === 204) return null
  return readAmoJson<any>(res)
}

// Сырой lead из amoCRM в объёме, который нужен follow-up-механике (id/status/поля).
export interface AmoLeadRaw {
  id: number
  status_id: number
  custom_fields_values?: Array<{ field_id: number; values?: Array<{ value: unknown }> }> | null
  [k: string]: unknown
}

// Достать значение кастомного поля сделки по field_id (первое непустое), иначе null.
export function leadFieldValue(lead: any, fieldId: number): string | null {
  const f = (lead?.custom_fields_values ?? []).find((x: any) => x.field_id === fieldId)
  const v = f?.values?.map((x: any) => x.value).find((x: any) => x != null && String(x).trim() !== '')
  return v != null ? String(v) : null
}

// Передвинуть лид по этапу (и при необходимости сменить воронку). Идемпотентно.
export async function patchLeadStage(leadId: number, statusId: number, pipelineId?: number): Promise<void> {
  const body: Record<string, unknown> = { status_id: statusId }
  if (pipelineId) body.pipeline_id = pipelineId
  await amoFetch(`/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

// PATCH кастомных полей СДЕЛКИ (аналог patchContactFields для контакта). Числовое 0 —
// валидное значение (не очищаем); '' и null/undefined → values:[] (очистка поля).
// Идемпотентно. Используется follow-up-механикой кампании (campaign-followup.ts /
// campaign-handoff.ts): счётчик, окно, umnico ref.
export async function patchLeadFields(
  leadId: number,
  fields: Array<{ field_id: number; value: string | number | null | undefined }>,
): Promise<void> {
  const custom_fields_values = fields.map((f) => ({
    field_id: f.field_id,
    values: f.value === '' || f.value == null ? [] : [{ value: f.value }],
  }))
  await amoFetch(`/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ custom_fields_values }),
  })
}

// Все сделки воронки (для крона follow-up кампании). Пагинация по page (limit 250);
// 204 → []. Возвращает сырые lead-объекты (id, status_id, custom_fields_values, …).
// НЕ бросает на «пусто». maxPages — страховка от бесконечного цикла.
export async function listLeadsByPipeline(
  pipelineId: number,
  opts: { withParam?: string; maxPages?: number } = {},
): Promise<AmoLeadRaw[]> {
  const out: AmoLeadRaw[] = []
  const maxPages = opts.maxPages ?? 20
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({
      'filter[pipeline_id]': String(pipelineId),
      limit: '250',
      page: String(page),
    })
    if (opts.withParam) qs.set('with', opts.withParam)
    const res = await amoFetch(`/leads?${qs.toString()}`)
    if (res.status === 204) break
    const data = await readAmoJson<{ _embedded?: { leads?: AmoLeadRaw[] } }>(res)
    const leads = data?._embedded?.leads ?? []
    out.push(...leads)
    if (leads.length < 250) break
  }
  return out
}

// Переименовать лид (при подхвате анонимного обращения регистрацией).
export async function patchLeadName(leadId: number, name: string): Promise<void> {
  await amoFetch(`/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

// Привязать контакт к существующему лиду (lead-first сценарий: лид создан без контакта,
// контакт появился позже — захват телефона / регистрация).
export async function linkContactToLead(leadId: number, contactId: number): Promise<void> {
  await amoFetch(`/leads/${leadId}/link`, {
    method: 'POST',
    body: JSON.stringify([{ to_entity_id: contactId, to_entity_type: 'contacts' }]),
  })
}

// Добавить теги к лиду, не затирая существующие (PATCH _embedded.tags заменяет набор).
export async function addLeadTags(leadId: number, tags: string[]): Promise<void> {
  if (!tags.length) return
  const lead = await getLead(leadId)
  const existing: string[] = (lead?._embedded?.tags ?? []).map((t: any) => t.name).filter(Boolean)
  const merged = [...new Set([...existing, ...tags])]
  await amoFetch(`/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ _embedded: { tags: merged.map((name) => ({ name })) } }),
  })
}

// Снять теги с лида, сохранив остальные (PATCH _embedded.tags заменяет весь набор).
// Нечего снимать → PATCH не отправляем.
export async function removeLeadTags(leadId: number, tags: string[]): Promise<void> {
  if (!tags.length) return
  const lead = await getLead(leadId)
  const existing: string[] = (lead?._embedded?.tags ?? [])
    .map((t: { name?: string }) => t.name)
    .filter((n: unknown): n is string => Boolean(n))
  const drop = new Set(tags)
  const kept = existing.filter((name) => !drop.has(name))
  if (kept.length === existing.length) return
  await amoFetch(`/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ _embedded: { tags: kept.map((name) => ({ name })) } }),
  })
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function addNote(leadId: number, text: string): Promise<void> {
  await amoFetch(`/leads/${leadId}/notes`, {
    method: 'POST',
    body: JSON.stringify([{ note_type: 'common', params: { text } }]),
  })
}

// Примечание к произвольной сущности (контакт/сделка). Версия B Такт 1: отражение
// диалога виджета в карточке контакта. Не трогает syncOrderToAmo.
export async function addEntityNote(
  entity: 'contacts' | 'leads',
  id: number,
  text: string,
): Promise<void> {
  await amoFetch(`/${entity}/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify([{ note_type: 'common', params: { text } }]),
  })
}

// ── High-level sync ───────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'

export async function syncPreorderToAmo(orderId: number): Promise<void> {
  const supabase = createAdminClient()

  // 1. Read order (idempotency guard)
  const { data: order } = await supabase
    .from('campaign_orders')
    .select(`
      id, campaign_id, total, status, guest_phone, guest_name, client_id, notes,
      amo_lead_id,
      campaign_order_items (
        qty_ordered, price,
        campaign_items ( oz_delivery_date, products ( display_name, name ) )
      )
    `)
    .eq('id', orderId)
    .single()

  if (!order) throw new Error(`Order ${orderId} not found`)
  if (order.amo_lead_id) return // already synced

  const incrementAttempts = async (error: string) => {
    await supabase.from('campaign_orders').update({
      amo_sync_attempts: (order as any).amo_sync_attempts + 1,
      amo_sync_error: error.slice(0, 500),
    }).eq('id', orderId)
  }

  try {
    // 2. Determine phone & name
    let phone = order.guest_phone ?? ''
    let contactName = order.guest_name ?? `Гость (${phone})`

    if (order.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('phone, name')
        .eq('id', order.client_id)
        .maybeSingle()
      if (client?.phone) phone = client.phone
      if (client?.name) contactName = client.name
    }

    const phones = normalizePhoneAmo(phone)

    // 3. Find or create contact; patch name if existing contact has phone as name
    let contactId = await findContactByPhone(phones)
    if (!contactId) {
      contactId = await createContact({ name: contactName, phone: phones[0] })
    } else {
      await ensureContactName(contactId, contactName)
    }

    // 4. Prepare custom fields
    const customFields: Array<{ field_id: number; values: Array<{ value: string }> }> = [
      { field_id: CF_ORDERID, values: [{ value: String(orderId) }] },
    ]

    // Delivery date from first item
    const firstItem = (order.campaign_order_items as any[])?.[0]
    const deliveryDate = firstItem?.campaign_items?.oz_delivery_date
    if (deliveryDate) {
      customFields.push({
        field_id: CF_DATA_DOSTAVKI,
        values: [{ value: new Date(deliveryDate).toLocaleDateString('ru-RU') }],
      })
    }

    // 5. Create lead
    const leadId = await createLead({
      name:       `Предзаказ #${orderId} (Сайт)`,
      price:      order.total ?? 0,
      contactId,
      pipelineId: AMO_PIPELINE_ID,
      statusId:   AMO_STATUS_NEW,
      customFields,
      tags:       ['Источник: Сайт', 'Предзаказ'],
    })

    // 6. Add note with order items
    const tz = 'Asia/Oral'
    const lines: string[] = [
      `📋 Предзаказ #${orderId} — кампания #${order.campaign_id}`,
      `📞 ${contactName} ${phone}`,
      `📅 ${new Date().toLocaleString('ru-RU', { timeZone: tz })}`,
      '',
      '--- Позиции ---',
    ]
    for (const item of (order.campaign_order_items as any[]) ?? []) {
      const pName = item.campaign_items?.products?.display_name
             ?? item.campaign_items?.products?.name
             ?? '—'
      const qty   = item.qty_ordered ?? 0
      const price = item.price ?? 0
      const sum   = qty * price
      lines.push(`• ${pName}: ${qty} шт × ${price.toLocaleString('ru-RU')} ₸ = ${sum.toLocaleString('ru-RU')} ₸`)
    }
    lines.push('')
    lines.push(`💰 ИТОГО: ${(order.total ?? 0).toLocaleString('ru-RU')} ₸`)
    if (deliveryDate) {
      lines.push(`📦 Доставка: ${new Date(deliveryDate).toLocaleDateString('ru-RU')}`)
    }

    await addNote(leadId, lines.join('\n'))

    // 7. Update campaign_orders
    await supabase.from('campaign_orders').update({
      amo_lead_id:     leadId,
      amo_contact_id:  contactId,
      amo_synced_at:   new Date().toISOString(),
      amo_sync_error:  null,
    }).eq('id', orderId)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await incrementAttempts(msg)
    throw err // re-throw so caller can see it in logs
  }
}

// ── Витринный заказ (orders) → amoCRM ────────────────────────────────────────

// opts.statusId — стадия создаваемой сделки (по умолч. «Новый»). Ветка счёта-документа
// передаёт AMO_STATUS_INVOICE_ISSUED → сделка на «Счёт выставлен», не на продаже.
// opts.extraTags — добавочные теги (напр. «Счёт выставлен»).
export async function syncOrderToAmo(
  orderId: number,
  opts: { statusId?: number; extraTags?: string[] } = {},
): Promise<void> {
  const supabase = createAdminClient()

  // 1. Читаем заказ (идемпотентность)
  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, total, status, client_id, created_at,
      amo_lead_id, amo_sync_attempts,
      fulfillment_type, delivery_city, delivery_address, delivery_date,
      courier_comment, recipient_name, recipient_phone,
      order_items (
        qty, qty_ordered, qty_actual, price, is_removed, color,
        products ( display_name, name, length_cm, colors, code_1c )
      )
    `)
    .eq('id', orderId)
    .single()

  if (!order) throw new Error(`Order ${orderId} not found`)
  if ((order as any).amo_lead_id) return // уже синкнули

  const incrementAttempts = async (error: string) => {
    await supabase.from('orders').update({
      amo_sync_attempts: ((order as any).amo_sync_attempts ?? 0) + 1,
      amo_sync_error: error.slice(0, 500),
    }).eq('id', orderId)
  }

  try {
    // 2. Клиент → телефон и имя
    const { data: client } = await supabase
      .from('clients')
      .select('phone, name, company_name')
      .eq('id', order.client_id)
      .maybeSingle()

    const phone = client?.phone ?? ''
    const contactName =
      client?.name ??
      (client as any)?.company_name ??
      phone

    const phones = normalizePhoneAmo(phone)

    // 3. Найти или создать контакт; обновить имя если контакт без имени
    let contactId = await findContactByPhone(phones)
    if (!contactId) {
      contactId = await createContact({ name: contactName, phone: phones[0] })
    } else {
      await ensureContactName(contactId, contactName)
    }

    // 4. Позиции (is_removed=false)
    const items = ((order as any).order_items ?? []).filter(
      (i: any) => !i.is_removed
    )

    // 5. Создать сделку — раскладываем структурные поля доставки/получателя по полям сделки.
    const o = order as any
    // textarea-поля: шлём только непустые (пустые при самовывозе — пропускаем, не падаем).
    const cf: Array<{ field_id: number; values: Array<{ value: string }> }> = [
      { field_id: CF_ORDERID, values: [{ value: String(orderId) }] },
    ]
    const pushCf = (field_id: number, value: unknown) => {
      const s = value == null ? '' : String(value).trim()
      if (s) cf.push({ field_id, values: [{ value: s }] })
    }
    pushCf(CF_POLUCHATEL_FIO,     o.recipient_name)
    pushCf(CF_POLUCHATEL_PHONE,   o.recipient_phone)
    pushCf(CF_ADRES_POLUCHATELYA, o.delivery_address)
    pushCf(CF_DATA_DOSTAVKI,      o.delivery_date)
    pushCf(CF_KOMMENTARII,        o.courier_comment)
    // driver_*/DELIVERY_PRICE при создании не заполняем — их вносит менеджер позже.

    // Тег способа получения: доставка → «Доставка · {город}», самовывоз → «Самовывоз».
    const fulfillmentTag = o.fulfillment_type === 'delivery'
      ? `Доставка${o.delivery_city ? ` · ${o.delivery_city}` : ''}`
      : o.fulfillment_type === 'pickup' ? 'Самовывоз' : null

    const leadId = await createLead({
      name:       `Заказ #${orderId} (Сайт)`,
      price:      Number(order.total ?? 0),
      contactId,
      pipelineId: AMO_PIPELINE_ID,
      statusId:   opts.statusId ?? AMO_STATUS_NEW,
      customFields: cf,
      tags: ['Источник: Сайт', ...(fulfillmentTag ? [fulfillmentTag] : []), ...(opts.extraTags ?? [])],
    })

    // 6. Примечание с позициями (для кладовщика — СКЛАДСКОЕ имя + артикул code_1c)
    const tz = 'Asia/Oral'
    const fulfillmentLine = o.fulfillment_type === 'delivery'
      ? `🚚 Доставка${o.delivery_city ? ` — ${o.delivery_city}` : ''}${o.delivery_date ? ` · ${o.delivery_date}` : ''}`
      : o.fulfillment_type === 'pickup' ? '🏪 Самовывоз' : null
    const lines: string[] = [
      `📋 Заказ #${orderId} с витрины`,
      `👤 ${contactName}  📞 ${phone}`,
      `📅 ${new Date(o.created_at).toLocaleString('ru-RU', { timeZone: tz })}`,
      ...(fulfillmentLine ? [fulfillmentLine] : []),
      ...(o.recipient_name || o.recipient_phone ? [`📦 Получатель: ${[o.recipient_name, o.recipient_phone].filter(Boolean).join(', ')}`] : []),
      ...(o.delivery_address ? [`📍 ${o.delivery_address}`] : []),
      '',
      '--- Позиции ---',
    ]
    for (const item of items) {
      const p = item.products
      const qty   = item.qty_actual ?? item.qty_ordered ?? item.qty ?? 0
      const price = Number(item.price ?? 0)
      const code = p?.code_1c ? `[${p.code_1c}] ` : ''   // артикул 1С, если есть
      const nm   = p?.name ?? '—'                         // складское имя (raw 1С), не display_name
      const col  = item.color ? ` (${item.color})` : ''   // выбранный цвет в скобках
      lines.push(`• ${code}${nm}${col} — ${qty} шт × ${price.toLocaleString('ru-RU')} ₸ = ${(qty * price).toLocaleString('ru-RU')} ₸`)
    }
    lines.push('')
    lines.push(`💰 ИТОГО: ${Number(order.total ?? 0).toLocaleString('ru-RU')} ₸`)

    await addNote(leadId, lines.join('\n'))

    // 7. Обновить orders
    await supabase.from('orders').update({
      amo_lead_id:    leadId,
      amo_contact_id: contactId,
      amo_synced_at:  new Date().toISOString(),
      amo_sync_error: null,
    }).eq('id', orderId)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await incrementAttempts(msg)
    throw err
  }
}

// ── Смена статуса заказа → движение по воронке ───────────────────────────────

export async function updateLeadStage(orderId: number): Promise<void> {
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select('amo_lead_id, status, driver_name, driver_phone, driver_car_plate')
    .eq('id', orderId)
    .single()

  if (!order?.amo_lead_id) return // заказ не синкнут с amoCRM
  const statusId = ORDER_STATUS_TO_AMO[order.status ?? '']
  if (!statusId) return // статус не в маппинге — не двигаем

  // Поля водителя (межгород, «в пути») — в кастомные поля сделки вместе со сдвигом этапа.
  // Пишем только заполненные; на прочих статусах массив пуст → PATCH только этапа.
  const cfv: Array<{ field_id: number; values: Array<{ value: string }> }> = []
  if (order.driver_name)      cfv.push({ field_id: CF_DRIVER_NAME, values: [{ value: String(order.driver_name) }] })
  if (order.driver_phone)     cfv.push({ field_id: CF_DRIVER_PHONE, values: [{ value: String(order.driver_phone) }] })
  if (order.driver_car_plate) cfv.push({ field_id: CF_CAR_PLATE, values: [{ value: String(order.driver_car_plate) }] })

  // PATCH безопасен (идемпотентен) — шлём даже если этап уже такой
  await amoFetch(`/leads/${order.amo_lead_id}`, {
    method: 'PATCH',
    body: JSON.stringify(cfv.length ? { status_id: statusId, custom_fields_values: cfv } : { status_id: statusId }),
  })
}

// ── Реквизиты клиента → карточка контакта amoCRM ──────────────────────────────

/**
 * Синхронизировать реквизиты юр.лица (компания + БИН) в контакт amoCRM.
 * Резолвит контакт: clients.amo_contact_id → поиск по телефону → создание; найденный/
 * созданный ID сохраняет обратно в clients.amo_contact_id (раньше связи не было).
 * PATCH-ит контактные поля «Организация» и «БИН/ИИН». Синк ЗАКАЗОВ не затрагивается.
 * Бросает при ошибке — вызывающий оборачивает в try/catch (неблокирующе).
 */
export async function syncClientRequisitesToAmo(clientId: string): Promise<void> {
  const supabase = createAdminClient()
  const { data: client } = await supabase
    .from('clients')
    .select('id, phone, name, company_name, bin, amo_contact_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client?.phone) return

  // 1. Резолв контакта: сохранённый ID → по телефону → создать
  let contactId: number | null = client.amo_contact_id ?? null
  if (!contactId) {
    contactId = await findContactByPhone(normalizePhoneAmo(client.phone))
    if (!contactId) {
      contactId = await createContact({
        name: client.name || client.company_name || client.phone,
        phone: client.phone,
      })
    }
    // Сохраняем связь клиент↔контакт (чтобы дальше не искать по телефону)
    await supabase.from('clients').update({ amo_contact_id: contactId }).eq('id', clientId)
  }

  // 2. Имя контакта (если было пустым/телефоном) + реквизиты в кастомные поля
  if (client.name) await ensureContactName(contactId, client.name)
  await patchContactFields(contactId, [
    { field_id: CF_CONTACT_COMPANY, value: (client.company_name ?? '').trim() },
    { field_id: CF_CONTACT_BIN, value: (client.bin ?? '').trim() },
  ])
}
