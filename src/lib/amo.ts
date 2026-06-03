// amoCRM API v4 integration — server-only
// Token: process.env.AMO_ACCESS_TOKEN (never NEXT_PUBLIC)

const BASE = 'https://tropinvladislav1.amocrm.ru/api/v4'

export const AMO_PIPELINE_ID = 10853806

// Этапы воронки 10853806 (GET /api/v4/leads/pipelines/10853806)
export const AMO_STATUS_NEW       = 85413462  // Новый
export const AMO_STATUS_RESERVED  = 85413466  // В брони
export const AMO_STATUS_CONFIRMED = 85413470  // Подтверждён
export const AMO_STATUS_ASSEMBLING = 86286418 // В сборке
export const AMO_STATUS_ASSEMBLED  = 86286422 // Готово к выдаче
export const AMO_STATUS_DELIVERED  = 142       // Выдан (финал успешно)
export const AMO_STATUS_CANCELLED  = 143       // Отменён (финал)

// Маппинг order_status → этап amoCRM
// pending/cart/in_transit/arrived — не двигаем
const ORDER_STATUS_TO_AMO: Record<string, number> = {
  reserved:   AMO_STATUS_RESERVED,
  confirmed:  AMO_STATUS_CONFIRMED,
  assembling: AMO_STATUS_ASSEMBLING,
  assembled:  AMO_STATUS_ASSEMBLED,
  delivered:  AMO_STATUS_DELIVERED,
  cancelled:  AMO_STATUS_CANCELLED,
}

// Custom field IDs (from /api/v4/leads/custom_fields)
export const CF_ORDERID       = 1394611   // ORDERID  (textarea)
export const CF_DATA_DOSTAVKI = 1394599   // ДАТА_ДОСТАВКИ (textarea)

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function token(): string {
  const t = process.env.AMO_ACCESS_TOKEN
  if (!t) throw new Error('AMO_ACCESS_TOKEN not set')
  return t
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
    throw new Error(`amoCRM ${res.status} ${path}: ${body.slice(0, 300)}`)
  }

  return res
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

export async function findContactByPhone(phones: string[]): Promise<number | null> {
  const seen = new Set<number>()
  for (const phone of phones) {
    const res = await amoFetch(`/contacts?query=${encodeURIComponent(phone)}&limit=5`)
    if (res.status === 204) continue
    const data = await res.json()
    const contacts = data?._embedded?.contacts ?? []
    for (const c of contacts) {
      if (!seen.has(c.id)) { seen.add(c.id); return c.id }
    }
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
  const data = await res.json()
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
  const data = await res.json()
  const id = data?._embedded?.contacts?.[0]?.id
  if (!id) throw new Error('amoCRM: createContact — no id returned')
  return id
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export async function createLead(params: {
  name: string
  price: number
  contactId: number
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
      contacts: [{ id: params.contactId }],
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
  const data = await res.json()
  const id = data?._embedded?.leads?.[0]?.id
  if (!id) throw new Error('amoCRM: createLead — no id returned')
  return id
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function addNote(leadId: number, text: string): Promise<void> {
  await amoFetch(`/leads/${leadId}/notes`, {
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

export async function syncOrderToAmo(orderId: number): Promise<void> {
  const supabase = createAdminClient()

  // 1. Читаем заказ (идемпотентность)
  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, total, status, client_id, created_at,
      amo_lead_id, amo_sync_attempts,
      order_items (
        qty, qty_ordered, price, is_removed,
        products ( display_name, name, length_cm, colors )
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

    // 5. Создать сделку
    // TODO: при будущем маппинге статусов orders → этапы воронки amoCRM
    //   (pending→Новый, confirmed→Подтверждён, assembled→В сборке и т.д.)
    //   заменить AMO_STATUS_NEW на динамическое значение по order.status
    const leadId = await createLead({
      name:       `Заказ #${orderId} (Сайт)`,
      price:      Number(order.total ?? 0),
      contactId,
      pipelineId: AMO_PIPELINE_ID,
      statusId:   AMO_STATUS_NEW,
      customFields: [
        { field_id: CF_ORDERID, values: [{ value: String(orderId) }] },
        // DATA_DOSTAVKI: в orders колонки с датой доставки нет → пропускаем
      ],
      tags: ['Источник: Сайт'],
    })

    // 6. Примечание с позициями
    const tz = 'Asia/Oral'
    const lines: string[] = [
      `📋 Заказ #${orderId} с витрины`,
      `👤 ${contactName}  📞 ${phone}`,
      `📅 ${new Date((order as any).created_at).toLocaleString('ru-RU', { timeZone: tz })}`,
      '',
      '--- Позиции ---',
    ]
    for (const item of items) {
      const p = item.products
      const qty   = item.qty_ordered ?? item.qty ?? 0
      const price = Number(item.price ?? 0)
      let label = p?.display_name ?? p?.name ?? '—'
      if (p?.length_cm) label += ` ${p.length_cm}см`
      if (p?.colors?.length) label += ` (${(p.colors as string[]).join(', ')})`
      lines.push(`• ${label}: ${qty} шт × ${price.toLocaleString('ru-RU')} ₸ = ${(qty * price).toLocaleString('ru-RU')} ₸`)
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
    .select('amo_lead_id, status')
    .eq('id', orderId)
    .single()

  if (!order?.amo_lead_id) return // заказ не синкнут с amoCRM
  const statusId = ORDER_STATUS_TO_AMO[order.status ?? '']
  if (!statusId) return // статус не в маппинге — не двигаем

  // PATCH безопасен (идемпотентен) — шлём даже если этап уже такой
  await amoFetch(`/leads/${order.amo_lead_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status_id: statusId }),
  })
}
