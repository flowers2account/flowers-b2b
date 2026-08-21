export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/telegram-manager/client'
import { sendTextMessage } from '@/lib/whatsapp-cloud/client'
import { recordManualOutgoing } from '@/lib/whatsapp-cloud/bridge'

// Вебхук бота «Менеджер» — приём Reply менеджера на карточки WhatsApp Cloud API диалогов,
// которые шлёт src/lib/telegram-manager/notify.ts в группу TELEGRAM_MANAGER_GROUP_CHAT_ID.
//
// Безопасность — тот же паттерн, что src/app/api/telegram/dispatcher/route.ts:
//   X-Telegram-Bot-Api-Secret-Token (задаётся в setWebhook) === TELEGRAM_MANAGER_WEBHOOK_SECRET.
//
// Reply, который не удалось сопоставить с диалогом (не-reply, chat не тот, sообщение
// не найдено в telegram_manager_links) — тихо игнорируется, 200, ничего не падает.
// Telegram ретраит при не-200/таймауте → отвечаем 200 сразу после обработки (объём
// небольшой, ждать реального ответа клиента не страшно — в отличие от dispatcher, тут
// нет тяжёлой работы типа Whisper).

interface TgChat { id?: number }
interface TgMessage {
  message_id?: number
  chat?: TgChat
  text?: string
  reply_to_message?: { message_id?: number }
}
interface TgUpdate { message?: TgMessage }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  const expected = process.env.TELEGRAM_MANAGER_WEBHOOK_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let update: TgUpdate
  try {
    update = (await req.json()) as TgUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = update.message
  const groupId = process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID
  const chatId = msg?.chat?.id

  if (!msg || !groupId || chatId === undefined || String(chatId) !== String(groupId)) {
    return NextResponse.json({ ok: true }) // чужой чат/пустой апдейт — тихо
  }

  const replyToId = msg.reply_to_message?.message_id
  if (!replyToId) {
    return NextResponse.json({ ok: true }) // не-reply — тихо, не пытаемся сопоставить
  }

  const text = (msg.text ?? '').trim()
  if (!text) {
    return NextResponse.json({ ok: true }) // reply без текста (стикер/фото и т.п.) — тихо
  }

  try {
    await handleManagerReply({ groupId, replyToId, text })
  } catch (e) {
    console.error('[telegram manager webhook] handleManagerReply failed', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true })
}

async function handleManagerReply(input: { groupId: string; replyToId: number; text: string }): Promise<void> {
  const admin = createAdminClient()
  const { data: link } = await admin
    .from('telegram_manager_links')
    .select('chat_jid, phone')
    .eq('telegram_chat_id', Number(input.groupId))
    .eq('telegram_message_id', input.replyToId)
    .maybeSingle()

  if (!link) {
    console.log('[telegram manager webhook] reply to unknown message — ignored', { replyToId: input.replyToId })
    return
  }

  const phone = link.phone ?? link.chat_jid.replace(/@cloudapi$/, '')
  const traceId = `tgmgr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

  let sent: { messageId?: string }
  try {
    sent = await sendTextMessage(phone, input.text)
  } catch (error) {
    console.error('[telegram manager webhook] send to client failed', {
      chatJid: link.chat_jid,
      traceId,
      error: error instanceof Error ? error.message : String(error),
    })
    await confirmInGroup(input.groupId, input.replyToId, `❌ Не удалось отправить: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  if (!sent.messageId) {
    console.warn('[telegram manager webhook] send succeeded without messageId', { chatJid: link.chat_jid, traceId })
    await confirmInGroup(input.groupId, input.replyToId, '⚠️ Отправлено, но без подтверждения от WhatsApp')
    return
  }

  await recordManualOutgoing({
    chatJid: link.chat_jid,
    phone,
    messageId: sent.messageId,
    text: input.text,
    traceId,
    takeoverReason: 'telegram_manager',
  })

  await confirmInGroup(input.groupId, input.replyToId, '✅ Отправлено клиенту')
}

async function confirmInGroup(groupId: string, replyToId: number, text: string): Promise<void> {
  try {
    await sendMessage(groupId, text, { replyToMessageId: replyToId })
  } catch (e) {
    console.error('[telegram manager webhook] confirmation send failed', e instanceof Error ? e.message : e)
  }
}
