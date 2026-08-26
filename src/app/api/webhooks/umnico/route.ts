export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAccessoriesReply, CHANNEL_POLICY, type ChannelMode } from '@/lib/bot/accessories-bot'
import { isLeadEnabled, enableLead, disableLead } from '@/lib/bot/lead-gate'
import { sendMessage, sendPhoto, addTag } from '@/lib/umnico'
import { captureOutreachEvent, extractPhone } from '@/lib/outreach/capture'
import { tryHandleCampaignReply } from '@/lib/outreach/campaign-handoff'

// Дедуп доставок одного messageId. In-memory — переживает только тёплый инстанс,
// достаточно для защиты от повторных ретраев Umnico за короткое окно.
const seen = new Set<string>()
const SEEN_MAX = 1000

function markSeen(id: string): boolean {
  if (seen.has(id)) return true
  seen.add(id)
  if (seen.size > SEEN_MAX) {
    // простая обрезка — удаляем самые старые (порядок вставки в Set сохраняется)
    const first = seen.values().next().value
    if (first !== undefined) seen.delete(first)
  }
  return false
}

interface UmnicoWebhook {
  type?: string
  event?: string
  data?: Record<string, unknown>
  payload?: Record<string, unknown>
  [k: string]: unknown
}

function pick<T = unknown>(obj: Record<string, unknown> | undefined, ...keys: string[]): T | undefined {
  if (!obj) return undefined
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T
  }
  return undefined
}

// Kill-switch: бот отвечает ТОЛЬКО если UMNICO_BOT_ENABLED === 'true'.
// По умолчанию ВЫКЛ — чтобы случайно/после инцидента не отвечал. Включается env-переменной.
const BOT_ENABLED = process.env.UMNICO_BOT_ENABLED === 'true'

export async function POST(req: NextRequest) {
  let body: UmnicoWebhook
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Сырой payload целиком — чтобы сверить реальные имена полей Umnico с парсером.
  console.log('[umnico webhook] raw:', JSON.stringify(body))

  // ── Кампании исходящих Umnico (школьная рассылка 1 сентября и т.п.) — НЕЗАВИСИМО от
  // UMNICO_BOT_ENABLED/CHANNEL_POLICY, отдельный конвейер. Сделку в воронке кампании
  // оператор создаёт ВРУЧНУЮ сам сразу после ручного «Написать первым» в Umnico UI —
  // tryHandleCampaignReply НИЧЕГО не создаёт, только ищет такую сделку по номеру
  // клиента (дальше — свой ИИ-конвейер, см. campaign-handoff.ts). Не нашлась (или saId
  // не совпал, или воронка не сконфигурирована) → null, и вся остальная обработка
  // (capture.ts + AI-бот) идёт ровно как раньше.
  try {
    const top0 = body as Record<string, unknown>
    if ((top0.type ?? top0.event) === 'message.incoming') {
      const msg0 = (top0.message ?? top0.data ?? top0.payload ?? top0) as Record<string, unknown>
      const inner0 = (msg0.message ?? msg0) as Record<string, unknown>
      const src0 = (msg0.source ?? {}) as Record<string, unknown>
      const sa0 = (msg0.sa ?? {}) as Record<string, unknown>
      const sender0 = (msg0.sender ?? {}) as Record<string, unknown>

      const phone = extractPhone(sender0, src0)
      const channelType0 = pick<string>(sa0, 'type')
      // Numeric saId в payload доками не подтверждён — пробуем прочитать (id/realId/saId),
      // иначе (whatsapp2 — единственный канал этого типа в проде) берём из env.
      const saIdRaw = pick<string | number>(sa0, 'id', 'realId', 'saId')
      const saId = saIdRaw !== undefined
        ? Number(saIdRaw)
        : channelType0 === 'whatsapp2' ? Number(process.env.UMNICO_WHATSAPP_SA_ID || 0) : null
      // realId источника — тот же payload, что и pipeline бота ниже использует для
      // fetchDialogContext (см. srcRealId в основном try-блоке); прокидываем, не парсим дважды.
      const realId0 = pick<string | number>(src0, 'realId', 'real_id')

      const dealId = await tryHandleCampaignReply(phone, saId, {
        text: pick<string>(inner0, 'text', 'message', 'body') ?? '',
        umnicoLeadId: pick<string | number>(top0, 'leadId', 'lead_id') ?? null,
        realId: realId0 ?? null,
      })
      if (dealId) return NextResponse.json({ ok: true })
    }
  } catch (e) {
    console.error('[campaign-handoff] failed:', (e as Error)?.message)
  }

  // ── Capture WhatsApp-аутрича в outreach-таблицы (ИЗОЛИРОВАННО, write-only) ──
  // Работает ВСЕГДА, в т.ч. при выключенном боте. Своя обработка ошибок: любой сбой
  // записи в Supabase не влияет на bot-логику и на ответ вебхука (всегда 200).
  // Никакой автоотправки — только зеркалим события.
  try {
    await captureOutreachEvent(body)
  } catch (e) {
    console.error('[outreach capture] failed:', (e as Error)?.message)
  }

  // ── AI-бот: отвечает только при включённом kill-switch (логику НЕ трогаем) ──
  if (!BOT_ENABLED) {
    console.log('[umnico webhook] bot disabled (UMNICO_BOT_ENABLED != true) — только capture')
    return NextResponse.json({ ok: true, disabled: true })
  }

  try {
    const type = body.type ?? body.event

    // Реальная структура payload Umnico:
    //   { type, leadId, message: { messageId, message: { text }, source: {...}, sa: { type } } }
    // Совместимость: leadId/type — верхний уровень; текст/id/source/канал — внутри body.message.
    const top = body as Record<string, unknown>
    const msg = (body.message ?? body.data ?? body.payload ?? body) as Record<string, unknown>
    const inner = (msg.message ?? msg) as Record<string, unknown>
    const srcObj = (msg.source ?? {}) as Record<string, unknown>
    const saObj = (msg.sa ?? {}) as Record<string, unknown>

    const leadId = pick<string | number>(top, 'leadId', 'lead_id', 'dialogId', 'dialog_id')
    const messageId = pick<string | number>(msg, 'messageId', 'message_id', 'id')
    const text = pick<string>(inner, 'text', 'message', 'body')
    const channelType = pick<string>(saObj, 'type')

    // source из вебхука — чтобы не дёргать GET /sources при отправке.
    const srcRealId = pick<string | number>(srcObj, 'realId', 'real_id')
    const payloadSource =
      srcRealId !== undefined
        ? { realId: srcRealId, type: String(pick<string>(srcObj, 'type') ?? 'message') }
        : undefined

    // ── message.outgoing: команды менеджера на диалог (для manual-каналов) ──
    if (type === 'message.outgoing') {
      if (!leadId) return NextResponse.json({ ok: true })

      // Сообщения самого бота игнорируем всегда (анти-петля).
      const senderId = pick<string | number>(msg, 'userId', 'user_id', 'managerId', 'employeeId')
      const botUserId = process.env.UMNICO_BOT_USER_ID
      if (botUserId && senderId !== undefined && String(senderId) === String(botUserId)) {
        console.log('[umnico webhook] skip: own (bot) outgoing')
        return NextResponse.json({ ok: true })
      }

      const cmd = (text ?? '').trim().toLowerCase()
      if (cmd.startsWith('/бот')) {
        await enableLead(leadId, String(senderId ?? 'manager'))
        await sendMessage(leadId, 'Бот включён для этого диалога 🌸', payloadSource)
        console.log('[umnico webhook] manual: enabled lead', String(leadId))
      } else if (cmd.startsWith('/стоп')) {
        await disableLead(leadId)
        console.log('[umnico webhook] manual: disabled lead', String(leadId))
      } else {
        console.log('[umnico webhook] skip: outgoing without command')
      }
      return NextResponse.json({ ok: true })
    }

    // ── дальше только message.incoming ──
    if (type !== 'message.incoming') {
      console.log('[umnico webhook] skip: not message.incoming/outgoing (type=' + String(type) + ')')
      return NextResponse.json({ ok: true })
    }

    // Шаг 1: распарсенный payload
    console.log('[umnico webhook] incoming:', JSON.stringify({ leadId, messageId, text, channel: channelType, source: payloadSource }))

    if (!leadId) {
      console.log('[umnico webhook] skip: no leadId')
      return NextResponse.json({ ok: true })
    }
    if (!text) {
      console.log('[umnico webhook] skip: no text')
      return NextResponse.json({ ok: true })
    }

    // Канальная политика: off / manual / auto. Неизвестный канал → off.
    const mode: ChannelMode = channelType ? (CHANNEL_POLICY[channelType] ?? 'off') : 'off'
    if (mode === 'off') {
      console.log('[umnico webhook] skip: channel off (' + String(channelType) + ')')
      return NextResponse.json({ ok: true })
    }
    if (mode === 'manual') {
      const enabled = await isLeadEnabled(leadId)
      if (!enabled) {
        console.log('[umnico webhook] skip: manual channel, lead not enabled', String(leadId))
        return NextResponse.json({ ok: true })
      }
    }

    // Дедуп повторных доставок
    if (messageId !== undefined && markSeen(String(messageId))) {
      console.log('[umnico webhook] skip: dedup messageId', String(messageId))
      return NextResponse.json({ ok: true, dedup: true })
    }

    // Шаг 2: конвейер бота (внутренние шаги — history/classify/search/compose — логируются в accessories-bot)
    const reply = await getAccessoriesReply(text, { leadId, realId: srcRealId, messageId })
    console.log('[umnico webhook] reply:', reply.text ? `len=${reply.text.length}` : 'none (менеджеру)')

    // Шаг 3: сначала ВСЕГДА текст (source из payload, fallback внутри sendMessage)
    if (reply.text) {
      const sent = await sendMessage(leadId, reply.text, payloadSource)
      console.log('[umnico webhook] umnico send:', sent ? 'ok' : 'failed')
      if (sent) {
        await addTag(leadId, 'отвечено-ботом')

        // Шаг 4: богатая карточка (фото + caption) ОТДЕЛЬНЫМ сообщением ПОСЛЕ текста
        // (решение принято в конвейере, за флагом BOT_SEND_PHOTOS). Тело ответа Umnico при
        // ошибке логирует sendPhoto. Ошибка фото НЕ роняет диалог — текст уже ушёл.
        if (reply.photo) {
          try {
            const okPhoto = await sendPhoto(leadId, reply.photo.imageUrl, reply.photo.caption, payloadSource)
            console.log(okPhoto
              ? `[accessories-bot] photo: sent ${reply.photo.productId} (карточка, caption ${reply.photo.caption.length} симв.)`
              : `[accessories-bot] photo: failed (id ${reply.photo.productId}) — см. ответ Umnico выше`)
          } catch (e) {
            console.error('[accessories-bot] photo: failed', (e as Error)?.message)
          }
        }
      }
    }
  } catch (err) {
    // Любая ошибка не должна приводить к не-200 — иначе Umnico будет ретраить.
    const e = err as Error
    console.error('[umnico webhook] handler error:', e?.message)
    if (e?.stack) console.error('[umnico webhook] stack:', e.stack)
  }

  return NextResponse.json({ ok: true })
}
