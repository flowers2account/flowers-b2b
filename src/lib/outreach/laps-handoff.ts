// ИИ-агент холодной B2B-кампании «LAPS» (обзвон флористов из 2ГИС, воронка
// amoCRM «Обзвон LAPS» pipeline_id=11053958). Построен по образцу
// src/lib/outreach/campaign-handoff.ts (школьная кампания) — её код НЕ трогаем и
// НЕ импортируем из неё логику; общие вещи (amo.ts helpers, окна времени из
// campaign-followup.ts) переиспользуем.
//
// Ручной процесс (вне кода): оператор сам создаёт сделку в воронке 11053958
// (контакты из 2ГИС) и сам отправляет первое приветствие через Umnico UI. Код
// ничего не создаёт — только на исходящее/входящее находит сделку по номеру в
// этой воронке и ведёт диалог (классификация + Gemini-ответ), двигает стадии,
// шлёт презентацию.
//
// Канал Umnico — ТОТ ЖЕ, что у школьной кампании (один saId). Кампанию узнаём по
// pipeline_id найденной сделки. Не наш номер / сделки нет / LAPS выключен →
// возвращаем null, вызывающий (webhooks/umnico/route.ts) продолжает как раньше.

import { sendMessage as sendTelegramMessage } from '@/lib/telegram-manager/client'
import {
  findLeadByPhoneInPipeline, patchLeadStage, patchLeadFields, getLead, leadFieldValue,
  addLeadTags, removeLeadTags,
  CF_CAMPAIGN_NEXT_FOLLOWUP, CF_CAMPAIGN_FOLLOWUP_COUNT, CF_CAMPAIGN_UMNICO_REF,
} from '@/lib/amo'
import { fetchDialogContext, sendMessage, sendPhoto, type DialogMessage } from '@/lib/umnico'
import { classifyLapsIntent, composeLapsReply, lapsMaterialAlreadySent, type LapsIntent } from '@/lib/bot/laps-bot'
import { computeNextWindow } from '@/lib/bot/campaign-followup'
import { isWithinLapsReplyHours } from '@/lib/bot/laps-hours'
import { withDealLock } from './deal-lock'
import { scheduleDebouncedProcessing } from './message-debounce'
import {
  AMO_LAPS_PIPELINE_ID, AMO_LAPS_STATUS_NEW_LEADS, AMO_LAPS_STATUS_WHATSAPP,
  AMO_LAPS_STATUS_LPR, AMO_LAPS_STATUS_MATERIAL, AMO_LAPS_STATUS_DEMO, AMO_LAPS_STATUS_THINKING,
  AMO_LAPS_STATUS_LOST, LAPS_FOLLOWUP_STOPPED, LAPS_REFUSE_ONCE_TAG, LAPS_REPLY_PENDING_TAG,
  LAPS_PRESENTATION_PDF_URL, LAPS_CATALOG_URL, lapsEnabled,
} from '@/lib/bot/laps-config'

const AMO_SUBDOMAIN = 'tropinvladislav1'

export interface IncomingLapsMessage {
  text: string
  umnicoLeadId: string | number | null
  realId: string | number | null
}

function envSaId(): number {
  return Number(process.env.UMNICO_WHATSAPP_SA_ID || 0)
}

// ── Входящее сообщение контакта LAPS ─────────────────────────────────────────
/**
 * phone — номер клиента; saId — канал Umnico. Ничего не создаёт: ищет сделку
 * через findLeadByPhoneInPipeline в воронке LAPS. Возвращает dealId, если контакт
 * наш и сделка есть; иначе null (LAPS выключен / не наш канал / сделки нет).
 */
export async function tryHandleLapsReply(
  phone: string | null,
  saId: number | null,
  incoming: IncomingLapsMessage,
): Promise<number | null> {
  if (!phone) return null
  if (!lapsEnabled()) return null

  const expectedSaId = envSaId()
  if (!expectedSaId || saId !== expectedSaId) return null

  let found: { leadId: number; contactId: number } | null = null
  try {
    found = await findLeadByPhoneInPipeline([phone], AMO_LAPS_PIPELINE_ID)
  } catch (e) {
    console.error('[laps-handoff] findLeadByPhoneInPipeline failed:', e instanceof Error ? e.message : e)
    return null
  }
  if (!found) return null
  const dealId = found.leadId

  // Рабочее время реактивных ответов — 09:00–18:30 Almaty. Вне окна: НЕ отвечаем
  // сразу и НЕ теряем — вешаем тег laps-reply-pending; проход крона
  // /api/cron/campaign-followup в рабочее время (09:45 Almaty) ответит на
  // актуальную историю (runLapsPendingReplyTick). Тег переживает деплой/pm2
  // reload — in-memory setTimeout дебаунса нет.
  if (!isWithinLapsReplyHours()) {
    try {
      await addLeadTags(dealId, [LAPS_REPLY_PENDING_TAG])
      console.log(`[laps-handoff] входящее вне рабочих часов (09:00–18:30 Almaty) — ответ отложен, сделка ${dealId} помечена ${LAPS_REPLY_PENDING_TAG}`)
    } catch (e) {
      console.error('[laps-handoff] не удалось поставить тег отложенного ответа:', e instanceof Error ? e.message : e)
    }
    return dealId
  }

  // Дебаунс: не отвечаем сразу — ждём паузу в burst'е и обрабатываем один раз на
  // объединённый контекст (message-debounce.ts). onLapsContactReplied уже обёрнут
  // в withDealLock — оба механизма сохранены. Webhook возвращает 200, не дожидаясь
  // обработки (она уходит в фон после ответа Umnico).
  scheduleDebouncedProcessing(dealId, () => onLapsContactReplied(dealId, phone, incoming))
  return dealId
}

// ── Исходящее (ручное «Написать первым») ─────────────────────────────────────
/**
 * message.outgoing на LAPS-канале: если у телефона есть сделка в воронке LAPS —
 *  1) записать Campaign umnico ref «leadId:realId», если он пуст/битый;
 *  2) если сделка ещё в «Новые лиды (не звонили)» — перевести в «сообщение в
 *     ватсап» (первое ручное приветствие). Уже дальше по воронке — не трогаем.
 * Ничего не создаёт, не отвечает, не гейтит вебхук. Аналог
 * tryCaptureCampaignRefFromOutgoing, но параллельно для LAPS (школьный не меняем).
 */
export async function tryCaptureLapsRefFromOutgoing(
  phone: string | null,
  saId: number | null,
  ids: { umnicoLeadId: string | number | null; realId: string | number | null },
): Promise<void> {
  if (!phone) return
  if (!lapsEnabled()) return

  const expectedSaId = envSaId()
  if (!expectedSaId || saId !== expectedSaId) return

  let found: { leadId: number; contactId: number } | null = null
  try {
    found = await findLeadByPhoneInPipeline([phone], AMO_LAPS_PIPELINE_ID)
  } catch (e) {
    console.error('[laps-handoff] outgoing: findLeadByPhoneInPipeline failed:', e instanceof Error ? e.message : e)
    return
  }
  if (!found) return

  let lead: Record<string, unknown> | null = null
  try {
    lead = await getLead(found.leadId)
  } catch (e) {
    console.error('[laps-handoff] outgoing: getLead failed:', e instanceof Error ? e.message : e)
  }

  // 1) ref — только если пуст/битый
  const currentRef = leadFieldValue(lead, CF_CAMPAIGN_UMNICO_REF)
  const refOk = currentRef && /^[^:\s]+:[^:\s]+$/.test(currentRef.trim())
  if (!refOk && ids.umnicoLeadId != null && ids.realId != null) {
    try {
      await patchLeadFields(found.leadId, [
        { field_id: CF_CAMPAIGN_UMNICO_REF, value: `${ids.umnicoLeadId}:${ids.realId}` },
      ])
      console.log(`[laps-handoff] outgoing: umnico ref записан для сделки ${found.leadId} (${ids.umnicoLeadId}:${ids.realId})`)
    } catch (e) {
      console.error('[laps-handoff] outgoing: не удалось записать umnico ref:', e instanceof Error ? e.message : e)
    }
  }

  // 2) «Новые лиды (не звонили)» → «сообщение в ватсап»
  if (Number((lead as { status_id?: unknown })?.status_id) === AMO_LAPS_STATUS_NEW_LEADS) {
    try {
      await patchLeadStage(found.leadId, AMO_LAPS_STATUS_WHATSAPP)
      console.log(`[laps-handoff] outgoing: сделка ${found.leadId} → «сообщение в ватсап» (${AMO_LAPS_STATUS_WHATSAPP})`)
    } catch (e) {
      console.error(`[laps-handoff] outgoing: не удалось перевести сделку ${found.leadId} в «сообщение в ватсап»:`, e instanceof Error ? e.message : e)
    }
  }
}

// ── История → плоский текст ──────────────────────────────────────────────────
function formatLapsHistory(history: DialogMessage[]): string {
  if (!history.length) return ''
  return history
    .map((h) => `${h.role === 'client' ? 'Клиент' : h.role === 'bot' ? 'Бот' : 'Менеджер'}: ${h.text}`)
    .join('\n')
}

function countClientLines(historyText: string): number {
  return (historyText.match(/^Клиент:/gm) ?? []).length
}

function leadHasTag(lead: unknown, tag: string): boolean {
  const tags = (lead as { _embedded?: { tags?: Array<{ name?: string }> } })?._embedded?.tags ?? []
  return tags.some((t) => t?.name === tag)
}

// not_lpr: клиент назвал роль ЛПР без контакта, ИЛИ явно отказал дать контакт →
// в этом случае сразу отправляем материалы «вам, перешлёте руководителю».
const LPR_ROLE_RE = /(руководств|директор|начальник|заведующ|владел|хозяин|хозяйк|шеф|старш(ий|ая)|собственник|учредит)/i
const CONTACT_REFUSAL_RE = /(не дам|не буду давать|не скажу|не могу дать|нет.{0,15}контакт|без контакт|не поделюсь)/i

async function notifyManagerTelegram(dealId: number, phone: string, incoming: IncomingLapsMessage): Promise<void> {
  const groupId = process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID
  if (!groupId) return
  try {
    const text =
      `📞 LAPS (обзвон 2ГИС)\n` +
      `Клиент ${phone} ответил по кампании LAPS.\n` +
      `Сделка: https://${AMO_SUBDOMAIN}.amocrm.ru/leads/detail/${dealId}\n\n` +
      `Сообщение клиента:\n${incoming.text || '(без текста)'}`
    await sendTelegramMessage(groupId, text)
  } catch (e) {
    console.error('[laps-handoff] telegram notify failed:', e instanceof Error ? e.message : e)
  }
}

/**
 * Контакт LAPS ответил, сделка уже есть. Всегда: лог + Telegram менеджеру. Затем
 * классификация + Gemini-ответ + отправка текстом, и по intent — отправка
 * презентации + ссылки на каталог, переходы стадий, счётчик отказов (тег),
 * терминальное закрытие (143 + followup=999). Любой сбой ИИ — тихо стоп.
 *
 * ФИКС Б: обёрнут в withDealLock(dealId) — конкурентные входящие одного диалога
 * обрабатываются последовательно, а не параллельно (см. deal-lock.ts).
 */
export async function onLapsContactReplied(
  dealId: number,
  phone: string,
  incoming: IncomingLapsMessage,
): Promise<void> {
  return withDealLock(dealId, () => onLapsContactRepliedImpl(dealId, phone, incoming))
}

async function onLapsContactRepliedImpl(
  dealId: number,
  phone: string,
  incoming: IncomingLapsMessage,
): Promise<void> {
  console.log(
    `[laps-handoff] LAPS: контакт ${phone} ответил (deal=${dealId}, umnico_lead_id=${incoming.umnicoLeadId ?? '—'})`,
  )

  // Состояние сделки читаем ПЕРВЫМ — до Telegram, classify, compose и любых отправок.
  // Нужно и для гейта «Презентация/демо» ниже, и дальше по коду (стадия + теги отказов).
  let lead: Record<string, unknown> | null = null
  try {
    lead = await getLead(dealId)
  } catch (e) {
    console.error('[laps-handoff] getLead failed:', e instanceof Error ? e.message : e)
  }
  const currentStatus = Number((lead as { status_id?: unknown })?.status_id) || 0

  // Сделка уже на «Презентация/демо» (86836494) — дальше её ведёт менеджер вручную.
  // Бот полностью самоустраняется: без Telegram-уведомления, classify, compose, отправок
  // и переходов стадий. Просто выходим — входящее клиента остаётся в Umnico-инбоксе менеджера.
  if (currentStatus === AMO_LAPS_STATUS_DEMO) {
    console.log(
      `[laps-handoff] skip: сделка ${dealId} на стадии «Презентация/демо» (${AMO_LAPS_STATUS_DEMO}) — бот не вмешивается`,
    )
    return
  }

  // Рабочее время (страховка на границе 18:30 и на путь крона): если дебаунс
  // догорел уже вне окна — не отвечаем сейчас, вешаем тег, крон ответит утром.
  // Крон (runLapsPendingReplyTick) вызывает нас только в рабочее время, поэтому
  // здесь он гейт проходит.
  if (!isWithinLapsReplyHours()) {
    try {
      await addLeadTags(dealId, [LAPS_REPLY_PENDING_TAG])
      console.log(`[laps-handoff] обработка вне рабочих часов (09:00–18:30 Almaty) — ответ отложен, сделка ${dealId} помечена ${LAPS_REPLY_PENDING_TAG}`)
    } catch (e) {
      console.error('[laps-handoff] не удалось поставить тег отложенного ответа:', e instanceof Error ? e.message : e)
    }
    return
  }

  await notifyManagerTelegram(dealId, phone, incoming)

  const { umnicoLeadId, realId } = incoming

  // umnico ref в сделку СРАЗУ (крону follow-up нужен адрес диалога).
  if (umnicoLeadId != null && realId != null) {
    try {
      await patchLeadFields(dealId, [
        { field_id: CF_CAMPAIGN_UMNICO_REF, value: `${umnicoLeadId}:${realId}` },
      ])
    } catch (e) {
      console.error('[laps-handoff] не удалось сохранить umnico ref:', e instanceof Error ? e.message : e)
    }
  }

  if (umnicoLeadId == null || realId == null) {
    console.warn('[laps-handoff] нет umnicoLeadId/realId — история недоступна, ответ не генерируется')
    return
  }

  const history = await fetchDialogContext(umnicoLeadId, realId, { limit: 10 })
  const historyText = formatLapsHistory(history)
  const priorClientLines = countClientLines(historyText)

  const classified = await classifyLapsIntent(incoming.text, historyText)
  if (!classified) {
    console.warn('[laps-handoff] classifyLapsIntent failed — ответ не генерируется')
    return
  }
  const intent: LapsIntent = classified.intent
  console.log('[laps-handoff] intent:', intent)

  // Стадия сделки и теги уже прочитаны выше (getLead в начале обработки).
  const alreadySent = await lapsMaterialAlreadySent(dealId)
  const refuseSecond = intent === 'refuse' && leadHasTag(lead, LAPS_REFUSE_ONCE_TAG)
  const terminal = intent === 'hostile' || refuseSecond

  // Реальный ответ обнуляет цепочку молчания follow-up — кроме терминальных.
  if (!terminal) {
    try {
      await patchLeadFields(dealId, [
        { field_id: CF_CAMPAIGN_FOLLOWUP_COUNT, value: 0 },
        { field_id: CF_CAMPAIGN_NEXT_FOLLOWUP, value: computeNextWindow(new Date()).toISOString() },
      ])
    } catch (e) {
      console.error('[laps-handoff] не удалось сбросить счётчик follow-up:', e instanceof Error ? e.message : e)
    }
  }

  const reply = await composeLapsReply(intent, historyText, alreadySent, refuseSecond)
  if (!reply) {
    console.warn('[laps-handoff] composeLapsReply вернул пусто (NO_ANSWER/ошибка) — ответ не отправлен')
    return
  }

  const sent = await sendMessage(umnicoLeadId, reply)
  console.log('[laps-handoff] sendMessage:', sent ? 'ok' : 'failed')
  if (!sent) return

  // Реактивный ответ ушёл — снять метку отложенного ответа, если была (сделку
  // мог поставить в очередь ночной вебхук, а разгрёб её либо крон, либо этот же
  // проход по более позднему сообщению в рабочее время).
  if (leadHasTag(lead, LAPS_REPLY_PENDING_TAG)) {
    removeLeadTags(dealId, [LAPS_REPLY_PENDING_TAG]).catch((e) =>
      console.error('[laps-handoff] не удалось снять тег отложенного ответа:', e instanceof Error ? e.message : e),
    )
  }

  // ── Решения по отправке файлов ──────────────────────────────────────────────
  // «Переход к делу»: ready_signal ЛИБО small_talk после первого круга (в истории
  // уже есть входящее «Клиент: …»). Первое small_talk (priorClientLines === 0) —
  // просто поддержать беседу, без файлов.
  const isTransition = intent === 'ready_signal' || (intent === 'small_talk' && priorClientLines >= 1)
  const notLprSendFiles =
    intent === 'not_lpr' && !alreadySent &&
    (LPR_ROLE_RE.test(incoming.text) || CONTACT_REFUSAL_RE.test(incoming.text))

  // ФИКС А: isTransition тоже гейтится !alreadySent — иначе презентация+каталог
  // переотправлялись при КАЖДОМ повторном ready_signal / small_talk-после-1-круга
  // в одном диалоге (инцидент 05.09.2026: клиент получил 4× presentation.pdf).
  const shouldSendFiles =
    (isTransition && !alreadySent) ||
    (intent === 'has_supplier' && !alreadySent) ||
    (intent === 'agree_send' && !alreadySent) ||
    notLprSendFiles

  let filesSent = false
  if (shouldSendFiles) {
    let okPdf = false
    try {
      okPdf = await sendPhoto(umnicoLeadId, LAPS_PRESENTATION_PDF_URL, undefined, undefined, 'whatsapp2')
      console.log('[laps-handoff] sendPhoto (presentation):', okPdf ? 'ok' : 'failed')
    } catch (e) {
      console.error('[laps-handoff] sendPhoto (presentation) failed:', e instanceof Error ? e.message : e)
    }
    if (okPdf) {
      filesSent = true
      try {
        await sendMessage(umnicoLeadId, `каталог: ${LAPS_CATALOG_URL}`)
      } catch (e) {
        console.error('[laps-handoff] отправка ссылки на каталог не удалась:', e instanceof Error ? e.message : e)
      }
    }
  }

  // ── Переход стадии (один PATCH — самая дальняя применимая) ──────────────────
  let target = 0
  // первый входящий, сделка ещё в «сообщение в ватсап» → «ЛПР определён»
  if (priorClientLines === 0 && currentStatus === AMO_LAPS_STATUS_WHATSAPP) target = AMO_LAPS_STATUS_LPR
  if (filesSent) target = AMO_LAPS_STATUS_MATERIAL
  if (intent === 'interested') target = AMO_LAPS_STATUS_THINKING
  if (terminal) target = AMO_LAPS_STATUS_LOST

  if (target && target !== currentStatus) {
    try {
      await patchLeadStage(dealId, target)
      console.log(`[laps-handoff] сделка ${dealId} → стадия ${target}`)
    } catch (e) {
      console.error(`[laps-handoff] НЕ УДАЛОСЬ перевести сделку ${dealId} на стадию ${target}:`, e instanceof Error ? e.message : e)
    }
  }

  // ── Счётчики / стоп ───────────────────────────────────────────────────────
  if (intent === 'refuse' && !refuseSecond) {
    try {
      await addLeadTags(dealId, [LAPS_REFUSE_ONCE_TAG])
    } catch (e) {
      console.error('[laps-handoff] не удалось поставить тег первого отказа:', e instanceof Error ? e.message : e)
    }
  }
  if (terminal) {
    try {
      await patchLeadFields(dealId, [{ field_id: CF_CAMPAIGN_FOLLOWUP_COUNT, value: LAPS_FOLLOWUP_STOPPED }])
      console.log(`[laps-handoff] сделка ${dealId}: follow-up остановлен навсегда (count=${LAPS_FOLLOWUP_STOPPED})`)
    } catch (e) {
      console.error('[laps-handoff] не удалось выставить стоп follow-up:', e instanceof Error ? e.message : e)
    }
  }
}
