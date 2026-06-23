import { NextRequest, NextResponse } from 'next/server'
import { runWidgetAmoSync } from '@/lib/bot/inquiry-amo'

export const dynamic = 'force-dynamic'

// Версия B Такт 1.5 — крон-добивка обращений виджета в amoCRM.
// (1) досылает сводки по диалогам с новыми сообщениями после last_note_at (клиент ушёл
//     без flush/beforeunload);
// (2) помечает «застрявшие» анонимные обращения (бот не помог, телефон не оставлен,
//     давно молчат) → уведомление менеджеру.
// Идемпотентно: дедуп сводок по last_note_at, дедуп уведомлений по stuck_notified_at.
// Защита — Bearer CRON_SECRET (как /api/cron/cleanup). Вызывать по расписанию.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Параметры окна можно переопределить query: ?stuck=30&since=48 (минуты/часы).
    const stuckMinutes = Number(req.nextUrl.searchParams.get('stuck')) || undefined
    const sinceHours = Number(req.nextUrl.searchParams.get('since')) || undefined
    const result = await runWidgetAmoSync({ stuckMinutes, sinceHours })
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[cron/widget-amo-sync]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
