import { NextRequest, NextResponse } from 'next/server'
import { getAccessoriesReply } from '@/lib/bot/accessories-bot'
import type { DialogMessage } from '@/lib/umnico'

export const dynamic = 'force-dynamic'

// Нативный AI-виджет сайта. Принимает { message, history[] } (история — из браузерной
// сессии, НЕ из Umnico), вызывает тот же мозг getAccessoriesReply, возвращает
// { text, products[] }. Gemini-ключ остаётся на сервере. Umnico-путь (WhatsApp) не задействован.
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ text: null, products: [] })

  // История из тела: последние ~10 сообщений, нормализуем роли (client/bot/manager).
  const rawHist = Array.isArray(body?.history) ? body.history : []
  const history: DialogMessage[] = rawHist
    .filter((m: any) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-10)
    .map((m: any) => ({
      role: m.role === 'bot' || m.role === 'manager' ? m.role : 'client',
      text: String(m.text),
    }))

  try {
    const reply = await getAccessoriesReply(message, { history, channel: 'widget' })

    // Чипы-уточнения: бот может закончить строкой «Варианты: A / B / C» → вынимаем в chips[]
    // и убираем строку из текста.
    let text = reply.text
    let chips: string[] = []
    if (text) {
      const m = text.match(/(?:^|\n)\s*Варианты:\s*(.+?)\s*$/i)
      if (m) {
        chips = m[1].split(/\s*[/|]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
        text = text.replace(m[0], '').trim()
      }
    }

    return NextResponse.json({
      text,                             // null → вне зоны бота (мягко уводим к менеджеру на клиенте)
      products: reply.products ?? [],   // богатые карточки строятся из этого
      chips,                            // кликабельные варианты-уточнения
      action: reply.action,             // 'register'|'login' → виджет открывает форму в чате
    })
  } catch (err) {
    console.error('[api/chat]', err instanceof Error ? err.message : err)
    return NextResponse.json({ text: null, products: [] })
  }
}
