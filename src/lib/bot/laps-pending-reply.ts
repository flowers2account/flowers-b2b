// Разгребание очереди РЕАКТИВНЫХ ответов LAPS, отложенных «на утро».
//
// Сделки воронки 11053958 с тегом LAPS_REPLY_PENDING_TAG — это входящие от
// клиентов, полученные вне рабочих часов 09:00–18:30 Almaty и отложенные в
// laps-handoff (тег вместо in-memory setTimeout — переживает деплой/pm2 reload).
//
// Тик вызывается из /api/cron/campaign-followup (тот же роут/расписание, что у
// follow-up — новый crontab не нужен). Расписание VPS: 09:45 и 14:15 Almaty —
// оба внутри 09:00–18:30, поэтому «не раньше 09:00» обеспечивает само расписание,
// отдельное поле «not before» на сделке не нужно.
//
// По каждой такой сделке: берём АКТУАЛЬНУЮ историю Umnico по сохранённому
// umnico ref, находим последнее сообщение клиента и прогоняем обычный реактивный
// конвейер onLapsContactReplied (он сам заново классифицирует / сочиняет / шлёт /
// двигает стадии; тег снимает onLapsContactRepliedImpl после успешной отправки).

import {
  listLeadsByPipeline, leadFieldValue, type AmoLeadRaw,
  CF_CAMPAIGN_UMNICO_REF,
} from '@/lib/amo'
import { fetchDialogContext, type DialogMessage } from '@/lib/umnico'
import { parseUmnicoRef } from './campaign-followup'
import { isWithinLapsReplyHours } from './laps-hours'
import { AMO_LAPS_PIPELINE_ID, LAPS_REPLY_PENDING_TAG, lapsEnabled, lapsAutobotOn } from './laps-config'
import { onLapsContactReplied } from '@/lib/outreach/laps-handoff'

function leadTagNames(lead: AmoLeadRaw): string[] {
  const emb = (lead as { _embedded?: { tags?: Array<{ name?: string }> } })._embedded
  return (emb?.tags ?? []).map((t) => t?.name ?? '').filter(Boolean)
}

function lastClientText(history: DialogMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'client') return history[i].text || ''
  }
  return ''
}

interface TickResult { answered: number; skipped: number }

/**
 * Один проход очереди отложенных реактивных ответов. `now` инъектируется для
 * тестов. Вне рабочих часов / при LAPS_CAMPAIGN_ENABLED != true — no-op.
 */
export async function runLapsPendingReplyTick(now: Date = new Date()): Promise<TickResult> {
  if (!lapsEnabled()) {
    console.log('[laps-pending] LAPS_CAMPAIGN_ENABLED != true — тик пропущен')
    return { answered: 0, skipped: 0 }
  }
  if (!isWithinLapsReplyHours(now)) {
    console.log('[laps-pending] вне рабочих часов 09:00–18:30 Almaty — тик пропущен')
    return { answered: 0, skipped: 0 }
  }

  let leads: AmoLeadRaw[]
  try {
    leads = await listLeadsByPipeline(AMO_LAPS_PIPELINE_ID, { withParam: 'contacts' })
  } catch (e) {
    console.error('[laps-pending] не удалось получить сделки воронки:', e instanceof Error ? e.message : e)
    return { answered: 0, skipped: 0 }
  }

  const queued = leads.filter(
    (l) => leadTagNames(l).includes(LAPS_REPLY_PENDING_TAG) && lapsAutobotOn(l),
  )
  let answered = 0
  let skipped = 0

  for (const lead of queued) {
    try {
      const ref = parseUmnicoRef(leadFieldValue(lead, CF_CAMPAIGN_UMNICO_REF))
      if (!ref) {
        console.warn(`[laps-pending] сделка ${lead.id}: нет/битый umnico ref — пропуск (тег оставляем на разбор)`)
        skipped += 1
        continue
      }
      const history = await fetchDialogContext(ref.leadId, ref.realId, { limit: 10 })
      const text = lastClientText(history)
      if (!text) {
        console.warn(`[laps-pending] сделка ${lead.id}: в истории нет сообщений клиента — пропуск`)
        skipped += 1
        continue
      }
      // phone здесь только косметический (лог + Telegram-уведомление менеджера);
      // для отложенного ночного ответа оставляем пустым.
      await onLapsContactReplied(lead.id, '', {
        text, umnicoLeadId: ref.leadId, realId: ref.realId,
      })
      answered += 1
      console.log(`[laps-pending] сделка ${lead.id}: отложенный реактивный ответ обработан`)
    } catch (e) {
      skipped += 1
      console.error(`[laps-pending] сделка ${lead?.id}: ошибка:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`[laps-pending] тик завершён: answered=${answered} skipped=${skipped} (в очереди было: ${queued.length})`)
  return { answered, skipped }
}
