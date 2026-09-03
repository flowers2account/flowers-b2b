// Follow-up по расписанию для школьной кампании (крон /api/cron/campaign-followup).
// Молчащим контактам в воронке 11235862 на стадиях «Первичный контакт» (88138982) и
// «материал отправлен» (88149794) — до FOLLOWUP_MAX_ATTEMPTS напоминаний, по одному за
// окно отправки. Состояние — в кастомных полях сделки (см. amo.ts): счётчик попыток,
// «не раньше» (ISO-8601 UTC) и Umnico ref "leadId:realId" (пишет campaign-handoff.ts
// при первом входящем ответе). Реальный ответ клиента сбрасывает счётчик (тоже в
// campaign-handoff.ts). Сделки в 142/143 сюда не попадают (фильтр по статусу).
//
// ⚠️ Параллельный мини-конвейер: accessories-bot.ts / основной бот НЕ трогаем.

import { callGemini } from '@/lib/gemini'
import {
  campaignConfigured, listLeadsByPipeline, leadFieldValue, patchLeadFields, type AmoLeadRaw,
  AMO_CAMPAIGN_PIPELINE_ID, AMO_CAMPAIGN_STATUS_NEW, AMO_CAMPAIGN_STATUS_MATERIAL_SENT,
  CF_CAMPAIGN_NEXT_FOLLOWUP, CF_CAMPAIGN_FOLLOWUP_COUNT, CF_CAMPAIGN_UMNICO_REF,
} from '@/lib/amo'
import { fetchDialogContext, sendMessage, type DialogMessage } from '@/lib/umnico'
import {
  SCHOOL_FOLLOWUP_PROMPT, FOLLOWUP_PRIMARY_CONTACT_BASE, FOLLOWUP_MATERIAL_SENT_BASE,
} from './campaign-prompts'

// Легко поменять на 2, если владелец решит короче.
export const FOLLOWUP_MAX_ATTEMPTS = 3

// ── Таймзона и окна отправки ─────────────────────────────────────────────────
// Asia/Almaty — фиксированный UTC+5 без переходов на летнее время (сверено: Казахстан
// перешёл на единый UTC+5 в 2024). Поэтому обходимся смещением, без Intl/либы.
// Сервер VPS в UTC (timedatectl: Etc/UTC) — crontab-юниты пересчитаны в UTC отдельно.
const ALMATY_OFFSET_MIN = 5 * 60

// Два окна отправки, минуты от полуночи по Almaty: 09:30–11:00 и 14:00–15:30.
const WINDOWS_LOCAL: ReadonlyArray<readonly [number, number]> = [
  [9 * 60 + 30, 11 * 60],
  [14 * 60, 15 * 60 + 30],
]

// Календарные Y/M/D и «минуты от полуночи» для момента `d` в зоне Almaty.
function almatyParts(d: Date): { dayStartUtcMs: number; minutesIntoDay: number } {
  const shifted = new Date(d.getTime() + ALMATY_OFFSET_MIN * 60_000)
  const dayStartLocalMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  const minutesIntoDay = (shifted.getTime() - dayStartLocalMs) / 60_000
  // dayStartLocalMs — полночь Almaty, выраженная как «UTC-таймстамп тех же Y/M/D 00:00».
  // Обратно в реальный момент: вычесть смещение.
  return { dayStartUtcMs: dayStartLocalMs - ALMATY_OFFSET_MIN * 60_000, minutesIntoDay }
}

/** Ближайшее НАЧАЛО окна отправки строго позже `from` (реальный момент, UTC). */
export function computeNextWindow(from: Date): Date {
  const { dayStartUtcMs } = almatyParts(from)
  for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
    for (const [startLocal] of WINDOWS_LOCAL) {
      const candidate = dayStartUtcMs + dayOffset * 86_400_000 + startLocal * 60_000
      if (candidate > from.getTime()) return new Date(candidate)
    }
  }
  // недостижимо (4 дня × 2 окна всегда дают будущее) — страховка
  return new Date(from.getTime() + 24 * 3_600_000)
}

/** `date` попадает в одно из окон отправки (Almaty)? */
export function isWithinSendWindow(date: Date): boolean {
  const { minutesIntoDay } = almatyParts(date)
  return WINDOWS_LOCAL.some(([start, end]) => minutesIntoDay >= start && minutesIntoDay < end)
}

// ── Стадии, для которых работает follow-up ────────────────────────────────────
export type FollowupStageKey = 'primary_contact' | 'material_sent'

function stageKeyForStatus(statusId: number): FollowupStageKey | null {
  if (statusId === AMO_CAMPAIGN_STATUS_NEW) return 'primary_contact'          // 88138982
  if (statusId === AMO_CAMPAIGN_STATUS_MATERIAL_SENT) return 'material_sent'  // 88149794
  return null
}

const FOLLOWUP_BASE: Record<FollowupStageKey, string> = {
  primary_contact: FOLLOWUP_PRIMARY_CONTACT_BASE,
  material_sent: FOLLOWUP_MATERIAL_SENT_BASE,
}

// История Umnico → плоский текст (копия из campaign-handoff.ts, чтобы не тянуть оттуда
// импорт: campaign-handoff.ts сам импортирует computeNextWindow отсюда).
function formatHistory(history: DialogMessage[]): string {
  if (!history.length) return ''
  return history
    .map((h) => `${h.role === 'client' ? 'Клиент' : h.role === 'bot' ? 'Бот' : 'Менеджер'}: ${h.text}`)
    .join('\n')
}

/** "leadId:realId" → { leadId, realId }; пусто/битое → null. */
export function parseUmnicoRef(raw: string | null): { leadId: string; realId: string } | null {
  if (!raw) return null
  const m = raw.trim().match(/^([^:\s]+):([^:\s]+)$/)
  return m ? { leadId: m[1], realId: m[2] } : null
}

/**
 * Компоновка текста follow-up. callGemini перефразирует базовый текст стадии с учётом
 * истории и номера попытки. null → вызывающий пропускает сделку (ничего не шлёт,
 * счётчик не трогает).
 */
export async function composeFollowupReply(
  stageKey: FollowupStageKey,
  attemptNumber: number,
  historyText: string,
): Promise<string | null> {
  const base = FOLLOWUP_BASE[stageKey]
  const prompt = `${SCHOOL_FOLLOWUP_PROMPT}

Базовый текст напоминания: ${JSON.stringify(base)}
Это попытка ${attemptNumber} из ${FOLLOWUP_MAX_ATTEMPTS}.
${historyText ? `\nИстория диалога (старые→новые):\n${historyText}\n` : ''}`

  const text = await callGemini(prompt, { temperature: 0.3, timingLabel: 'campaign-followup-compose' })
  if (!text) return null
  const answer = text.trim()
  if (!answer || answer === 'NO_ANSWER' || answer.includes('NO_ANSWER')) return null
  return answer
}

// ── Тик крона ────────────────────────────────────────────────────────────────
interface TickResult { sent: number; skipped: number }

/**
 * Один проход follow-up. `now` инъектируется для тестов (крон-роут зовёт без аргумента).
 * Вне окна отправки — сразу выходит (двойная защита к неточному crontab). Идёт по всем
 * открытым сделкам воронки (142/143 отфильтрованы), для подходящих — fetchDialogContext
 * → composeFollowupReply → sendMessage, при успехе инкремент счётчика + сдвиг «не раньше».
 */
export async function runCampaignFollowupTick(now: Date = new Date()): Promise<TickResult> {
  // Школьная follow-up кампания ОТКЛЮЧЕНА (решение владельца 03.09.2026).
  // Крон на VPS (/etc/cron.d/flowers-campaign-followup-*) продолжает тикать, но вхолостую.
  // Снова включить: CAMPAIGN_FOLLOWUP_ENABLED=true в shared/.env.production + pm2 reload.
  if (process.env.CAMPAIGN_FOLLOWUP_ENABLED !== 'true') {
    console.log('[campaign-followup] кампания отключена (CAMPAIGN_FOLLOWUP_ENABLED != true) — тик пропущен')
    return { sent: 0, skipped: 0 }
  }
  if (!isWithinSendWindow(now)) {
    console.log('[campaign-followup] вне окна отправки — тик пропущен')
    return { sent: 0, skipped: 0 }
  }
  if (!campaignConfigured()) {
    console.warn('[campaign-followup] воронка кампании не сконфигурирована (AMO_CAMPAIGN_*) — тик пропущен')
    return { sent: 0, skipped: 0 }
  }

  let leads: AmoLeadRaw[]
  try {
    leads = await listLeadsByPipeline(AMO_CAMPAIGN_PIPELINE_ID, { withParam: 'contacts' })
  } catch (e) {
    console.error('[campaign-followup] не удалось получить сделки воронки:', e instanceof Error ? e.message : e)
    return { sent: 0, skipped: 0 }
  }

  let sent = 0
  let skipped = 0
  for (const lead of leads) {
    try {
      const did = await processFollowupLead(lead, now)
      if (did) sent += 1
      else skipped += 1
    } catch (e) {
      skipped += 1
      console.error(`[campaign-followup] сделка ${lead?.id}: ошибка обработки:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`[campaign-followup] тик завершён: sent=${sent} skipped=${skipped} (сделок в воронке: ${leads.length})`)
  return { sent, skipped }
}

/** true — если по этой сделке отправлен follow-up (счётчик увеличен). */
async function processFollowupLead(lead: AmoLeadRaw, now: Date): Promise<boolean> {
  const leadId = lead.id
  const stageKey = stageKeyForStatus(Number(lead.status_id))
  if (!stageKey) return false // 142/143 или прочие открытые стадии — follow-up не для них

  const count = Number.parseInt(leadFieldValue(lead, CF_CAMPAIGN_FOLLOWUP_COUNT) ?? '0', 10) || 0
  if (count >= FOLLOWUP_MAX_ATTEMPTS) {
    console.log(`[campaign-followup] сделка ${leadId}: лимит попыток (${count}) — пропуск`)
    return false
  }

  const notBeforeRaw = leadFieldValue(lead, CF_CAMPAIGN_NEXT_FOLLOWUP)
  if (notBeforeRaw) {
    const notBefore = new Date(notBeforeRaw)
    if (!Number.isNaN(notBefore.getTime()) && notBefore.getTime() > now.getTime()) {
      console.log(`[campaign-followup] сделка ${leadId}: ещё рано (не раньше ${notBeforeRaw}) — пропуск`)
      return false
    }
  }
  // notBeforeRaw пусто → сделка ещё ни разу не получала ответ/follow-up: шлём первый.

  const ref = parseUmnicoRef(leadFieldValue(lead, CF_CAMPAIGN_UMNICO_REF))
  if (!ref) {
    console.warn(
      `[campaign-followup] сделка ${leadId}: пустой/битый Campaign umnico ref ` +
      `(${JSON.stringify(leadFieldValue(lead, CF_CAMPAIGN_UMNICO_REF))}) — некому слать, пропуск`,
    )
    return false
  }

  const history = await fetchDialogContext(ref.leadId, ref.realId, { limit: 10 })
  const attemptNumber = count + 1
  const text = await composeFollowupReply(stageKey, attemptNumber, formatHistory(history))
  if (!text) {
    console.warn(`[campaign-followup] сделка ${leadId}: composeFollowupReply вернул пусто (NO_ANSWER/сбой) — пропуск`)
    return false
  }

  const ok = await sendMessage(ref.leadId, text)
  if (!ok) {
    console.error(`[campaign-followup] сделка ${leadId}: sendMessage не удался — счётчик не трогаем`)
    return false
  }

  await patchLeadFields(leadId, [
    { field_id: CF_CAMPAIGN_FOLLOWUP_COUNT, value: attemptNumber },
    { field_id: CF_CAMPAIGN_NEXT_FOLLOWUP, value: computeNextWindow(now).toISOString() },
  ])
  console.log(`[campaign-followup] сделка ${leadId}: отправлен follow-up #${attemptNumber} (стадия ${stageKey})`)
  return true
}
