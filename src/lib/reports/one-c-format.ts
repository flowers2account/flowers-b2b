// Чистая логика отчёта 1С: пороги тревог + форматирование текста. Без IO/импортов —
// тестируется изолированно. Данные приходят из RPC report_1c_daily() (Asia/Oral).

export type OneCMetrics = {
  now_oral: string
  today_date: string
  yesterday_date: string
  cur_hour_oral: number
  snapshots_yesterday: number
  first_time: string | null
  last_time: string | null
  changes_total: number
  snapshot_total: number
  snapshot_matched: number
  snapshot_unmatched: number
  showcase: number
  last_snapshot_oral: string | null
  last_snapshot_age_min: number | null
}

export type OneCReport = {
  status: 'ok' | 'warning' | 'critical'
  text: string
  alarms: string[]
  data: OneCMetrics
}

export type OneCThresholds = {
  staleHours: number     // макс. возраст последнего снимка в рабочее время (по умолч. 2ч)
  minSnapshots: number   // ниже — «перебои» (по умолч. 10)
  maxUnmatched: number   // выше — рост непривязанных (по умолч. 100)
}

export const DEFAULT_THRESHOLDS: OneCThresholds = { staleHours: 2, minSnapshots: 10, maxUnmatched: 100 }

// «2026-06-24 09:00» → { date:'2026-06-24', time:'09:00' }
function splitOral(s: string | null): { date: string; time: string } | null {
  if (!s) return null
  const [date, time] = s.split(' ')
  return date && time ? { date, time } : null
}

// Относительная подпись: «сегодня в 09:00» / «вчера в 20:00» / «22.06 в 20:00»
function relLast(m: OneCMetrics): string {
  const last = splitOral(m.last_snapshot_oral)
  const now = splitOral(m.now_oral)
  if (!last) return '—'
  let day = `${last.date.slice(8, 10)}.${last.date.slice(5, 7)}`
  if (now) {
    const diff = Math.round(
      (new Date(now.date + 'T00:00:00Z').getTime() - new Date(last.date + 'T00:00:00Z').getTime()) / 86_400_000,
    )
    if (diff === 0) day = 'сегодня'
    else if (diff === 1) day = 'вчера'
  }
  return `${day} в ${last.time}`
}

function lastIsToday(m: OneCMetrics): boolean {
  const last = splitOral(m.last_snapshot_oral)
  const now = splitOral(m.now_oral)
  return !!last && !!now && last.date === now.date
}

export function buildOneCReport(data: OneCMetrics, thr: OneCThresholds = DEFAULT_THRESHOLDS): OneCReport {
  const workingHours = data.cur_hour_oral >= 8 && data.cur_hour_oral < 20
  const ageMin = data.last_snapshot_age_min ?? Number.MAX_SAFE_INTEGER
  const staleMin = thr.staleHours * 60

  const noYesterday = data.snapshots_yesterday === 0
  const staleNow = workingHours && ageMin > staleMin
  const isCritical = noYesterday || staleNow

  const fewSnapshots = !isCritical && data.snapshots_yesterday > 0 && data.snapshots_yesterday < thr.minSnapshots
  const unmatchedHigh = data.snapshot_unmatched > thr.maxUnmatched

  const alarms: string[] = []
  if (noYesterday) alarms.push('за вчера не было ни одного снимка')
  if (staleNow) alarms.push(`последний снимок ${Math.floor(ageMin / 60)} ч ${ageMin % 60} мин назад`)
  if (fewSnapshots) alarms.push(`снимков за день мало: ${data.snapshots_yesterday} (обычно ~24)`)
  if (unmatchedHigh) alarms.push(`выросло число непривязанных: ${data.snapshot_unmatched}`)

  const status: OneCReport['status'] = isCritical ? 'critical' : (fewSnapshots || unmatchedHigh) ? 'warning' : 'ok'

  let text: string
  if (isCritical) {
    const lines = [
      '⚠️ ВНИМАНИЕ: выгрузка 1С',
      `Последний снимок: ${relLast(data)}`,
    ]
    if (noYesterday) lines.push('За вчера снимков не было.')
    if (staleNow && !lastIsToday(data)) lines.push(`Сегодня выгрузок ещё не было (${data.now_oral.slice(11)}).`)
    else if (staleNow) lines.push(`Нет новых снимков более ${thr.staleHours} ч (сейчас ${data.now_oral.slice(11)}).`)
    if (unmatchedHigh) lines.push(`⚠️ Непривязано: ${data.snapshot_unmatched} (обычно ~67).`)
    lines.push('Проверьте подключение 1С / связь.')
    text = lines.join('\n')
  } else {
    const head = status === 'warning' ? '⚠️' : '✅'
    const fresh = lastIsToday(data) ? '✅' : '⚠️'
    const lines = [
      `${head} Отчёт по 1С за ${data.yesterday_date}`,
      `Снимков за день: ${data.snapshots_yesterday}${data.first_time ? ` (${data.first_time}–${data.last_time})` : ''}`,
      `Изменений остатков/цен: ${data.changes_total}`,
      `Непривязано: ${data.snapshot_unmatched} из ${data.snapshot_total}`,
      `На витрине: ${data.showcase} товаров`,
      `Последняя выгрузка: ${relLast(data)} ${fresh}`,
    ]
    if (fewSnapshots) lines.push(`⚠️ Выгрузка шла с перебоями (снимков ${data.snapshots_yesterday}).`)
    if (unmatchedHigh) lines.push(`⚠️ Непривязанных стало больше обычного (${data.snapshot_unmatched}).`)
    text = lines.join('\n')
  }

  return { status, text, alarms, data }
}
