// Общий catch-up для «зависших» LAPS-сделок.
//
// Независимо от причины сбоя (упавшая отправка, недоступность Umnico, гонка,
// пропущенный вебхук, что угодно) — периодически ищем сделки, где ПОСЛЕДНЕЕ
// сообщение в диалоге от клиента, а нашего ответа после него не было, и
// переигрываем обработку через обычный onLapsContactReplied.
//
// Вызывается из /api/cron/campaign-followup (тот же роут), но чаще — каждые
// 15 минут в рабочее окно (crontab на VPS). Вне рабочих часов — no-op: ночные
// входящие уже ловит отдельный механизм (тег laps-reply-pending +
// runLapsPendingReplyTick).

import {
  listLeadsByPipeline, leadFieldValue, type AmoLeadRaw,
  CF_CAMPAIGN_UMNICO_REF,
} from '@/lib/amo'
import { fetchDialogContext } from '@/lib/umnico'
import { parseUmnicoRef } from './campaign-followup'
import { isWithinLapsReplyHours } from './laps-hours'
import {
  AMO_LAPS_PIPELINE_ID, AMO_LAPS_STATUS_DEMO, AMO_LAPS_STATUS_WON, AMO_LAPS_STATUS_LOST,
  AMO_LAPS_STATUS_WHATSAPP, AMO_LAPS_STATUS_LPR, AMO_LAPS_STATUS_MATERIAL, AMO_LAPS_STATUS_THINKING,
  lapsEnabled,
} from './laps-config'
import { onLapsContactReplied } from '@/lib/outreach/laps-handoff'

// «Зависла», только если после сообщения клиента прошло больше этого времени —
// чтобы не конкурировать с живой обработкой (дебаунс 6 c + сам конвейер) и с
// ретраем упавшей отправки, который может быть ещё в процессе.
const STALE_AFTER_MS = 15 * 60 * 1000

// Стадии, где ждём файлов/ответов бота и где отсутствие umnico ref — аномалия,
// достойная лога. На «Новых лидах» / «звонковых» стадиях ref штатно пустой.
const DIALOG_STAGES = new Set<number>([
  AMO_LAPS_STATUS_WHATSAPP, AMO_LAPS_STATUS_LPR, AMO_LAPS_STATUS_MATERIAL, AMO_LAPS_STATUS_THINKING,
])
// Стадии, которые вообще не трогаем: «Презентация/демо» (бот осознанно молчит) и
// закрытые (успех/отказ).
const EXCLUDED_STAGES = new Set<number>([
  AMO_LAPS_STATUS_DEMO, AMO_LAPS_STATUS_WON, AMO_LAPS_STATUS_LOST,
])

interface CatchupResult { checked: number; caught: number; skipped: number }

/**
 * Один проход catch-up. `now` инъектируется для тестов. No-op при выключенном
 * LAPS_CAMPAIGN_ENABLED или вне рабочих часов 09:00–18:30 Almaty.
 *  • checked — сделки с валидным ref, у которых реально смотрели историю
 *  • caught  — переигранные (последнее слово за клиентом >15 мин, ответа не было)
 *  • skipped — посмотрели, но переигрывать не стали (уже отвечено / свежее 15 мин /
 *              пустая история / нет datetime / ошибка)
 */
export async function runLapsCatchupTick(now: Date = new Date()): Promise<CatchupResult> {
  if (!lapsEnabled()) {
    console.log('[laps-catchup] LAPS_CAMPAIGN_ENABLED != true — тик пропущен')
    return { checked: 0, caught: 0, skipped: 0 }
  }
  if (!isWithinLapsReplyHours(now)) {
    console.log('[laps-catchup] вне рабочих часов 09:00–18:30 Almaty — тик пропущен')
    return { checked: 0, caught: 0, skipped: 0 }
  }

  let leads: AmoLeadRaw[]
  try {
    leads = await listLeadsByPipeline(AMO_LAPS_PIPELINE_ID, { withParam: 'contacts' })
  } catch (e) {
    console.error('[laps-catchup] не удалось получить сделки воронки:', e instanceof Error ? e.message : e)
    return { checked: 0, caught: 0, skipped: 0 }
  }

  let checked = 0
  let caught = 0
  let skipped = 0

  for (const lead of leads) {
    const statusId = Number(lead.status_id)
    if (EXCLUDED_STAGES.has(statusId)) continue

    const refRaw = leadFieldValue(lead, CF_CAMPAIGN_UMNICO_REF)
    const ref = parseUmnicoRef(refRaw)
    if (!ref) {
      // Битый ref — всегда аномалия; пустой ref — аномалия только на «диалоговых»
      // стадиях (на «Новых лидах» его штатно нет). Логируем для ручного разбора,
      // не угадываем.
      if (refRaw || DIALOG_STAGES.has(statusId)) {
        console.warn(
          `[laps-catchup] сделка ${lead.id} (стадия ${statusId}): нет/битый Campaign umnico ref ` +
          `(${JSON.stringify(refRaw)}) — пропуск, нужен ручной разбор`,
        )
        skipped += 1
      }
      continue
    }

    checked += 1
    try {
      const history = await fetchDialogContext(ref.leadId, ref.realId, { limit: 10 })
      const last = history[history.length - 1]
      if (!last) { skipped += 1; continue }               // пустая история
      if (last.role !== 'client') { skipped += 1; continue } // последнее — от нас, уже отвечено

      if (last.ts === undefined) {
        console.warn(`[laps-catchup] сделка ${lead.id}: у последнего сообщения нет datetime — пропуск`)
        skipped += 1
        continue
      }
      const ageMs = now.getTime() - last.ts
      if (ageMs < STALE_AFTER_MS) { skipped += 1; continue } // свежее 15 мин — возможно, в обработке

      console.log(
        `[laps-catchup] сделка ${lead.id}: последнее сообщение от клиента ${Math.round(ageMs / 60000)} мин назад ` +
        `без ответа — переигрываю`,
      )
      // phone здесь косметический (лог + Telegram) — для catch-up оставляем пустым.
      await onLapsContactReplied(lead.id, '', {
        text: last.text, umnicoLeadId: ref.leadId, realId: ref.realId,
      })
      caught += 1
    } catch (e) {
      skipped += 1
      console.error(`[laps-catchup] сделка ${lead?.id}: ошибка:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`[laps-catchup] тик завершён: checked=${checked} caught=${caught} skipped=${skipped}`)
  return { checked, caught, skipped }
}
