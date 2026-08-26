// Захват WhatsApp-аутрича из Umnico в Supabase (таблицы outreach_contacts /
// outreach_messages). Только запись — НИКАКОЙ автоотправки (защита от бана).
//
// Вызывается из вебхука Umnico (src/app/api/webhooks/umnico/route.ts) ИЗОЛИРОВАННЫМ
// блоком ПЕРЕД bot-логикой. Любая ошибка гасится внутри — не влияет на бота и ответ.
// Работает всегда, даже когда AI-бот выключен (UMNICO_BOT_ENABLED != true).
//
// Бот-логику не трогаем: канал whatsapp2 у бота как был 'off', так и остался. Здесь
// мы параллельно зеркалим события WhatsApp в отдельные таблицы.

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { normalizePhoneAmo, findLeadByPhoneInPipeline } from '@/lib/amo'

// Воронка «Обзвон LAPS» (см. memory project_laps_outreach).
const LAPS_PIPELINE_ID = 11053958

function pick<T = unknown>(obj: Record<string, unknown> | undefined, ...keys: string[]): T | undefined {
  if (!obj) return undefined
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') return v as T
  }
  return undefined
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

// Похоже ли значение на телефонный номер (≥10 цифр).
function looksLikePhone(s: unknown): boolean {
  return typeof s === 'string' && (s.replace(/\D/g, '').length >= 10)
}

// Телефон КЛИЕНТА (не наш). Структура payload Umnico (whatsapp2), подтверждена по логам:
//   message.sender.socialId  = "77718678067"      ← номер клиента (цифры)
//   message.source.sender    = "77718678067"      ← он же
//   message.source.id        = "77718678067@c.us" ← он же с суффиксом
// ⚠️ message.source.identifier и message.sa.login = НАШ номер компании — их НЕ берём.
export function extractPhone(sender: Record<string, unknown>, src: Record<string, unknown>): string | null {
  const raw =
    pick<string | number>(sender, 'socialId', 'social_id', 'phone')
    ?? pick<string | number>(src, 'sender')
    ?? (pick<string>(src, 'id')?.split('@')[0])
  if (raw == null) return null
  const s = String(raw)
  return looksLikePhone(s) ? normalizePhone(s) : null
}

// Имя клиента: message.sender.name / login (напр. "Аида").
function extractName(sender: Record<string, unknown>): string | null {
  const n = pick<string>(sender, 'name', 'login', 'fullName')
  return n && !looksLikePhone(n) ? n.trim() : null
}

// Время сообщения из payload (unix s/ms или ISO) → ISO; иначе null (БД проставит created_at).
function extractSentAt(...objs: Record<string, unknown>[]): string | null {
  for (const o of objs) {
    const v = pick<string | number>(o, 'datetime', 'createdAt', 'created_at', 'timestamp', 'time', 'date')
    if (v === undefined) continue
    if (typeof v === 'number') {
      const ms = v < 1e12 ? v * 1000 : v
      const d = new Date(ms)
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    } else if (typeof v === 'string') {
      const d = new Date(v)
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
  }
  return null
}

/**
 * Зеркалит одно событие Umnico (входящее/исходящее WhatsApp) в outreach-таблицы.
 * Никогда не кидает наружу — все ошибки логируются и гасятся.
 */
export async function captureOutreachEvent(body: unknown): Promise<void> {
  try {
    const top = asObj(body)
    const type = (pick<string>(top, 'type', 'event') ?? '').toString()

    // Только события сообщений. Направление берём строго из типа.
    const direction = type === 'message.outgoing' ? 'out'
                    : type === 'message.incoming' ? 'in'
                    : null
    if (!direction) return

    const msg = asObj(top.message ?? top.data ?? top.payload ?? top)
    const inner = asObj(msg.message ?? msg)
    const src = asObj(msg.source)
    const sa = asObj(msg.sa)
    const sender = asObj(msg.sender)

    // Только WhatsApp-каналы (аутрич идёт по whatsapp2). Прочее (виджет и т.п.) не зеркалим.
    const channel = pick<string>(sa, 'type')
    if (!channel || !/whatsapp/i.test(channel)) return

    const umnicoLeadId = pick<string | number>(top, 'leadId', 'lead_id', 'dialogId', 'dialog_id')
    const umnicoMsgId  = pick<string | number>(msg, 'messageId', 'message_id', 'id')
    const text         = pick<string>(inner, 'text', 'message', 'body') ?? null
    const senderId     = pick<string | number>(msg, 'userId', 'user_id', 'managerId', 'employeeId')
    const deliveryStatus = pick<string>(msg, 'status') ?? pick<string>(inner, 'status') ?? null
    const sentAt       = extractSentAt(inner, msg, top)

    const phone = extractPhone(sender, src)
    const name  = extractName(sender)
    const leadIdStr = umnicoLeadId !== undefined ? String(umnicoLeadId) : null

    const sb = createAdminClient()

    // ── Резолв контакта: по телефону, затем по umnico_lead_id, иначе создаём ──
    const contactId = await resolveContact(sb, { phone, name, umnicoLeadId: leadIdStr })
    if (!contactId) {
      console.error('[outreach capture] не удалось получить contact_id — пропуск')
      return
    }

    // ── Идемпотентная запись сообщения ──
    const row = {
      contact_id: contactId,
      direction,
      text,
      channel,
      umnico_message_id: umnicoMsgId !== undefined ? String(umnicoMsgId) : null,
      umnico_lead_id: leadIdStr,
      sender_user_id: senderId !== undefined ? String(senderId) : null,
      delivery_status: deliveryStatus,
      sent_at: sentAt,
      raw: body as Record<string, unknown>,
    }

    if (row.umnico_message_id) {
      const { error } = await sb
        .from('outreach_messages')
        .upsert(row, { onConflict: 'umnico_message_id', ignoreDuplicates: true })
      if (error) console.error('[outreach capture] upsert message error:', error.message)
    } else {
      // Без id Umnico дедуп невозможен — пишем как есть (редкий случай).
      const { error } = await sb.from('outreach_messages').insert(row)
      if (error) console.error('[outreach capture] insert message error:', error.message)
    }

    console.log(`[outreach capture] ${direction} ${channel} → contact ${contactId}` +
      (phone ? ` (${phone})` : '') + (row.umnico_message_id ? ` msg ${row.umnico_message_id}` : ''))
  } catch (e) {
    console.error('[outreach capture] error:', (e as Error)?.message)
  }
}

type SB = ReturnType<typeof createAdminClient>

// Найти/создать контакт. Приоритет: телефон → umnico_lead_id → новый.
// Дозаполняет пустые поля (phone/umnico_lead_id/name) и best-effort линкует к сделке amo.
async function resolveContact(
  sb: SB,
  { phone, name, umnicoLeadId }: { phone: string | null; name: string | null; umnicoLeadId: string | null },
): Promise<string | null> {
  type Contact = { id: string; phone: string | null; umnico_lead_id: string | null; name: string | null; amo_lead_id: number | null }

  let contact: Contact | null = null

  if (phone) {
    const { data } = await sb.from('outreach_contacts')
      .select('id, phone, umnico_lead_id, name, amo_lead_id').eq('phone', phone).maybeSingle()
    contact = (data as Contact) ?? null
  }
  if (!contact && umnicoLeadId) {
    const { data } = await sb.from('outreach_contacts')
      .select('id, phone, umnico_lead_id, name, amo_lead_id').eq('umnico_lead_id', umnicoLeadId).maybeSingle()
    contact = (data as Contact) ?? null
  }

  // Создание нового контакта.
  if (!contact) {
    const amo = phone ? await linkAmo(phone) : null
    const { data, error } = await sb.from('outreach_contacts')
      .insert({
        phone, name, umnico_lead_id: umnicoLeadId,
        amo_lead_id: amo?.leadId ?? null,
        amo_contact_id: amo?.contactId ?? null,
      })
      .select('id').single()
    if (error) {
      // Гонка на уникальном ключе — перечитываем.
      console.error('[outreach capture] insert contact error:', error.message)
      if (phone) {
        const { data: re } = await sb.from('outreach_contacts').select('id').eq('phone', phone).maybeSingle()
        if (re) return (re as { id: string }).id
      }
      if (umnicoLeadId) {
        const { data: re } = await sb.from('outreach_contacts').select('id').eq('umnico_lead_id', umnicoLeadId).maybeSingle()
        if (re) return (re as { id: string }).id
      }
      return null
    }
    return (data as { id: string }).id
  }

  // Дозаполнение пустых полей существующего контакта.
  const patch: Record<string, unknown> = {}
  if (phone && !contact.phone) patch.phone = phone
  if (umnicoLeadId && !contact.umnico_lead_id) patch.umnico_lead_id = umnicoLeadId
  if (name && !contact.name) patch.name = name
  if (contact.amo_lead_id == null && phone) {
    const amo = await linkAmo(phone)
    if (amo) { patch.amo_lead_id = amo.leadId; patch.amo_contact_id = amo.contactId }
  }
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString()
    const { error } = await sb.from('outreach_contacts').update(patch).eq('id', contact.id)
    if (error) console.error('[outreach capture] update contact error:', error.message)
  }
  return contact.id
}

// Best-effort линк к сделке amoCRM (воронка «Обзвон LAPS») по телефону. Ошибки гасим.
async function linkAmo(phone: string): Promise<{ leadId: number; contactId: number } | null> {
  try {
    return await findLeadByPhoneInPipeline(normalizePhoneAmo(phone), LAPS_PIPELINE_ID)
  } catch (e) {
    console.error('[outreach capture] amo link failed:', (e as Error)?.message)
    return null
  }
}
