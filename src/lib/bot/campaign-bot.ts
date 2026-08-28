// Классификация и генерация ответа для Umnico-кампаний (школьная рассылка и т.п.).
// Тот же паттерн вызова, что в src/lib/bot/accessories-bot.ts (classifyMessage/
// composeAnswer): callGemini + JSON-классификация + текстовый compose. ОТДЕЛЬНЫЙ
// параллельный мини-конвейер — accessories-bot.ts/SYSTEM_PROMPT не трогаем и не
// импортируем отсюда логику, только общий callGemini.

import { callGemini } from '@/lib/gemini'
import { getLead, AMO_CAMPAIGN_STATUS_NEW, AMO_CAMPAIGN_STATUS_MATERIAL_SENT } from '@/lib/amo'
import { sendPhoto } from '@/lib/umnico'
import {
  CAMPAIGN_CLASSIFY_PROMPT, SCHOOL_CAMPAIGN_PROMPT, PROCUREMENT_REPLY,
  CONFIRMED_FORWARDED_REPLY, SCHOOL_CAMPAIGN_IMAGE_URL, WHAT_IS_IT_BANNER_CAPTION,
} from './campaign-prompts'

export type CampaignIntent =
  | 'greeting' | 'what_is_it' | 'agree_send' | 'refuse' | 'wrong_contact'
  | 'procurement' | 'postponed' | 'confirmed_forwarded' | 'other'

const INTENTS: readonly CampaignIntent[] = [
  'greeting', 'what_is_it', 'agree_send', 'refuse', 'wrong_contact',
  'procurement', 'postponed', 'confirmed_forwarded', 'other',
]

export interface ClassifyCampaignResult {
  intent: CampaignIntent
}

/**
 * Классификация ответа контакта кампании. По образцу classifyMessage() в
 * accessories-bot.ts — callGemini(json:true, temperature:0.1), тот же формат
 * запроса/парсинга JSON-ответа. Промпт — CAMPAIGN_CLASSIFY_PROMPT (campaign-prompts.ts,
 * финальный текст владельца), сюда достраивается только история + сообщение.
 * Возвращает null при сбое ИИ (нет ответа / невалидный JSON / незнакомый intent) —
 * вызывающий (campaign-handoff.ts) в этом случае ничего клиенту не отправляет.
 */
export async function classifyCampaignIntent(
  text: string,
  historyText: string,
): Promise<ClassifyCampaignResult | null> {
  const prompt = `${CAMPAIGN_CLASSIFY_PROMPT}
${historyText ? `\nИстория диалога (старые→новые):\n${historyText}\n` : ''}
Сообщение клиента: ${JSON.stringify(text)}`

  const raw = await callGemini(prompt, { json: true, temperature: 0.1, timingLabel: 'campaign-classification' })
  if (!raw) return null

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as { intent?: unknown }
    const intent = typeof parsed.intent === 'string' && (INTENTS as string[]).includes(parsed.intent)
      ? (parsed.intent as CampaignIntent)
      : null
    return intent ? { intent } : null
  } catch (err) {
    console.error('[campaign-bot] classify parse failed:', err, raw)
    return null
  }
}

/**
 * Генерация ответа клиенту. По образцу composeAnswer() в accessories-bot.ts —
 * callGemini текстом (temperature 0.2). ИСКЛЮЧЕНИЯ (без обращения к Gemini вообще,
 * фиксированная строка): procurement → PROCUREMENT_REPLY (убирает риск, что модель
 * сама начнёт обсуждать условия/цены закупки); confirmed_forwarded →
 * CONFIRMED_FORWARDED_REPLY (клиент уже разослал материал, нужно лишь короткое
 * «спасибо» — сделку дальше двигает campaign-handoff.ts).
 * wrong_contact — НАМЕРЕННО через Gemini-compose (не фикс. строка): ответ должен
 * учитывать, что именно ответил собеседник, и мягко попросить контакт нужного лица.
 * alreadySent — материал уже отправлен ранее в этом диалоге (по стадии сделки);
 * прокидывается отдельной строкой в промпт, чтобы бот не предлагал отправку повторно.
 */
export async function composeCampaignReply(
  intent: CampaignIntent,
  historyText: string,
  alreadySent = false,
): Promise<string | null> {
  if (intent === 'procurement') return PROCUREMENT_REPLY
  if (intent === 'confirmed_forwarded') return CONFIRMED_FORWARDED_REPLY

  const prompt = `${SCHOOL_CAMPAIGN_PROMPT}

Классифицированный intent ответа клиента: ${intent}
Материал уже отправлен ранее в этом диалоге: ${alreadySent ? 'да' : 'нет'}
${historyText ? `\nИстория диалога (старые→новые):\n${historyText}\n` : ''}`

  const text = await callGemini(prompt, { temperature: 0.2, timingLabel: 'campaign-compose' })
  if (!text) return null
  const answer = text.trim()
  if (!answer || answer === 'NO_ANSWER' || answer.includes('NO_ANSWER')) return null
  return answer
}

/**
 * Баннер-тизер для intent=what_is_it — отдельным сообщением ПОСЛЕ текстового ответа
 * (порядок держит вызывающий, campaign-handoff.ts: сначала sendMessage с текстом,
 * затем этот баннер). НЕ гейтится materialAlreadySent: на шаге what_is_it всегда
 * уходит одно изображение, а последующий agree_send всё равно шлёт PDF+баннер
 * заново — дублирование баннера осознанно допустимо, отдельно не отслеживается.
 * Формат A: helper sendPhoto из umnico.ts по umnicoLeadId (не client.ts), канал
 * whatsapp2. Любой сбой — тихий (лог + false), диалог не роняем: текст клиент уже получил.
 */
export async function sendWhatIsItBanner(umnicoLeadId: string | number): Promise<boolean> {
  try {
    const ok = await sendPhoto(umnicoLeadId, SCHOOL_CAMPAIGN_IMAGE_URL, WHAT_IS_IT_BANNER_CAPTION, undefined, 'whatsapp2')
    console.log('[campaign-bot] what_is_it banner:', ok ? 'ok' : 'failed')
    return ok
  } catch (e) {
    console.error('[campaign-bot] what_is_it banner failed:', e instanceof Error ? e.message : e)
    return false
  }
}

// Порядок этапов воронки «Школьная рассылка (1 сентября)» (pipeline_id=11235862,
// сверено GET /leads/pipelines/11235862 26.08.2026), от начала к концу. Используется
// ТОЛЬКО для сравнения «материал уже отправлен (на этой стадии или дальше)» —
// не путать с ORDER_STATUS_TO_AMO/этапами воронки заказов в accessories-bot.ts/amo.ts.
const CAMPAIGN_STAGE_ORDER = [
  88138978,                          // Неразобранное
  AMO_CAMPAIGN_STATUS_NEW,           // 88138982 Первичный контакт
  AMO_CAMPAIGN_STATUS_MATERIAL_SENT, // 88149794 материал отправлен
  88138986,                          // Переговоры
  88138990,                          // Принимают решение
  142,                               // Успешно реализовано
  143,                               // Закрыто и не реализовано
]

/**
 * Материал (презентация) уже отправлялся в этом диалоге? Источник истины — ТЕКУЩАЯ
 * СТАДИЯ СДЕЛКИ в amoCRM (getLead), НЕ текст истории диалога (прежний способ через
 * MATERIAL_SENT_MARKER-в-строке убран как ненадёжный). true, если сделка на стадии
 * AMO_CAMPAIGN_STATUS_MATERIAL_SENT или дальше по воронке (переговоры/решение/закрыта).
 * Сбой чтения сделки / неизвестный status_id → false (безопаснее переслать материал
 * ещё раз, чем не отправить его вовсе из-за временного сбоя amoCRM API).
 */
export async function materialAlreadySent(dealId: number): Promise<boolean> {
  try {
    const lead = await getLead(dealId)
    const statusId = lead?.status_id
    if (statusId == null) return false
    const materialIdx = CAMPAIGN_STAGE_ORDER.indexOf(AMO_CAMPAIGN_STATUS_MATERIAL_SENT)
    const currentIdx = CAMPAIGN_STAGE_ORDER.indexOf(statusId)
    if (currentIdx === -1) return false // статус вне ожидаемой воронки — не блокируем
    return currentIdx >= materialIdx
  } catch (e) {
    console.error('[campaign-bot] materialAlreadySent: getLead failed:', e instanceof Error ? e.message : e)
    return false
  }
}
