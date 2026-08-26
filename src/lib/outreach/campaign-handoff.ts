// ИИ-агент для Umnico-кампаний (первая — школьная рассылка к 1 сентября, воронка
// amoCRM «Школьная рассылка (1 сентября)», pipeline_id=11235862).
//
// Ручной процесс (вне кода): оператор сам отправляет приветствие через Umnico UI
// («Написать первым») и сам ЖЕ создаёт сделку в этой воронке (этап «Первичный
// контакт», id=88138982) сразу после отправки. Код НИЧЕГО не регистрирует и НИЧЕГО
// не создаёт сам — только при входящем ответе проверяет, есть ли для этого телефона
// уже заведённая сделка в воронке кампании, и если да — классифицирует ответ и
// генерирует ответ клиенту (по образцу конвейера accessories-bot.ts: callGemini +
// fetchDialogContext, см. src/lib/bot/campaign-bot.ts), плюс лог + Telegram менеджеру.
//
// Если сделки нет (или saId не совпадает с каналом кампании, или воронка не
// сконфигурирована) — tryHandleCampaignReply возвращает null, и вызывающий
// (webhooks/umnico/route.ts) продолжает обычную обработку (capture.ts + AI-бот) РОВНО
// как до этой задачи.

import { sendMessage as sendTelegramMessage } from '@/lib/telegram-manager/client'
import {
  findLeadByPhoneInPipeline, patchLeadStage, AMO_CAMPAIGN_PIPELINE_ID,
  AMO_CAMPAIGN_STATUS_MATERIAL_SENT, campaignConfigured,
} from '@/lib/amo'
import { fetchDialogContext, sendMessage, sendPhoto, type DialogMessage } from '@/lib/umnico'
import { classifyCampaignIntent, composeCampaignReply, materialAlreadySent } from '@/lib/bot/campaign-bot'
import { SCHOOL_CAMPAIGN_PDF_URL, SCHOOL_CAMPAIGN_IMAGE_URL } from '@/lib/bot/campaign-prompts'

export interface IncomingCampaignMessage {
  text: string
  umnicoLeadId: string | number | null
  realId: string | number | null
}

/**
 * phone — нормализованный номер клиента (или как пришёл в вебхуке); saId — числовой
 * идентификатор канала Umnico, с которого пришло сообщение (определяет вызывающий).
 * Ничего не создаёт — только ищет существующую сделку через findLeadByPhoneInPipeline
 * (src/lib/amo.ts, уже используется для аутрич-захвата LAPS). Возвращает dealId
 * (amoCRM lead id), если контакт наш и сделка уже заведена оператором вручную; иначе null.
 */
export async function tryHandleCampaignReply(
  phone: string | null,
  saId: number | null,
  incoming: IncomingCampaignMessage,
): Promise<number | null> {
  if (!phone) return null

  const expectedSaId = Number(process.env.UMNICO_WHATSAPP_SA_ID || 0)
  if (!expectedSaId || saId !== expectedSaId) return null

  if (!campaignConfigured()) return null // воронка кампании не задана в env — нечего искать

  let found: { leadId: number; contactId: number } | null = null
  try {
    found = await findLeadByPhoneInPipeline([phone], AMO_CAMPAIGN_PIPELINE_ID)
  } catch (e) {
    console.error('[campaign-handoff] findLeadByPhoneInPipeline failed:', e instanceof Error ? e.message : e)
    return null // ошибка поиска — не блокируем обычный конвейер
  }
  if (!found) return null

  await onCampaignContactReplied(found.leadId, phone, incoming)
  return found.leadId
}

// amoCRM URL сделки — subdomain как в src/lib/amo.ts (BASE).
const AMO_SUBDOMAIN = 'tropinvladislav1'

/** История диалога Umnico → плоский текст для промпта (старые→новые), как
 * formatHistory() в accessories-bot.ts — тот файл не трогаем, поэтому копия здесь. */
function formatCampaignHistory(history: DialogMessage[]): string {
  if (!history.length) return ''
  return history
    .map((h) => `${h.role === 'client' ? 'Клиент' : h.role === 'bot' ? 'Бот' : 'Менеджер'}: ${h.text}`)
    .join('\n')
}

async function notifyManagerTelegram(
  dealId: number,
  phone: string,
  incoming: IncomingCampaignMessage,
): Promise<void> {
  const groupId = process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID
  if (!groupId) return
  try {
    const text =
      `📣 Школьная кампания (1 сентября)\n` +
      `Клиент ${phone} ответил по школьной кампании.\n` +
      `Сделка: https://${AMO_SUBDOMAIN}.amocrm.ru/leads/detail/${dealId}\n\n` +
      `Сообщение клиента:\n${incoming.text || '(без текста)'}`
    await sendTelegramMessage(groupId, text)
  } catch (e) {
    console.error('[campaign-handoff] telegram notify failed:', e instanceof Error ? e.message : e)
  }
}

/**
 * Событие «контакт школьной кампании ответил, сделка уже есть». Всегда: лог +
 * уведомление менеджеру в Telegram (не блокирует и не гейтит остальное). Затем —
 * классификация (classifyCampaignIntent) + генерация ответа (composeCampaignReply) по
 * образцу основного конвейера (callGemini + fetchDialogContext), отправка клиенту
 * текстом (sendMessage, формат A — по leadId, диалог уже существует) и, при
 * intent==='agree_send' и материале, ещё не отправленном в этом диалоге — двумя
 * фото/файлами (sendPhoto, формат A: path/name/mime).
 *
 * Любой сбой ИИ (classifyCampaignIntent вернул null) — тихо останавливаемся, клиенту
 * ничего не уходит (только лог + telegram уже отправлены выше).
 */
export async function onCampaignContactReplied(
  dealId: number,
  phone: string,
  incoming: IncomingCampaignMessage,
): Promise<void> {
  console.log(
    `[campaign-handoff] школьная кампания: контакт ${phone} ответил ` +
    `(deal=${dealId}, umnico_lead_id=${incoming.umnicoLeadId ?? '—'})`
  )

  // Telegram — всегда, независимо от исхода ИИ-логики ниже (не await-блокирует её).
  await notifyManagerTelegram(dealId, phone, incoming)

  const { umnicoLeadId, realId } = incoming
  if (umnicoLeadId == null || realId == null) {
    console.warn('[campaign-handoff] нет umnicoLeadId/realId в payload — история недоступна, ответ клиенту не генерируется')
    return
  }

  const history = await fetchDialogContext(umnicoLeadId, realId, { limit: 10 })
  const historyText = formatCampaignHistory(history)

  const classified = await classifyCampaignIntent(incoming.text, historyText)
  if (!classified) {
    console.warn('[campaign-handoff] classifyCampaignIntent failed (ИИ недоступен) — ответ клиенту не генерируется')
    return
  }
  console.log('[campaign-handoff] intent:', classified.intent)

  const reply = await composeCampaignReply(classified.intent, historyText)
  if (!reply) {
    console.warn('[campaign-handoff] composeCampaignReply вернул пусто (NO_ANSWER/ошибка) — ответ клиенту не отправлен')
    return
  }

  const sent = await sendMessage(umnicoLeadId, reply)
  console.log('[campaign-handoff] sendMessage:', sent ? 'ok' : 'failed')
  if (!sent) return

  if (classified.intent === 'agree_send' && !(await materialAlreadySent(dealId))) {
    let okPdf = false
    let okImg = false
    try {
      okPdf = await sendPhoto(umnicoLeadId, SCHOOL_CAMPAIGN_PDF_URL)
      console.log('[campaign-handoff] sendPhoto (pdf):', okPdf ? 'ok' : 'failed')
    } catch (e) {
      console.error('[campaign-handoff] sendPhoto (pdf) failed:', e instanceof Error ? e.message : e)
    }
    try {
      okImg = await sendPhoto(umnicoLeadId, SCHOOL_CAMPAIGN_IMAGE_URL)
      console.log('[campaign-handoff] sendPhoto (image):', okImg ? 'ok' : 'failed')
    } catch (e) {
      console.error('[campaign-handoff] sendPhoto (image) failed:', e instanceof Error ? e.message : e)
    }

    // Стадию двигаем ТОЛЬКО после успешной отправки ОБОИХ файлов. Сбой перевода стадии
    // не блокирует диалог с клиентом (материал он уже получил) — но лог явный, чтобы
    // расхождение (материал отправлен, стадия не двинута) было видно в логах/по факту.
    if (okPdf && okImg) {
      try {
        await patchLeadStage(dealId, AMO_CAMPAIGN_STATUS_MATERIAL_SENT)
        console.log(`[campaign-handoff] сделка ${dealId} → стадия «материал отправлен» (${AMO_CAMPAIGN_STATUS_MATERIAL_SENT})`)
      } catch (e) {
        console.error(
          `[campaign-handoff] НЕ УДАЛОСЬ перевести сделку ${dealId} на стадию «материал отправлен» ` +
          `(${AMO_CAMPAIGN_STATUS_MATERIAL_SENT}) — материал клиенту отправлен, но стадия amoCRM рассинхронизирована:`,
          e instanceof Error ? e.message : e,
        )
      }
    }
  }
}
