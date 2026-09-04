import { NextRequest, NextResponse } from 'next/server'
import { runCampaignFollowupTick } from '@/lib/bot/campaign-followup'
import { runLapsFollowupTick } from '@/lib/bot/laps-followup'

export const dynamic = 'force-dynamic'

// Общий крон follow-up для Umnico-кампаний. Один роут, одно расписание
// (/etc/cron.d/flowers-campaign-followup-* на VPS, окна Asia/Almaty 09:30–11:00
// и 14:00–15:30). Новый crontab не нужен.
//   • Школьная кампания (воронка 11235862): стадии «Первичный контакт»/«материал
//     отправлен», до 3 напоминаний. Управляется CAMPAIGN_FOLLOWUP_ENABLED.
//   • LAPS (воронка 11053958): стадия «Материалы отправлены», до 3 напоминаний.
//     Управляется LAPS_CAMPAIGN_ENABLED.
// Оба тика независимы, вне окна / при выключенном флаге — no-op.
// Защита — Bearer CRON_SECRET (как /api/cron/cleanup и /api/cron/widget-amo-sync).
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const school = await runCampaignFollowupTick()
    let laps: { sent: number; skipped: number } = { sent: 0, skipped: 0 }
    try {
      laps = await runLapsFollowupTick()
    } catch (e) {
      console.error('[cron/campaign-followup] laps tick failed:', e)
    }
    return NextResponse.json({ success: true, school, laps, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[cron/campaign-followup]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
