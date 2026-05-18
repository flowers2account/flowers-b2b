import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { product_name, quantity, reason, photo_url } = await req.json()

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID

    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn('[telegram/notify-writeoff] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set')
      return NextResponse.json({ success: false, error: 'Telegram not configured' }, { status: 500 })
    }

    const now = new Date().toLocaleString('ru-RU', {
      timeZone: 'Asia/Oral',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const text = `🗑 *Списание товара*\n\n📦 Товар: ${product_name}\n🔢 Количество: ${quantity} шт\n📝 Причина: ${reason || 'Не указана'}\n\n⏰ ${now}`

    const apiBase = `https://api.telegram.org/bot${BOT_TOKEN}`

    let res: Response
    if (photo_url) {
      res = await fetch(`${apiBase}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, photo: photo_url, caption: text, parse_mode: 'Markdown' }),
      })
    } else {
      res = await fetch(`${apiBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
      })
    }

    const data = await res.json()
    if (!data.ok) {
      console.error('[telegram/notify-writeoff] API error:', data)
      throw new Error(data.description || 'Telegram send failed')
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to send notification'
    console.error('Notify writeoff error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
