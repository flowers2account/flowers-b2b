import { NextRequest, NextResponse } from 'next/server'
import { runCampaignFollowupTick } from '@/lib/bot/campaign-followup'

export const dynamic = 'force-dynamic'

// Крон школьной кампании: follow-up молчащим контактам в воронке 11235862 на стадиях
// «Первичный контакт» (88138982) и «материал отправлен» (88149794). До 3 напоминаний,
// по одному за окно отправки (Asia/Almaty 09:30–11:00 и 14:00–15:30). Вне окна тик —
// no-op. Состояние — в кастомных полях сделки (см. src/lib/bot/campaign-followup.ts).
// Защита — Bearer CRON_SECRET (как /api/cron/cleanup и /api/cron/widget-amo-sync).
// Расписание — /etc/cron.d/flowers-campaign-followup-* на VPS (сервер в UTC).
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runCampaignFollowupTick()
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[cron/campaign-followup]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
