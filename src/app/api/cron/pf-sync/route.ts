import { NextRequest, NextResponse } from 'next/server'
import { getRunningSyncRun, syncTradingDay } from '@/lib/proflowers/parser'

export const dynamic = 'force-dynamic'

// Синхронизация каталога Proflowers. Защита — Bearer CRON_SECRET (как остальные /api/cron/*).
// Прод на VPS (не Vercel): расписание НЕ через vercel.json crons, а /etc/cron.d/flowers-pf-sync
// на сервере, бьёт напрямую в http://127.0.0.1:3000 мимо nginx (обход 60-секундного лимита
// прокси — прогон занимает ~1.5–2 мин на 38–39 страниц). Ручной запуск — тот же GET с Bearer.
//
// Защита от параллельного запуска переиспользует статус 'running' в pf_sync_runs: syncTradingDay
// пишет эту строку в начале прогона (см. parser.ts), getRunningSyncRun() проверяет её здесь до
// старта нового. Протухшую (см. RUN_STALE_AFTER_MS в parser.ts) строку getRunningSyncRun сам
// помечает error и не считает блокировкой.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const running = await getRunningSyncRun()
  if (running) {
    return NextResponse.json(
      { error: 'Прогон уже выполняется', runningSince: running.startedAt },
      { status: 409 },
    )
  }

  const logLines: string[] = []
  const log = (message: string) => logLines.push(message)

  try {
    const result = await syncTradingDay(log)
    return NextResponse.json({ ...result, log: logLines })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('pf-sync: прогон упал', error)
    return NextResponse.json({ error: message, log: logLines }, { status: 500 })
  }
}
