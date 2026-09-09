// Follow-up по расписанию для кампании «LAPS» (крон /api/cron/campaign-followup —
// тот же роут, что у школьной кампании, новый crontab не нужен). Молчащим
// контактам в воронке 11053958 на ДВУХ стадиях, до LAPS_FOLLOWUP_MAX_ATTEMPTS
// напоминаний, по одному за окно отправки:
//   • «сообщение в ватсап» (86857302) — контакт НИ РАЗУ не ответил на первое
//     приветствие. Одна база LAPS_FOLLOWUP_NO_REPLY_BASE на все 3 попытки.
//   • «Материалы отправлены» (86836490) — материалы получил, ждём реакции.
//     ATTEMPT_1/2/3, плюс POSTPONED_RETURN если последняя реплика была переносом.
//
// Окна отправки и computeNextWindow / isWithinSendWindow ПЕРЕИСПОЛЬЗУЕМ из
// campaign-followup.ts (это общая утилита времени, не школьная бизнес-логика —
// школьный код не трогаем). Состояние — те же кастомные поля сделки
// CF_CAMPAIGN_* (счётчик, «не раньше», umnico ref). Для стадии «сообщение в
// ватсап» ref пишет tryCaptureLapsRefFromOutgoing при ручном приветствии.

import { callGemini } from '@/lib/gemini'
import {
  listLeadsByPipeline, leadFieldValue, patchLeadFields, type AmoLeadRaw,
  CF_CAMPAIGN_NEXT_FOLLOWUP, CF_CAMPAIGN_FOLLOWUP_COUNT, CF_CAMPAIGN_UMNICO_REF,
} from '@/lib/amo'
import { fetchDialogContext, sendMessage, type DialogMessage } from '@/lib/umnico'
import { computeNextWindow, isWithinSendWindow, parseUmnicoRef } from './campaign-followup'
import {
  AMO_LAPS_PIPELINE_ID, AMO_LAPS_STATUS_WHATSAPP, AMO_LAPS_STATUS_MATERIAL, lapsEnabled, lapsAutobotOn,
} from './laps-config'
import {
  LAPS_FOLLOWUP_PROMPT, LAPS_FOLLOWUP_NO_REPLY_BASE, LAPS_FOLLOWUP_ATTEMPT_1,
  LAPS_FOLLOWUP_ATTEMPT_2, LAPS_FOLLOWUP_ATTEMPT_3, LAPS_FOLLOWUP_POSTPONED_RETURN,
} from './laps-prompts'

export const LAPS_FOLLOWUP_MAX_ATTEMPTS = 3

// Стадии, для которых работает follow-up.
type LapsFollowupStage = 'no_reply' | 'material_sent'

function stageKeyForLapsStatus(statusId: number): LapsFollowupStage | null {
  if (statusId === AMO_LAPS_STATUS_WHATSAPP) return 'no_reply'       // 86857302
  if (statusId === AMO_LAPS_STATUS_MATERIAL) return 'material_sent'  // 86836490
  return null
}

// Последнее входящее сообщение клиента «в духе postponed» — эвристика по тексту,
// БЕЗ нового кастомного поля и без сохранённой классификации (по решению задачи —
// «определить по истории диалога без нового поля»). Может изредка ложно сработать,
// если последняя реплика клиента звучала как перенос, но intent был иным — для
// напоминания это некритично.
const POSTPONED_HINT_RE =
  /(поздн|позже|потом|завтра|на недел|на следующ|перезвон|наберите|напишите позж|нет на мест|отсутству|в отпуск|занят|некогда|не сейчас|ближе к|как освобо)/i

function lastClientMessage(history: DialogMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'client') return history[i].text || ''
  }
  return ''
}

function formatHistory(history: DialogMessage[]): string {
  if (!history.length) return ''
  return history
    .map((h) => `${h.role === 'client' ? 'Клиент' : h.role === 'bot' ? 'Бот' : 'Менеджер'}: ${h.text}`)
    .join('\n')
}

/**
 * База напоминания.
 *  • no_reply — всегда LAPS_FOLLOWUP_NO_REPLY_BASE (одна на все 3 попытки, без
 *    конкурса: конкурс как повод не подходит тому, кто ещё не ответил).
 *  • material_sent — POSTPONED_RETURN если последняя реплика была переносом,
 *    иначе ATTEMPT_1/2/3 по номеру попытки.
 */
function followupBase(stage: LapsFollowupStage, attemptNumber: number, postponedLast: boolean): string {
  if (stage === 'no_reply') return LAPS_FOLLOWUP_NO_REPLY_BASE
  if (postponedLast) return LAPS_FOLLOWUP_POSTPONED_RETURN
  if (attemptNumber === 1) return LAPS_FOLLOWUP_ATTEMPT_1
  if (attemptNumber === 2) return LAPS_FOLLOWUP_ATTEMPT_2
  return LAPS_FOLLOWUP_ATTEMPT_3
}

/**
 * Перефразировка follow-up через Gemini. null → вызывающий пропускает сделку
 * (ничего не шлёт, счётчик не трогает).
 */
export async function composeLapsFollowupReply(
  stage: LapsFollowupStage,
  attemptNumber: number,
  historyText: string,
  postponedLast: boolean,
): Promise<string | null> {
  const base = followupBase(stage, attemptNumber, postponedLast)
  const isLast = attemptNumber >= LAPS_FOLLOWUP_MAX_ATTEMPTS
  const prompt = `${LAPS_FOLLOWUP_PROMPT}

Базовый текст напоминания: ${JSON.stringify(base)}
Это попытка ${attemptNumber} из ${LAPS_FOLLOWUP_MAX_ATTEMPTS}.${isLast ? '\nЭто последняя попытка.' : ''}
${historyText ? `\nИстория диалога (старые→новые):\n${historyText}\n` : ''}`

  const text = await callGemini(prompt, { temperature: 0.3, timingLabel: 'laps-followup-compose' })
  if (!text) return null
  const answer = text.trim()
  if (!answer || answer === 'NO_ANSWER' || answer.includes('NO_ANSWER')) return null
  return answer
}

interface TickResult { sent: number; skipped: number }

/**
 * Один проход LAPS follow-up. `now` инъектируется для тестов. Вне окна отправки /
 * при выключенном LAPS_CAMPAIGN_ENABLED — сразу no-op. Идёт по сделкам воронки
 * 11053958 на стадиях «сообщение в ватсап» и «Материалы отправлены», для
 * подходящих: fetchDialogContext → composeLapsFollowupReply → sendMessage, при
 * успехе инкремент счётчика + сдвиг окна.
 */
export async function runLapsFollowupTick(now: Date = new Date()): Promise<TickResult> {
  if (!lapsEnabled()) {
    console.log('[laps-followup] LAPS_CAMPAIGN_ENABLED != true — тик пропущен')
    return { sent: 0, skipped: 0 }
  }
  if (!isWithinSendWindow(now)) {
    console.log('[laps-followup] вне окна отправки — тик пропущен')
    return { sent: 0, skipped: 0 }
  }

  let leads: AmoLeadRaw[]
  try {
    leads = await listLeadsByPipeline(AMO_LAPS_PIPELINE_ID, { withParam: 'contacts' })
  } catch (e) {
    console.error('[laps-followup] не удалось получить сделки воронки:', e instanceof Error ? e.message : e)
    return { sent: 0, skipped: 0 }
  }

  let sent = 0
  let skipped = 0
  for (const lead of leads) {
    try {
      const did = await processLapsFollowupLead(lead, now)
      if (did) sent += 1
      else skipped += 1
    } catch (e) {
      skipped += 1
      console.error(`[laps-followup] сделка ${lead?.id}: ошибка обработки:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`[laps-followup] тик завершён: sent=${sent} skipped=${skipped} (сделок в воронке: ${leads.length})`)
  return { sent, skipped }
}

/** true — если по этой сделке отправлен follow-up (счётчик увеличен). */
async function processLapsFollowupLead(lead: AmoLeadRaw, now: Date): Promise<boolean> {
  const leadId = lead.id
  // Пер-сделочный выключатель: фоллоу-апим только сделки с галкой «LAPS: автобот вкл».
  if (!lapsAutobotOn(lead)) return false
  // Follow-up LAPS работает на «сообщение в ватсап» и «Материалы отправлены».
  const stage = stageKeyForLapsStatus(Number(lead.status_id))
  if (!stage) return false

  const count = Number.parseInt(leadFieldValue(lead, CF_CAMPAIGN_FOLLOWUP_COUNT) ?? '0', 10) || 0
  if (count >= LAPS_FOLLOWUP_MAX_ATTEMPTS) {
    console.log(`[laps-followup] сделка ${leadId}: лимит попыток (${count}) — пропуск`)
    return false
  }

  const notBeforeRaw = leadFieldValue(lead, CF_CAMPAIGN_NEXT_FOLLOWUP)
  if (notBeforeRaw) {
    const notBefore = new Date(notBeforeRaw)
    if (!Number.isNaN(notBefore.getTime()) && notBefore.getTime() > now.getTime()) {
      console.log(`[laps-followup] сделка ${leadId}: ещё рано (не раньше ${notBeforeRaw}) — пропуск`)
      return false
    }
  }

  const ref = parseUmnicoRef(leadFieldValue(lead, CF_CAMPAIGN_UMNICO_REF))
  if (!ref) {
    console.warn(
      `[laps-followup] сделка ${leadId}: пустой/битый Campaign umnico ref ` +
      `(${JSON.stringify(leadFieldValue(lead, CF_CAMPAIGN_UMNICO_REF))}) — некому слать, пропуск`,
    )
    return false
  }

  const history = await fetchDialogContext(ref.leadId, ref.realId, { limit: 10 })
  const attemptNumber = count + 1
  // POSTPONED_RETURN — только для стадии «Материалы отправлены» (на «сообщение в
  // ватсап» клиент ни разу не отвечал, «переноса» быть не могло).
  const postponedLast = stage === 'material_sent' && POSTPONED_HINT_RE.test(lastClientMessage(history))
  const text = await composeLapsFollowupReply(stage, attemptNumber, formatHistory(history), postponedLast)
  if (!text) {
    console.warn(`[laps-followup] сделка ${leadId}: composeLapsFollowupReply вернул пусто — пропуск`)
    return false
  }

  const ok = await sendMessage(ref.leadId, text)
  if (!ok) {
    console.error(`[laps-followup] сделка ${leadId}: sendMessage не удался — счётчик не трогаем`)
    return false
  }

  await patchLeadFields(leadId, [
    { field_id: CF_CAMPAIGN_FOLLOWUP_COUNT, value: attemptNumber },
    { field_id: CF_CAMPAIGN_NEXT_FOLLOWUP, value: computeNextWindow(now).toISOString() },
  ])
  console.log(`[laps-followup] сделка ${leadId}: отправлен follow-up #${attemptNumber} (${stage}${postponedLast ? ', postponed-return' : ''})`)
  return true
}
