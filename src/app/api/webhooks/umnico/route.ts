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

  try {
    const type = body.type ?? body.event
    // Обрабатываем ТОЛЬКО входящие сообщения. message.outgoing и пр. — игнор (защита от петли).
    if (type !== 'message.incoming') {
      return NextResponse.json({ ok: true })
    }

    const d = (body.data ?? body.payload ?? body) as Record<string, unknown>

    const leadId = pick<string | number>(d, 'leadId', 'lead_id', 'dialogId', 'dialog_id')
    const messageId = pick<string | number>(d, 'messageId', 'message_id', 'id')
    const text = pick<string>(d, 'text', 'message', 'body')

    // Шаг 1: распарсенный payload
    console.log('[umnico webhook] incoming:', JSON.stringify({ leadId, messageId, text }))

    if (!leadId || !text) {
      console.log('[umnico webhook] skip: no leadId/text')
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

    // Шаг 3: отправка в Umnico
    if (reply) {
      const sent = await sendMessage(leadId, reply)
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
