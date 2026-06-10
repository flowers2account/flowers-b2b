export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAccessoriesReply } from '@/lib/bot/accessories-bot'
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

export async function POST(req: NextRequest) {
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
    // Обрабатываем ТОЛЬКО входящие сообщения. message.outgoing и пр. — игнор (защита от петли).
    if (type !== 'message.incoming') {
      console.log('[umnico webhook] skip: not message.incoming (type=' + String(type) + ')')
      return NextResponse.json({ ok: true })
    }

    // Реальная структура payload Umnico:
    //   { type, leadId, message: { messageId, message: { text }, source: { realId, type } } }
    // Совместимость: leadId/type — верхний уровень; текст/id/source — внутри body.message.
    const top = body as Record<string, unknown>
    const msg = (body.message ?? body.data ?? body.payload ?? body) as Record<string, unknown>
    const inner = (msg.message ?? msg) as Record<string, unknown>
    const srcObj = (msg.source ?? {}) as Record<string, unknown>

    const leadId = pick<string | number>(top, 'leadId', 'lead_id', 'dialogId', 'dialog_id')
    const messageId = pick<string | number>(msg, 'messageId', 'message_id', 'id')
    const text = pick<string>(inner, 'text', 'message', 'body')

    // source из вебхука — чтобы не дёргать GET /sources при отправке.
    const srcRealId = pick<string | number>(srcObj, 'realId', 'real_id')
    const payloadSource =
      srcRealId !== undefined
        ? { realId: srcRealId, type: String(pick<string>(srcObj, 'type') ?? 'message') }
        : undefined

    // Шаг 1: распарсенный payload
    console.log('[umnico webhook] incoming:', JSON.stringify({ leadId, messageId, text, source: payloadSource }))

    if (!leadId) {
      console.log('[umnico webhook] skip: no leadId')
      return NextResponse.json({ ok: true })
    }
    if (!text) {
      console.log('[umnico webhook] skip: no text')
      return NextResponse.json({ ok: true })
    }

    // Дедуп повторных доставок
    if (messageId !== undefined && markSeen(String(messageId))) {
      console.log('[umnico webhook] skip: dedup messageId', String(messageId))
      return NextResponse.json({ ok: true, dedup: true })
    }

    // Шаг 2: конвейер бота (внутренние шаги — classify/search/compose — логируются в accessories-bot)
    const reply = await getAccessoriesReply(text)
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
