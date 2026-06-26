import { NextRequest, NextResponse } from 'next/server'
import { pollDukenPayments } from '@/lib/invoice/duken-poll'

export const dynamic = 'force-dynamic'

// Опрос статуса оплат OnlineDuken. Защита — Bearer CRON_SECRET (как /api/cron/cleanup).
// Ставить по расписанию (каждые 2–5 мин). Пока DUKEN_API_TOKEN не задан — вернёт skipped.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ?all=1 — опрашивать все sent-счета, а не только pay_method='qr'
  const onlyQr = req.nextUrl.searchParams.get('all') !== '1'
  const result = await pollDukenPayments({ onlyQr })
  return NextResponse.json(result)
}
