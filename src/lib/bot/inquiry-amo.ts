// Версия B, Такт 1.5 — анонимные обращения виджета → отдельная воронка amoCRM
// «Обращения с сайта». Поверх conversations/messages (Такт 1). Двусторонний amoJo НЕ
// трогаем. Всё graceful: нет env-конфига воронки / нет таблиц / ошибка amo → тихо
// выходим, виджет работает как раньше. НЕ зависит и НЕ пересекается с syncOrderToAmo
// (заказы) и Umnico-ботом (WhatsApp).

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { umnicoClient } from '@/lib/umnico/client'
import {
  inquiryConfigured,
  AMO_INQUIRY_PIPELINE_ID, AMO_INQUIRY_STATUS_NEW, AMO_INQUIRY_STATUS_PHONE,
  AMO_INQUIRY_STATUS_REGISTERED,
  createLead, addNote, addEntityNote, patchLeadStage, patchLeadName,
  linkContactToLead, addLeadTags, findContactByPhone, createContact, ensureContactName,
  normalizePhoneAmo,
} from '@/lib/amo'

const SITE = 'https://uralskflowers.kz'

// Интенты из accessories-bot. «smalltalk» — НЕ значимое событие (привет/болтовня).
// Лид обращения создаём на первый значимый ход: вопрос про товар/категорию, по сайту,
// либо «прочее» (живые цветы/статус/жалоба — тоже повод увидеть обращение менеджеру).
export type BotIntent = 'smalltalk' | 'accessories' | 'site_help' | 'other'
export function isSignificantIntent(intent: BotIntent | undefined): boolean {
  return intent === 'accessories' || intent === 'site_help' || intent === 'other'
}

interface ConvRow {
  id: string
  client_id: string | null
  anon_id: string | null
  phone: string | null
  guest_name: string | null
  amo_entity_type: string | null
  amo_entity_id: number | null
  amo_pipeline_id: number | null
  phone_captured: boolean | null
  last_note_at: string | null
}

const CONV_COLS =
  'id, client_id, anon_id, phone, guest_name, amo_entity_type, amo_entity_id, amo_pipeline_id, phone_captured, last_note_at'

async function getConv(conversationId: string): Promise<ConvRow | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('conversations').select(CONV_COLS).eq('id', conversationId).maybeSingle()
    return (data as ConvRow) ?? null
  } catch { return null }
}

function shortAnon(anonId: string | null): string {
  if (!anonId) return '—'
  return anonId.replace(/-/g, '').slice(-6).toUpperCase()
}

/** Названия показанных товаров из messages (бот, products jsonb). Для примечания. */
async function shownProducts(conversationId: string, limit = 12): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('messages')
      .select('products')
      .eq('conversation_id', conversationId)
      .not('products', 'is', null)
      .order('created_at', { ascending: true })
    const names = new Set<string>()
    for (const m of (data ?? []) as Array<{ products: any }>) {
      if (!Array.isArray(m.products)) continue
      for (const p of m.products) {
        const n = p?.display_name
        if (n && names.size < limit) names.add(String(n))
      }
    }
    return [...names]
  } catch { return [] }
}

/**
 * Создать лид обращения (если ещё нет) на первый ЗНАЧИМЫЙ ход анонима. Дедуп: если у
 * беседы уже есть amo_entity_id — не создаём второй (молча выходим). Возвращает leadId
 * или null. Привязка пишется в conversations (amo_entity_type='leads', amo_entity_id,
 * amo_pipeline_id).
 */
export async function ensureInquiryLead(
  conversationId: string,
  opts: { firstUserText?: string } = {},
): Promise<number | null> {
  if (!inquiryConfigured()) return null
  try {
    const conv = await getConv(conversationId)
    if (!conv) return null
    if (conv.amo_entity_id) return conv.amo_entity_id   // дедуп — лид уже есть
    if (conv.client_id) return null                      // известный клиент — не инкуайри-лид

    const admin = createAdminClient()
    const leadId = await createLead({
      name: `Обращение с сайта #${shortAnon(conv.anon_id)}`,
      price: 0,
      pipelineId: AMO_INQUIRY_PIPELINE_ID,
      statusId: AMO_INQUIRY_STATUS_NEW,
      tags: ['Источник: Виджет', 'Аноним'],
    })

    const shown = await shownProducts(conversationId)
    const note = [
      '💬 Анонимное обращение с сайта (AI-виджет)',
      `Гость: ${shortAnon(conv.anon_id)}`,
      opts.firstUserText ? `\nСпросил: ${opts.firstUserText.trim().slice(0, 500)}` : '',
      shown.length ? `\nПоказаны товары: ${shown.join(', ')}` : '',
      `\nЧат начат: ${SITE}`,
    ].filter(Boolean).join('\n')
    await addNote(leadId, note).catch(() => {})

    await admin.from('conversations').update({
      amo_entity_type: 'leads',
      amo_entity_id: leadId,
      amo_pipeline_id: AMO_INQUIRY_PIPELINE_ID,
      last_note_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return leadId
  } catch (e) {
    console.error('[inquiry-amo] ensureInquiryLead:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Захват телефона застрявшего анонима (НЕ полная регистрация — без PIN). Привязывает
 * контакт к лиду обращения, двигает этап → «Оставил телефон», уведомляет менеджера.
 * Создаёт лид обращения, если его ещё не было. Возвращает true при успехе.
 */
export async function capturePhoneToInquiry(
  conversationId: string,
  rawPhone: string,
  name?: string,
): Promise<boolean> {
  if (!inquiryConfigured()) return false
  let phone: string
  try { phone = normalizePhone(rawPhone) } catch { return false }
  try {
    // Гарантируем наличие лида обращения.
    let conv = await getConv(conversationId)
    if (!conv) return false
    if (!conv.amo_entity_id) {
      await ensureInquiryLead(conversationId)
      conv = await getConv(conversationId)
    }
    const leadId = conv?.amo_entity_id
    if (!leadId) return false

    const admin = createAdminClient()
    const safeName = (name ?? '').trim()

    // Контакт: найти по телефону или создать.
    let contactId = await findContactByPhone(normalizePhoneAmo(phone))
    if (!contactId) contactId = await createContact({ name: safeName || phone, phone })
    else if (safeName) await ensureContactName(contactId, safeName).catch(() => {})

    await linkContactToLead(leadId, contactId).catch(() => {})
    await patchLeadStage(leadId, AMO_INQUIRY_STATUS_PHONE).catch(() => {})
    await addEntityNote('leads', leadId,
      `📞 Гость оставил телефон (бот не смог помочь): ${phone}${safeName ? `\nИмя: ${safeName}` : ''}\nНужен звонок менеджера.`,
    ).catch(() => {})

    await admin.from('conversations').update({
      phone, guest_name: safeName || null, phone_captured: true,
      amo_entity_type: 'leads', amo_entity_id: leadId,
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    await notifyManager(
      `📞 Лид с сайта оставил телефон (бот не помог)\n` +
      `${safeName ? `👤 ${safeName}\n` : ''}📞 ${phone}\nОбращение в amoCRM. _Цветы Уральска_`,
    )
    return true
  } catch (e) {
    console.error('[inquiry-amo] capturePhoneToInquiry:', e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Подхват обращения при self-register: найти лид анонимного обращения по anon_id и
 * ОБНОВИТЬ (имя, контакт с телефоном, этап «Зарегистрировался», тег) вместо создания
 * нового. Возвращает leadId, если подхватили существующий лид обращения, иначе null
 * (вызывающий создаёт лид регистрации обычным путём).
 */
export async function promoteInquiryOnRegister(opts: {
  anonId?: string | null
  phone: string
  name: string
  companyName?: string | null
  contactId?: number | null     // если регистрация уже нашла/создала контакт — переиспользуем
}): Promise<number | null> {
  if (!inquiryConfigured()) return null
  if (!opts.anonId) return null
  try {
    const admin = createAdminClient()
    // Лид обращения этого anon_id (в воронке обращений, ещё в работе).
    const { data: conv } = await admin
      .from('conversations')
      .select(CONV_COLS)
      .eq('anon_id', opts.anonId)
      .not('amo_entity_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = conv as ConvRow | null
    if (!row?.amo_entity_id) return null
    if (row.amo_pipeline_id && row.amo_pipeline_id !== AMO_INQUIRY_PIPELINE_ID) return null
    const leadId = row.amo_entity_id

    let phone: string
    try { phone = normalizePhone(opts.phone) } catch { phone = opts.phone }

    // Контакт: переданный, иначе найти по телефону, иначе создать (без дублей).
    let contactId = opts.contactId ?? null
    if (!contactId) {
      contactId = await findContactByPhone(normalizePhoneAmo(phone))
      if (!contactId) contactId = await createContact({ name: opts.name, phone })
    }
    if (contactId) {
      await ensureContactName(contactId, opts.name).catch(() => {})
      await linkContactToLead(leadId, contactId).catch(() => {})
    }

    await patchLeadName(leadId,
      `Регистрация: ${opts.name}${opts.companyName ? ` (${opts.companyName})` : ''}`).catch(() => {})
    await patchLeadStage(leadId, AMO_INQUIRY_STATUS_REGISTERED).catch(() => {})
    await addLeadTags(leadId, ['регистрация-сайт']).catch(() => {})
    await addEntityNote('leads', leadId,
      `✅ Аноним прошёл регистрацию на сайте.\nИмя: ${opts.name}\nТелефон: ${phone}` +
      `${opts.companyName ? `\nКомпания: ${opts.companyName}` : ''}`).catch(() => {})

    // Привязать беседу к клиенту произойдёт в resolveConversation при следующем заходе.
    await admin.from('conversations').update({
      phone, guest_name: opts.name, updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    console.log(`[inquiry-amo] promote: anon ${shortAnon(opts.anonId)} → lead ${leadId} registered`)
    return leadId
  } catch (e) {
    console.error('[inquiry-amo] promoteInquiryOnRegister:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Сводка беседы в примечание amo (дедуп по last_note_at). Пишет в привязанную сущность
 * (лид обращения или контакт известного клиента), только если появились новые сообщения
 * клиента после last_note_at. Используется flush (закрытие виджета) и кроном.
 */
export async function summarizeConversation(
  conversationId: string,
  opts: { cart?: Array<{ name?: string; qty?: number }> } = {},
): Promise<'written' | 'no-new' | 'skip'> {
  try {
    const admin = createAdminClient()
    // Только колонки Такта 1 — чтобы flush/сводки работали даже до миграции 20260623.
    const { data: convData } = await admin
      .from('conversations')
      .select('id, client_id, anon_id, phone, amo_entity_type, amo_entity_id, last_note_at')
      .eq('id', conversationId)
      .maybeSingle()
    const conv = convData as Pick<ConvRow,
      'id' | 'client_id' | 'anon_id' | 'phone' | 'amo_entity_type' | 'amo_entity_id' | 'last_note_at'> | null
    if (!conv?.amo_entity_id) return 'skip'
    const entity = (conv.amo_entity_type === 'contacts' ? 'contacts' : 'leads') as 'contacts' | 'leads'

    // ВСЕ сообщения беседы (полный лог по ролям), последние 80 — чтобы примечание не
    // распухло. Запись гейтим по новизне (есть сообщения после last_note_at), но в
    // примечание кладём ВЕСЬ диалог — менеджер видит весь путь, не только новый кусок.
    const { data: allMsgs } = await admin
      .from('messages')
      .select('role, text, products, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    const all = (allMsgs ?? []) as Array<{ role: string; text: string | null; products: any; created_at: string }>
    const since = conv.last_note_at ?? '1970-01-01T00:00:00Z'
    const hasNew = all.some((m) => m.created_at > since && m.role === 'user' && m.text && m.text.trim())
    if (!hasNew) return 'no-new'

    // «Бот не смог помочь» — реплика бота без товаров с фразой-фолбэком (NOT_FOUND / к менеджеру).
    const NOT_HELPED = /не наш[её]л|не смог|лучше поможет менеджер|точную позицию не наш[её]л|обратитесь к менеджеру|напишите менеджеру|не получилось ответить/i
    const log = all.slice(-80)
    let notHelped = 0
    const lines: string[] = []
    for (const m of log) {
      const role = m.role === 'user' ? 'Клиент' : m.role === 'manager' ? 'Менеджер' : 'Бот'
      const t = (m.text ?? '').trim()
      const hasProducts = Array.isArray(m.products) && m.products.length > 0
      if (t) {
        let mark = ''
        if (m.role === 'bot' && !hasProducts && NOT_HELPED.test(t)) { mark = '   ⚠️ бот не помог'; notHelped++ }
        lines.push(`${role}: ${t}${mark}`)
      }
      if (m.role === 'bot' && hasProducts) {
        const names = m.products.map((p: any) => p?.display_name).filter(Boolean).slice(0, 5)
        if (names.length) lines.push(`   🛍 показаны: ${names.join(', ')}`)
      }
    }

    const cartLines = (opts.cart ?? [])
      .filter((c) => c?.name).map((c) => `• ${c!.name}${c!.qty ? ` — ${c!.qty}` : ''}`).slice(0, 20)

    const who = conv.client_id
      ? `Клиент · ${conv.phone ?? '—'}`
      : `Гость: ${shortAnon(conv.anon_id)}${conv.phone ? ` · ${conv.phone}` : ''}`
    const events: string[] = []
    // Телефон у анонима в беседе = он его оставил (захват застрявшего, без PIN).
    if (!conv.client_id && conv.phone) events.push(`📞 Оставил телефон: ${conv.phone}`)
    if (notHelped) events.push(`⚠️ Бот не смог помочь: ${notHelped} реплик(и) — нужен менеджер`)

    const summary = [
      '💬 Чат на сайте (AI-виджет)', who, '',
      '— История диалога —', ...lines,
      events.length ? `\n${events.join('\n')}` : '',
      cartLines.length ? `\n🛒 В корзине:\n${cartLines.join('\n')}` : '',
    ].filter((s) => s !== '').join('\n')

    await addEntityNote(entity, conv.amo_entity_id, summary)
    await admin.from('conversations').update({
      last_note_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', conversationId)
    return 'written'
  } catch (e) {
    console.error('[inquiry-amo] summarizeConversation:', e instanceof Error ? e.message : e)
    return 'skip'
  }
}

async function notifyManager(text: string): Promise<void> {
  try {
    const mgr = process.env.UMNICO_MANAGER_PHONE
    if (!mgr) return
    if (await umnicoClient.checkContact(mgr)) await umnicoClient.sendMessage(mgr, text)
  } catch (e) { console.error('[inquiry-amo] notifyManager:', e instanceof Error ? e.message : e) }
}

/**
 * Крон-добивка. (1) Досылает сводки по диалогам с новыми сообщениями после last_note_at
 * (клиент ушёл без flush/beforeunload). (2) Помечает «застрявшие» обращения (есть лид,
 * телефон не оставлен, давно молчат, ещё не уведомляли) → уведомление менеджеру.
 * Идемпотентно: дедуп сводок по last_note_at, дедуп уведомлений по stuck_notified_at.
 */
export async function runWidgetAmoSync(opts: { stuckMinutes?: number; sinceHours?: number } = {}): Promise<{
  summarized: number; stuck: number; scanned: number
}> {
  const out = { summarized: 0, stuck: 0, scanned: 0 }
  if (!inquiryConfigured()) return out
  const admin = createAdminClient()
  const stuckMinutes = opts.stuckMinutes ?? 30
  const sinceHours = opts.sinceHours ?? 48

  const sinceIso = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const stuckBefore = new Date(Date.now() - stuckMinutes * 60_000).toISOString()

  // Беседы с лидом, недавно активные (ограничим окно, чтобы не сканировать всё).
  const { data: convs } = await admin
    .from('conversations')
    .select('id, client_id, anon_id, phone, amo_entity_id, phone_captured, last_note_at, stuck_notified_at, updated_at')
    .not('amo_entity_id', 'is', null)
    .gte('updated_at', sinceIso)
    .order('updated_at', { ascending: false })
    .limit(500)

  for (const c of (convs ?? []) as any[]) {
    out.scanned++

    // (1) Досыл сводки.
    const res = await summarizeConversation(c.id)
    if (res === 'written') out.summarized++

    // (2) Застрявший аноним: лид есть, телефон не оставлен, давно молчит, не уведомляли.
    const isStuck =
      !c.client_id && !c.phone_captured && !c.phone &&
      !c.stuck_notified_at && c.updated_at < stuckBefore
    if (isStuck) {
      await notifyManager(
        `⚠️ Потенциально потерянный лид с сайта\n` +
        `Гость ${shortAnon(c.anon_id)} спросил, бот не помог, телефон не оставил.\n` +
        `Обращение в amoCRM (лид #${c.amo_entity_id}). _Цветы Уральска_`,
      )
      await admin.from('conversations')
        .update({ stuck_notified_at: new Date().toISOString() }).eq('id', c.id)
      out.stuck++
    }
  }
  return out
}
