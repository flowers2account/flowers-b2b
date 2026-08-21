// Зеркалит WhatsApp Cloud API диалог (входящее от клиента + ответ AI) в Telegram-группу
// менеджеров + пишет telegram_manager_links для последующего reply-роутинга.
// Все функции non-fatal: ошибка (Telegram недоступен, БД недоступна) только логируется,
// основной pipeline (webhook/route.ts) от этого не должен падать/блокироваться.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from './client'

function groupChatId(): string | undefined {
  return process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID
}

async function clientLabel(phone?: string): Promise<string> {
  if (!phone) return 'неизвестный номер'
  try {
    const admin = createAdminClient()
    const digits = phone.replace(/\D/g, '')
    const { data } = await admin
      .from('clients')
      .select('name, company_name')
      .or(`phone.eq.${phone},phone.eq.+${digits},phone.eq.${digits}`)
      .maybeSingle()
    if (data?.name) return data.company_name ? `${data.name} (${data.company_name})` : data.name
  } catch (e) {
    console.warn('[telegram-manager] client lookup failed', e instanceof Error ? e.message : e)
  }
  return phone
}

async function linkMessage(input: {
  telegramChatId: string
  telegramMessageId: number
  chatJid: string
  phone?: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('telegram_manager_links').insert({
      telegram_chat_id: Number(input.telegramChatId),
      telegram_message_id: input.telegramMessageId,
      chat_jid: input.chatJid,
      phone: input.phone ?? null,
    })
  } catch (e) {
    console.error('[telegram-manager] link insert failed', e instanceof Error ? e.message : e)
  }
}

export async function notifyIncoming(input: {
  chatJid: string
  phone?: string
  contactName?: string
  text: string
}): Promise<void> {
  const groupId = groupChatId()
  if (!groupId) return
  try {
    const label = await clientLabel(input.phone)
    const nameLine = input.contactName && input.contactName !== label ? ` (${input.contactName})` : ''
    const text = `💬 ${label}${nameLine}\n${input.phone ?? ''}\n\n${input.text}`
    const sent = await sendMessage(groupId, text)
    if (sent.messageId) {
      await linkMessage({
        telegramChatId: groupId,
        telegramMessageId: sent.messageId,
        chatJid: input.chatJid,
        phone: input.phone,
      })
    }
  } catch (e) {
    console.error('[telegram-manager] notifyIncoming failed', e instanceof Error ? e.message : e)
  }
}

export async function notifyAiReply(input: {
  chatJid: string
  phone?: string
  text: string
}): Promise<void> {
  const groupId = groupChatId()
  if (!groupId) return
  try {
    const text = `🤖 Ответ AI (${input.phone ?? input.chatJid}):\n\n${input.text}`
    const sent = await sendMessage(groupId, text)
    if (sent.messageId) {
      await linkMessage({
        telegramChatId: groupId,
        telegramMessageId: sent.messageId,
        chatJid: input.chatJid,
        phone: input.phone,
      })
    }
  } catch (e) {
    console.error('[telegram-manager] notifyAiReply failed', e instanceof Error ? e.message : e)
  }
}
