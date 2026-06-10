export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAccessoriesReply, CHANNEL_POLICY, type ChannelMode } from '@/lib/bot/accessories-bot'
import { isLeadEnabled, enableLead, disableLead } from '@/lib/bot/lead-gate'
import { sendMessage, addTag } from '@/lib/umnico'

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
  if (!BOT_ENABLED) {
    console.log('[umnico webhook] disabled (UMNICO_BOT_ENABLED != true) — игнор')
    return NextResponse.json({ ok: true, disabled: true })
  }

  let body: UmnicoWebhook
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Сырой payload целиком — чтобы сверить реальные имена полей Umnico с парсером.
  console.log('[umnico webhook] raw:', JSON.stringify(body))

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
    console.log('[umnico webhook] reply:', reply ? `len=${reply.length}` : 'none (менеджеру)')

    // Шаг 3: отправка в Umnico (source из payload, fallback внутри sendMessage)
    if (reply) {
      const sent = await sendMessage(leadId, reply, payloadSource)
      console.log('[umnico webhook] umnico send:', sent ? 'ok' : 'failed')
      if (sent) {
        await addTag(leadId, 'отвечено-ботом')
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
