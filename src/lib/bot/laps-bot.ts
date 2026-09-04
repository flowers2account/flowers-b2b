// Классификация и генерация ответа для холодной кампании «LAPS». По образцу
// campaign-bot.ts (школьная кампания), но её код НЕ импортируем — только общий
// callGemini + amo.ts helpers.

import { callGemini } from '@/lib/gemini'
import { getLead } from '@/lib/amo'
import {
  LAPS_STAGE_ORDER, AMO_LAPS_STATUS_MATERIAL,
} from './laps-config'
import {
  LAPS_CLASSIFY_PROMPT, LAPS_PITCH_PROMPT,
  LAPS_REFUSE_FINAL_REPLY, LAPS_HOSTILE_REPLY, LAPS_CONTACT_SOURCE_REPLY,
} from './laps-prompts'

export type LapsIntent =
  | 'greeting' | 'small_talk' | 'ready_signal' | 'has_supplier' | 'price_request'
  | 'agree_send' | 'not_lpr' | 'will_forward' | 'interested' | 'postponed'
  | 'refuse' | 'hostile' | 'contact_source' | 'who_are_you' | 'other'

const INTENTS: readonly LapsIntent[] = [
  'greeting', 'small_talk', 'ready_signal', 'has_supplier', 'price_request',
  'agree_send', 'not_lpr', 'will_forward', 'interested', 'postponed',
  'refuse', 'hostile', 'contact_source', 'who_are_you', 'other',
]

export interface ClassifyLapsResult {
  intent: LapsIntent
}

/**
 * Классификация ответа контакта LAPS. callGemini(json:true, temperature:0.1) —
 * тот же паттерн, что classifyCampaignIntent. null при сбое ИИ / невалидном JSON /
 * незнакомом intent — вызывающий (laps-handoff.ts) тогда клиенту ничего не шлёт.
 */
export async function classifyLapsIntent(
  text: string,
  historyText: string,
): Promise<ClassifyLapsResult | null> {
  const prompt = `${LAPS_CLASSIFY_PROMPT}
${historyText ? `\nИстория диалога (старые→новые):\n${historyText}\n` : ''}
Сообщение клиента: ${JSON.stringify(text)}`

  const raw = await callGemini(prompt, { json: true, temperature: 0.1, timingLabel: 'laps-classification' })
  if (!raw) return null

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as { intent?: unknown }
    const intent = typeof parsed.intent === 'string' && (INTENTS as string[]).includes(parsed.intent)
      ? (parsed.intent as LapsIntent)
      : null
    return intent ? { intent } : null
  } catch (err) {
    console.error('[laps-bot] classify parse failed:', err, raw)
    return null
  }
}

/**
 * Генерация ответа клиенту. ФИКСИРОВАННЫЕ строки (Gemini не вызывается):
 *   hostile               → LAPS_HOSTILE_REPLY       (закрыть навсегда)
 *   contact_source        → LAPS_CONTACT_SOURCE_REPLY
 *   refuse + refuseSecond → LAPS_REFUSE_FINAL_REPLY  (2-й подряд отказ — закрыть)
 * refuse (1-й) — обычный Gemini-compose (ветка refuse в LAPS_PITCH_PROMPT,
 * LAPS_REFUSE_PUSHBACK_REPLY идёт туда как ориентир). Источник истины
 * «первый/второй отказ» — тег сделки laps-refuse-1, не текст.
 * Остальное — обычный compose через Gemini (LAPS_PITCH_PROMPT).
 *
 * alreadySent — материалы уже отправлены ранее в этом диалоге (по стадии сделки);
 * прокидывается строкой в промпт, чтобы бот не «отправлял снова» на словах.
 * refuseSecond — этот refuse уже второй подряд в диалоге (по тегу сделки), решает
 * вызывающий (laps-handoff.ts) и передаёт сюда.
 */
export async function composeLapsReply(
  intent: LapsIntent,
  historyText: string,
  alreadySent = false,
  refuseSecond = false,
): Promise<string | null> {
  if (intent === 'hostile') return LAPS_HOSTILE_REPLY
  if (intent === 'contact_source') return LAPS_CONTACT_SOURCE_REPLY
  if (intent === 'refuse' && refuseSecond) return LAPS_REFUSE_FINAL_REPLY

  const prompt = `${LAPS_PITCH_PROMPT}

Классифицированный intent ответа клиента: ${intent}
Материал уже отправлен ранее в этом диалоге: ${alreadySent ? 'да' : 'нет'}
${historyText ? `\nИстория диалога (старые→новые):\n${historyText}\n` : ''}`

  const text = await callGemini(prompt, { temperature: 0.2, timingLabel: 'laps-compose' })
  if (!text) return null
  const answer = text.trim()
  if (!answer || answer === 'NO_ANSWER' || answer.includes('NO_ANSWER')) return null
  return answer
}

/**
 * Материалы (презентация) уже отправлялись в этом диалоге? Источник истины —
 * ТЕКУЩАЯ СТАДИЯ СДЕЛКИ (getLead): true, если сделка на «Материалы отправлены»
 * (86836490) или дальше по воронке. Сбой чтения / статус вне воронки → false
 * (безопаснее переслать ещё раз, чем не отправить из-за сбоя amoCRM API).
 * Полный аналог materialAlreadySent() из campaign-bot.ts.
 */
export async function lapsMaterialAlreadySent(dealId: number): Promise<boolean> {
  try {
    const lead = await getLead(dealId)
    const statusId = lead?.status_id
    if (statusId == null) return false
    const materialIdx = LAPS_STAGE_ORDER.indexOf(AMO_LAPS_STATUS_MATERIAL)
    const currentIdx = LAPS_STAGE_ORDER.indexOf(Number(statusId))
    if (currentIdx === -1) return false
    return currentIdx >= materialIdx
  } catch (e) {
    console.error('[laps-bot] lapsMaterialAlreadySent: getLead failed:', e instanceof Error ? e.message : e)
    return false
  }
}
