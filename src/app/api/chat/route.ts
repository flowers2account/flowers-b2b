import { NextRequest, NextResponse } from 'next/server'
import { getAccessoriesReply } from '@/lib/bot/accessories-bot'
import type { DialogMessage } from '@/lib/umnico'
import { resolveConversation, loadHistory, saveMessages } from '@/lib/bot/conversation-store'
import { ensureInquiryLead, isSignificantIntent } from '@/lib/bot/inquiry-amo'

export const dynamic = 'force-dynamic'

// Нативный AI-виджет сайта. Принимает { message, history[], anon_id, phone }.
// Версия B Такт 1: история диалога ПЕРСИСТИТСЯ в Supabase (conversations/messages) и
// берётся оттуда (память между визитами). Беседа резолвится: залогинен (phone→client)
// → по client_id; гость → по anon_id. Persistence graceful: если таблиц ещё нет
// (миграция не применена) — работаем как раньше (история из тела). Umnico-путь (WhatsApp)
// использует свой источник истории и НЕ затронут.
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ text: null, products: [] })

  const anonId = typeof body?.anon_id === 'string' ? body.anon_id.trim() : ''
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''

  // История из тела (легаси / фолбэк, если БД недоступна).
  const rawHist = Array.isArray(body?.history) ? body.history : []
  const bodyHistory: DialogMessage[] = rawHist
    .filter((m: any) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-10)
    .map((m: any) => ({ role: m.role === 'bot' || m.role === 'manager' ? m.role : 'client', text: String(m.text) }))

  // Беседа + история из БД (если таблицы есть). conv=null → деградация к bodyHistory.
  const conv = await resolveConversation({ anonId: anonId || null, phone: phone || null })
  const history = conv ? await loadHistory(conv.id) : bodyHistory

  try {
    const reply = await getAccessoriesReply(message, { history, channel: 'widget' })

    // Чипы-уточнения: «Варианты: A / B / C» → chips[].
    let text = reply.text
    let chips: string[] = []
    if (text) {
      const m = text.match(/(?:^|\n)\s*Варианты:\s*(.+?)\s*$/i)
      if (m) {
        chips = m[1].split(/\s*[/|]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
        text = text.replace(m[0], '').trim()
      }
    }

    // Сохраняем диалог (user + bot). Неблокирующе.
    if (conv) {
      await saveMessages(conv.id, [
        { role: 'user', text: message },
        { role: 'bot', text, products: reply.products && reply.products.length ? reply.products : null },
      ])
    }

    // Анонимные обращения в amoCRM (Версия B Такт 1.5). Только гость (нет clientId),
    // только значимый ход (НЕ smalltalk). Дедуп по conversation внутри ensureInquiryLead.
    const significant = isSignificantIntent(reply.meta?.intent)
    if (conv && !conv.clientId && significant) {
      await ensureInquiryLead(conv.id, { firstUserText: message })
    }

    // «Застрявший» аноним: бот не смог помочь по значимому запросу → предложить оставить
    // телефон. Только гостю. Виджет покажет форму захвата контакта (НЕ полная регистрация).
    const askPhone = !conv?.clientId && significant && reply.meta?.helped === false

    return NextResponse.json({
      text,
      products: reply.products ?? [],
      chips,
      action: reply.action,          // 'register'|'login' → виджет открывает форму
      ask_phone: askPhone,           // true → виджет предлагает оставить телефон
      conversation_id: conv?.id,     // на будущее (Такт 2 / клиент)
    })
  } catch (err) {
    console.error('[api/chat]', err instanceof Error ? err.message : err)
    return NextResponse.json({ text: null, products: [] })
  }
}
