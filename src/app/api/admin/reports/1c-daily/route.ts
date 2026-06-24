import { NextRequest, NextResponse } from 'next/server'
import { getOneCReport } from '@/lib/reports/one-c-daily'
import { umnicoClient } from '@/lib/umnico/client'

export const dynamic = 'force-dynamic'

// Ежедневный отчёт об автосинхронизации 1С → WhatsApp (контроль выгрузки остатков).
// Защита — Bearer CRON_SECRET (как /api/cron/*). Дёргается systemd-таймером на VPS в 08:30 Oral.
//
// Параметры:
//   ?dry=1            — собрать отчёт и вернуть текст, НЕ отправлять (превью).
//   ?stale=2          — порог «свежести» последнего снимка, часов (по умолч. 2).
//   ?min=10 ?max=100  — пороги «мало снимков» / «много непривязанных».
// Получатели: REPORT_PHONE (приоритет) или UMNICO_MANAGER_PHONE; можно несколько через запятую.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const dry = sp.get('dry') === '1'
  const staleHours = Number(sp.get('stale')) || undefined
  const minSnapshots = Number(sp.get('min')) || undefined
  const maxUnmatched = Number(sp.get('max')) || undefined

  try {
    const report = await getOneCReport({ staleHours, minSnapshots, maxUnmatched })

    if (dry) {
      return NextResponse.json({ ok: true, dry: true, status: report.status, alarms: report.alarms, text: report.text, data: report.data })
    }

    const recipients = (process.env.REPORT_PHONE || process.env.UMNICO_MANAGER_PHONE || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Не задан получатель (REPORT_PHONE / UMNICO_MANAGER_PHONE)' }, { status: 500 })
    }

    const sent: { phone: string; ok: boolean }[] = []
    for (const phone of recipients) {
      const ok = await umnicoClient.sendMessage(phone, report.text)
      sent.push({ phone, ok })
    }

    return NextResponse.json({ ok: true, status: report.status, alarms: report.alarms, sent, text: report.text })
  } catch (err) {
    console.error('[reports/1c-daily]', err)
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
  }
}
