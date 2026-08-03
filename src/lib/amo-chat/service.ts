import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveConversation } from '@/lib/bot/conversation-store'
import {
  AMO_INQUIRY_PIPELINE_ID,
  AmoApiError,
  assertAmoContactExists,
  assertAmoLeadExists,
  ensureContactName,
  findContactByPhone,
  findLeadByPhoneInPipeline,
  inquiryConfigured,
  normalizePhoneAmo,
} from '@/lib/amo'
import { AmoChatApiError, AmoChatClient } from './client'
import { getAmoChatConfig } from './config'
import { readHttpResponse } from './http-response'
import { withSingleStaleLinkRecovery } from './recovery'
import {
  parseAmoChatWebhookMessage,
  type AmoChatWebhookMessage,
} from './webhook-parser'

export { parseAmoChatWebhookMessage }

const MAX_TEXT_LENGTH = 4000
const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:3025/messages/send'

export interface WhatsAppIncomingForAmo {
  chatJid: string
  phone?: string
  conversationId?: string
  messageId: string
  text: string
  timestamp?: string
  contactName?: string
  traceId?: string
}

export interface WhatsAppManualOutgoingForAmo {
  chatJid: string
  phone?: string
  conversationId?: string
  messageId: string
  text: string
  timestamp?: string
  contactName?: string
  traceId?: string
}

export interface WhatsAppAiOutgoingForAmo {
  chatJid?: string
  phone?: string
  conversationId?: string
  messageId: string
  text: string
  timestamp?: string
  contactName?: string
  traceId?: string
}

interface AmoChatLink {
  id: string
  conversation_id?: string | null
  phone?: string | null
  whatsapp_chat_jid?: string | null
  amo_scope_id?: string | null
  amo_chat_id?: string | null
  amo_conversation_id?: string | null
  amo_contact_id?: number | null
  amo_lead_id?: number | null
  last_amo_message_id?: string | null
  last_whatsapp_message_id?: string | null
}

export async function forwardWhatsAppIncomingToAmo(input: WhatsAppIncomingForAmo): Promise<{
  status: 'sent' | 'duplicate' | 'skipped'
  conversationId?: string
  reason?: string
}> {
  const config = getAmoChatConfig(false)
  if (!config?.scopeId) {
    return { status: 'skipped', reason: 'amo_chat_scope_missing' }
  }
  const scopeId = config.scopeId

  const text = input.text.trim()
  if (!text) return { status: 'skipped', reason: 'empty_text' }
  if (text.length > MAX_TEXT_LENGTH) return { status: 'skipped', reason: 'text_too_long' }

  logAmoStage('whatsapp_event_received', input.messageId, input.conversationId, {
    chatJidPresent: Boolean(input.chatJid),
    textLength: text.length,
  })

  const conversation = await resolveWhatsAppConversation(input)
  const conversationId = conversation.id
  logAmoStage('conversation_resolved', input.messageId, conversationId, {
    conversationPresent: Boolean(conversationId),
  })

  const phone = input.phone ?? conversation.phone ?? undefined
  const existingLink = await findAmoChatLink({
    whatsappChatJid: input.chatJid,
    phone,
  })

  const dedupeKey = `whatsapp:${input.messageId}`
  const reserved = await reserveDedupe('whatsapp', dedupeKey, conversationId, existingLink?.id)
  logAmoStage('dedupe_checked', input.messageId, conversationId, { reserved })
  if (!reserved) {
    logAmoStage('dedupe_hit', input.messageId, conversationId)
    return { status: 'duplicate', conversationId }
  }

  const externalConversationId = externalConversationIdFor(input.chatJid)
  const senderId = externalSenderIdFor(input.chatJid)
  const client = new AmoChatClient({ baseUrl: config.baseUrl, secretKey: config.secretKey })
  let activeLink = existingLink
  let amoMessageSent = false

  try {
    const delivery = await withSingleStaleLinkRecovery({
      attempt: async (retryCount) => {
        const link = await ensureAmoChatLink({
          conversationId,
          chatJid: input.chatJid,
          phone,
          scopeId,
          contactName: input.contactName,
        })
        activeLink = link
        logAmoStage('amo_link_resolved', input.messageId, conversationId, {
          linkPresent: Boolean(link.id),
          amoChatPresent: Boolean(link.amo_chat_id),
          amoConversationPresent: Boolean(link.amo_conversation_id),
          retryCount,
        })
        logAmoStage('amo_request_started', input.messageId, conversationId, {
          direction: 'incoming',
          receiverPresent: false,
          retryCount,
        })

        const result = await client.sendIncomingText({
          scopeId,
          conversationId: externalConversationId,
          messageId: externalMessageIdFor(input.messageId),
          senderId,
          senderName: input.contactName ?? input.phone ?? 'WhatsApp client',
          phone: normalizePhoneForAmo(phone),
          text,
          timestampMs: input.timestamp ? Date.parse(input.timestamp) || Date.now() : Date.now(),
          silent: false,
        })
        logAmoStage('amo_message_sent', input.messageId, conversationId, {
          amoMessagePresent: Boolean(result.amoMessageId),
          amoConversationPresent: Boolean(result.amoConversationId),
          retryCount,
        })
        return { link, result }
      },
      resetLink: async () => {
        if (!activeLink?.id) throw new Error('stale amo link has no persisted id')
        await resetAmoChatLink(activeLink.id)
      },
      onStage: (stage, retryCount) => {
        logAmoStage(stage, input.messageId, conversationId, { retryCount })
      },
    })

    const { link, result } = delivery.value
    amoMessageSent = true
    await updateAmoChatLink(link.id, {
      amo_conversation_id: result.amoConversationId ?? externalConversationId,
      last_whatsapp_message_id: input.messageId,
      last_amo_message_id: result.amoMessageId ?? null,
    })
    logAmoStage('message_persisted', input.messageId, conversationId, {
      linkUpdated: true,
      retryCount: delivery.retryCount,
    })
  } catch (error) {
    if (!amoMessageSent) {
      await releaseDedupe('whatsapp', dedupeKey)
    } else {
      logAmoStage('dedupe_preserved', input.messageId, conversationId, { reason: 'amo_message_already_sent' })
    }
    logAmoFailure('processing_failed', input.messageId, conversationId, error)
    throw error
  }

  return { status: 'sent', conversationId }
}

export async function forwardWhatsAppManualOutgoingToAmo(input: WhatsAppManualOutgoingForAmo): Promise<{
  status: 'sent' | 'duplicate' | 'skipped'
  conversationId?: string
  reason?: string
}> {
  const config = getAmoChatConfig(false)
  if (!config?.scopeId) {
    return { status: 'skipped', reason: 'amo_chat_scope_missing' }
  }

  const text = input.text.trim()
  if (!text) return { status: 'skipped', reason: 'empty_text' }
  if (text.length > MAX_TEXT_LENGTH) return { status: 'skipped', reason: 'text_too_long' }

  const conversation = await resolveWhatsAppConversation(input)
  const conversationId = conversation.id
  const link = await findAmoChatLink({
    whatsappChatJid: input.chatJid,
    phone: input.phone ?? conversation.phone ?? undefined,
  })

  if (!link?.id) {
    return { status: 'skipped', conversationId, reason: 'amo_chat_link_missing' }
  }

  if (!config.botId) {
    return { status: 'skipped', conversationId, reason: 'amo_chat_bot_id_missing' }
  }

  const dedupeKey = `whatsapp_manual:${input.messageId}`
  const reserved = await reserveDedupe('whatsapp_manual_outgoing', dedupeKey, conversationId, link.id)
  if (!reserved) return { status: 'duplicate', conversationId }

  const phone = normalizePhoneForAmo(input.phone ?? conversation.phone ?? link.phone ?? undefined)
  const client = new AmoChatClient({ baseUrl: config.baseUrl, secretKey: config.secretKey })
  logAmoStage('amo_request_started', input.messageId, conversationId, {
    direction: 'manual_outgoing',
    receiverPresent: true,
    senderRefPresent: true,
  })
  let result
  try {
    result = await client.sendOutgoingText({
      scopeId: config.scopeId,
      conversationId: externalConversationIdFor(input.chatJid),
      messageId: externalMessageIdFor(input.messageId),
      senderId: 'wa-manager',
      senderName: 'WhatsApp manager',
      senderRefId: config.botId,
      receiverId: externalSenderIdFor(input.chatJid),
      receiverName: input.contactName ?? input.phone ?? link.phone ?? 'WhatsApp client',
      phone,
      text,
      timestampMs: input.timestamp ? Date.parse(input.timestamp) || Date.now() : Date.now(),
      silent: true,
    })
  } catch (error) {
    await releaseDedupe('whatsapp_manual_outgoing', dedupeKey)
    logAmoFailure('amo_request_failed', input.messageId, conversationId, error)
    throw error
  }
  logAmoStage('amo_response_received', input.messageId, conversationId, {
    amoMessagePresent: Boolean(result.amoMessageId),
    amoConversationPresent: Boolean(result.amoConversationId),
  })

  await updateAmoChatLink(link.id, {
    amo_scope_id: config.scopeId,
    amo_conversation_id: result.amoConversationId ?? link.amo_conversation_id ?? null,
    last_whatsapp_message_id: input.messageId,
    last_amo_message_id: result.amoMessageId ?? null,
  })

  if (conversationId) {
    await createAdminClient().from('messages').insert({
      conversation_id: conversationId,
      role: 'manager',
      text,
      amojo_msg_id: result.amoMessageId ?? null,
      created_at: new Date(input.timestamp ? Date.parse(input.timestamp) || Date.now() : Date.now()).toISOString(),
    })
  }
  logAmoStage('message_persisted', input.messageId, conversationId, { localMessage: true })

  return { status: 'sent', conversationId }
}

export async function forwardWhatsAppAiOutgoingToAmo(input: WhatsAppAiOutgoingForAmo): Promise<{
  status: 'sent' | 'duplicate' | 'skipped' | 'failed'
  conversationId?: string
  reason?: string
  amoMessageId?: string
}> {
  const config = getAmoChatConfig(false)
  if (!config?.scopeId) {
    return { status: 'skipped', conversationId: input.conversationId, reason: 'amo_chat_scope_missing' }
  }
  if (!config.botId) {
    return { status: 'skipped', conversationId: input.conversationId, reason: 'amo_chat_bot_id_missing' }
  }

  const text = input.text.trim()
  if (!text) return { status: 'skipped', conversationId: input.conversationId, reason: 'empty_text' }
  if (text.length > MAX_TEXT_LENGTH) return { status: 'skipped', conversationId: input.conversationId, reason: 'text_too_long' }

  const conversation = input.chatJid
    ? await resolveWhatsAppConversation({
      chatJid: input.chatJid,
      phone: input.phone,
      conversationId: input.conversationId,
      messageId: input.messageId,
      text,
      timestamp: input.timestamp,
      contactName: input.contactName,
      traceId: input.traceId,
    })
    : { id: input.conversationId, phone: input.phone ?? null }
  const conversationId = conversation.id ?? input.conversationId

  let link = await findAmoChatLink({
    conversationId,
    whatsappChatJid: input.chatJid,
    phone: input.phone ?? conversation.phone ?? undefined,
  })
  if (!link?.id || !link.whatsapp_chat_jid) {
    logAmoStage('ai_reply_amo_sync_failed', input.messageId, conversationId, {
      reason: 'amo_chat_link_missing',
      linkPresent: Boolean(link?.id),
    })
    return { status: 'skipped', conversationId, reason: 'amo_chat_link_missing' }
  }

  const dedupeKey = `whatsapp_ai:${input.messageId}`
  const reserved = await reserveDedupe('whatsapp_ai_outgoing', dedupeKey, conversationId, link.id)
  logAmoStage('dedupe_checked', input.messageId, conversationId, {
    reserved,
    direction: 'ai_outgoing',
  })
  if (!reserved) return { status: 'duplicate', conversationId }

  const client = new AmoChatClient({ baseUrl: config.baseUrl, secretKey: config.secretKey })
  const timestampMs = input.timestamp ? Date.parse(input.timestamp) || Date.now() : Date.now()
  let amoMessageSent = false

  try {
    const delivery = await withSingleStaleLinkRecovery({
      attempt: async (retryCount) => {
        if (!link?.id || !link.whatsapp_chat_jid) throw new Error('amo chat link missing for AI outgoing sync')

        logAmoStage('ai_reply_amo_sync_started', input.messageId, conversationId, {
          amoConversationPresent: Boolean(link.amo_conversation_id),
          retryCount,
        })

        const phone = normalizePhoneForAmo(input.phone ?? conversation.phone ?? link.phone ?? undefined)
        const result = await client.sendOutgoingText({
          scopeId: config.scopeId as string,
          conversationId: externalConversationIdFor(link.whatsapp_chat_jid),
          messageId: externalMessageIdFor(input.messageId),
          senderId: 'wa-ai',
          senderName: 'WhatsApp AI',
          senderRefId: config.botId,
          receiverId: externalSenderIdFor(link.whatsapp_chat_jid),
          receiverName: input.contactName ?? input.phone ?? link.phone ?? 'WhatsApp client',
          phone,
          text,
          timestampMs,
          silent: true,
        })

        return { link, result }
      },
      resetLink: async () => {
        if (!link?.id) throw new Error('stale amo link has no persisted id')
        await resetAmoChatLink(link.id)
        if (!link.whatsapp_chat_jid) return
        link = await ensureAmoChatLink({
          conversationId,
          chatJid: link.whatsapp_chat_jid,
          phone: input.phone ?? conversation.phone ?? link.phone ?? undefined,
          scopeId: config.scopeId as string,
          contactName: input.contactName,
        })
      },
      onStage: (stage, retryCount) => {
        logAmoStage(stage, input.messageId, conversationId, { retryCount, direction: 'ai_outgoing' })
      },
    })

    amoMessageSent = true
    const { link: deliveredLink, result } = delivery.value
    await updateAmoChatLink(deliveredLink.id, {
      amo_scope_id: config.scopeId,
      amo_conversation_id: result.amoConversationId ?? deliveredLink.amo_conversation_id ?? null,
      last_whatsapp_message_id: input.messageId,
      last_amo_message_id: result.amoMessageId ?? null,
    })

    if (conversationId && result.amoMessageId) {
      await updateLatestBotMessageAmoId(conversationId, result.amoMessageId)
    }

    logAmoStage('ai_reply_amo_sync_success', input.messageId, conversationId, {
      amoMessagePresent: Boolean(result.amoMessageId),
      retryCount: delivery.retryCount,
    })

    return { status: 'sent', conversationId, amoMessageId: result.amoMessageId }
  } catch (error) {
    if (!amoMessageSent) {
      await releaseDedupe('whatsapp_ai_outgoing', dedupeKey)
    }
    logAmoFailure('ai_reply_amo_sync_failed', input.messageId, conversationId, error)
    return { status: 'failed', conversationId, reason: 'amo_ai_reply_sync_failed' }
  }
}

export async function handleAmoManagerWebhook(input: AmoChatWebhookMessage): Promise<{
  status: 'sent' | 'duplicate' | 'ignored'
  conversationId?: string
  reason?: string
}> {
  const text = input.text.trim()
  if (!text) return { status: 'ignored', reason: 'empty_text' }
  if (text.length > MAX_TEXT_LENGTH) return { status: 'ignored', reason: 'text_too_long' }

  let link = await findAmoChatLink({
    amoChatId: input.amoChatId,
    amoConversationId: input.amoConversationId,
    phone: input.receiverPhone,
  })
  if (!link && input.amoConversationClientId && input.amoConversationClientId !== input.amoConversationId) {
    link = await findAmoChatLink({
      amoConversationId: input.amoConversationClientId,
      phone: input.receiverPhone,
    })
  }
  if (!link?.whatsapp_chat_jid && !link?.phone && !input.receiverPhone) {
    return { status: 'ignored', reason: 'whatsapp_target_missing' }
  }

  if (await isKnownAmoAiEcho(input.amoMessageId, link)) {
    logAmoStage('ai_reply_amo_echo_skipped', input.amoMessageId, link?.conversation_id ?? undefined, {
      amoMessagePresent: true,
    })
    return { status: 'ignored', conversationId: link?.conversation_id ?? undefined, reason: 'ai_reply_echo' }
  }

  const dedupeKey = `amo:${input.amoMessageId}`
  const reserved = await reserveDedupe('amo', dedupeKey, link?.conversation_id ?? undefined, link?.id)
  if (!reserved) return { status: 'duplicate', conversationId: link?.conversation_id ?? undefined }

  const conversationId = await ensureConversationForAmoWebhook({
    link,
    phone: input.receiverPhone,
    amoChatId: input.amoChatId,
    amoConversationId: input.amoConversationId,
    amoScopeId: input.amoScopeId,
  })

  if (conversationId) {
    await createAdminClient().from('conversations').update({
      ai_enabled: false,
      takeover_status: 'human',
      takeover_started_at: new Date().toISOString(),
      takeover_reason: 'amo_manager_message',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    await createAdminClient().from('messages').insert({
      conversation_id: conversationId,
      role: 'manager',
      text,
      amojo_msg_id: input.amoMessageId,
      created_at: new Date(input.timestampMs).toISOString(),
    })
  }

  const sendResult = await sendViaGateway({
    chatJid: link?.whatsapp_chat_jid ?? undefined,
    phone: link?.phone ?? input.receiverPhone,
    text,
    idempotencyKey: `amo:${input.amoMessageId}`,
  })

  if (link?.id) {
    await updateAmoChatLink(link.id, {
      amo_scope_id: input.amoScopeId,
      amo_chat_id: input.amoChatId ?? null,
      amo_conversation_id: input.amoConversationId ?? null,
      last_amo_message_id: input.amoMessageId,
      last_whatsapp_message_id: sendResult.messageId ?? null,
    })
  }

  return { status: 'sent', conversationId }
}

async function resolveWhatsAppConversation(input: WhatsAppIncomingForAmo): Promise<{
  id?: string
  phone?: string | null
}> {
  const admin = createAdminClient()

  if (input.conversationId && isUuid(input.conversationId)) {
    const { data } = await admin
      .from('conversations')
      .select('id, phone')
      .eq('id', input.conversationId)
      .maybeSingle()
    if (data?.id) return { id: data.id, phone: data.phone ?? null }
  }

  const { data: byChat } = await admin
    .from('conversations')
    .select('id, phone')
    .eq('whatsapp_chat_jid', input.chatJid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (byChat?.id) return { id: byChat.id, phone: byChat.phone ?? null }

  const resolved = await resolveConversation({
    anonId: `whatsapp:${input.chatJid}`,
    phone: input.phone ?? null,
  })

  if (resolved?.id) {
    await admin.from('conversations').update({
      channel: 'whatsapp',
      whatsapp_chat_jid: input.chatJid,
      updated_at: new Date().toISOString(),
    }).eq('id', resolved.id)
  }

  return { id: resolved?.id, phone: resolved?.phone ?? null }
}

async function ensureAmoChatLink(input: {
  conversationId?: string
  chatJid: string
  phone?: string
  scopeId: string
  contactName?: string
}): Promise<AmoChatLink> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('amo_chat_links')
    .select('*')
    .eq('whatsapp_chat_jid', input.chatJid)
    .maybeSingle()

  const phone = phoneCandidate(input.phone ?? existing?.phone ?? undefined)
  const amoIds = await ensureAmoContactAndLead({
    conversationId: input.conversationId,
    phone,
    contactName: input.contactName,
    existingContactId: existing?.amo_contact_id ?? null,
    existingLeadId: existing?.amo_lead_id ?? null,
  })

  const patch = {
    conversation_id: input.conversationId ?? existing?.conversation_id ?? null,
    phone: phone ?? existing?.phone ?? null,
    whatsapp_chat_jid: input.chatJid,
    amo_scope_id: input.scopeId,
    amo_conversation_id: existing?.amo_conversation_id ?? null,
    amo_contact_id: amoIds.contactId ?? existing?.amo_contact_id ?? null,
    amo_lead_id: amoIds.leadId ?? existing?.amo_lead_id ?? null,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data } = await admin.from('amo_chat_links').update(patch).eq('id', existing.id).select('*').single()
    return data ?? { ...existing, ...patch }
  }

  const { data } = await admin.from('amo_chat_links').insert(patch).select('*').single()
  return (data as AmoChatLink | null) ?? { id: '', ...patch }
}

async function ensureAmoContactAndLead(input: {
  conversationId?: string
  phone?: string
  contactName?: string
  existingContactId?: number | null
  existingLeadId?: number | null
}): Promise<{ contactId?: number | null; leadId?: number | null }> {
  if (!input.phone) return { contactId: input.existingContactId, leadId: input.existingLeadId }

  if (input.existingContactId) await assertAmoContactExists(input.existingContactId)
  if (input.existingLeadId) await assertAmoLeadExists(input.existingLeadId)

  const phones = normalizePhoneAmo(input.phone)
  const existingLead = input.existingLeadId || !inquiryConfigured()
    ? null
    : await findLeadByPhoneInPipeline(phones, AMO_INQUIRY_PIPELINE_ID)
  const contactId = input.existingContactId ?? existingLead?.contactId ?? await findContactByPhone(phones)

  if (contactId && input.contactName) {
    await ensureContactName(contactId, input.contactName)
  }

  const leadId = input.existingLeadId ?? existingLead?.leadId ?? null

  if (input.conversationId) {
    await createAdminClient().from('conversations').update({
      amo_entity_type: leadId ? 'leads' : 'contacts',
      amo_entity_id: leadId ?? contactId ?? null,
      amo_pipeline_id: leadId ? AMO_INQUIRY_PIPELINE_ID : null,
      updated_at: new Date().toISOString(),
    }).eq('id', input.conversationId)
  }

  return { contactId, leadId }
}

async function findAmoChatLink(input: {
  amoChatId?: string
  amoConversationId?: string
  conversationId?: string
  whatsappChatJid?: string
  phone?: string
}): Promise<AmoChatLink | null> {
  const admin = createAdminClient()
  const filters: string[] = []
  if (input.amoChatId) filters.push(`amo_chat_id.eq.${input.amoChatId}`)
  if (input.amoConversationId) filters.push(`amo_conversation_id.eq.${input.amoConversationId}`)
  if (input.conversationId) filters.push(`conversation_id.eq.${input.conversationId}`)
  if (input.whatsappChatJid) filters.push(`whatsapp_chat_jid.eq.${input.whatsappChatJid}`)
  if (input.phone) filters.push(`phone.eq.${input.phone}`)
  if (!filters.length) return null

  const { data } = await admin
    .from('amo_chat_links')
    .select('*')
    .or(filters.join(','))
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as AmoChatLink | null) ?? null
}

async function ensureConversationForAmoWebhook(input: {
  link: AmoChatLink | null
  phone?: string
  amoScopeId: string
  amoChatId?: string
  amoConversationId?: string
}): Promise<string | undefined> {
  if (input.link?.conversation_id) return input.link.conversation_id

  const resolved = await resolveConversation({
    anonId: input.amoConversationId ? `amo:${input.amoConversationId}` : undefined,
    phone: input.phone ?? null,
  })
  if (!resolved?.id) return undefined

  const admin = createAdminClient()
  const linkPatch = {
    conversation_id: resolved.id,
    phone: input.phone ?? input.link?.phone ?? null,
    amo_scope_id: input.amoScopeId,
    amo_chat_id: input.amoChatId ?? input.link?.amo_chat_id ?? null,
    amo_conversation_id: input.amoConversationId ?? input.link?.amo_conversation_id ?? null,
    updated_at: new Date().toISOString(),
  }

  if (input.link?.id) {
    await admin.from('amo_chat_links').update(linkPatch).eq('id', input.link.id)
  } else {
    await admin.from('amo_chat_links').insert(linkPatch)
  }

  return resolved.id
}

async function reserveDedupe(
  source: 'amo' | 'whatsapp' | 'whatsapp_manual_outgoing' | 'whatsapp_ai_outgoing',
  messageKey: string,
  conversationId?: string,
  linkId?: string,
): Promise<boolean> {
  const { error } = await createAdminClient().from('amo_chat_message_dedupe').insert({
    source,
    message_key: messageKey,
    conversation_id: conversationId ?? null,
    amo_chat_link_id: linkId ?? null,
  })

  if (!error) return true
  if (error.code === '23505') return false
  throw error
}

async function releaseDedupe(
  source: 'amo' | 'whatsapp' | 'whatsapp_manual_outgoing' | 'whatsapp_ai_outgoing',
  messageKey: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('amo_chat_message_dedupe')
    .delete()
    .eq('source', source)
    .eq('message_key', messageKey)
  if (error) throw error
}

async function resetAmoChatLink(id: string): Promise<void> {
  const { data, error } = await createAdminClient()
    .from('amo_chat_links')
    .update({
      amo_chat_id: null,
      amo_conversation_id: null,
      amo_contact_id: null,
      amo_lead_id: null,
      last_amo_message_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')
    .single()
  if (error || data?.id !== id) throw error ?? new Error('amo link reset did not update one row')
}

async function updateAmoChatLink(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await createAdminClient().from('amo_chat_links').update({
    ...patch,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

async function updateLatestBotMessageAmoId(conversationId: string, amoMessageId: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('role', 'bot')
    .is('amojo_msg_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.id) return
  await admin.from('messages').update({ amojo_msg_id: amoMessageId }).eq('id', data.id)
}

async function isKnownAmoAiEcho(amoMessageId: string, link: AmoChatLink | null): Promise<boolean> {
  if (link?.last_amo_message_id === amoMessageId) return true

  const { data } = await createAdminClient()
    .from('messages')
    .select('id')
    .eq('amojo_msg_id', amoMessageId)
    .eq('role', 'bot')
    .limit(1)
    .maybeSingle()

  return Boolean(data?.id)
}

async function sendViaGateway(input: {
  chatJid?: string
  phone?: string
  text: string
  idempotencyKey: string
}): Promise<{ messageId?: string }> {
  const url = process.env.WHATSAPP_GATEWAY_SEND_URL ?? DEFAULT_GATEWAY_URL
  const apiKey = process.env.WHATSAPP_GATEWAY_SEND_API_KEY ?? process.env.WHATSAPP_GATEWAY_AI_API_KEY
  if (!apiKey) throw new Error('WHATSAPP_GATEWAY_SEND_API_KEY is not configured')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      chatJid: input.chatJid,
      phone: input.phone,
      text: input.text,
      idempotency_key: input.idempotencyKey,
      source: 'human',
    }),
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => '')
    throw new Error(`whatsapp gateway ${response.status}: ${responseText.slice(0, 200)}`)
  }

  const parsed = await readHttpResponse<{ messageId?: unknown }>(response)
  return { messageId: readString(parsed.data?.messageId) }
}

function logAmoStage(stage: string, messageId?: string, conversationId?: string, details?: Record<string, unknown>): void {
  console.log(stage, {
    stage,
    messageId: shortDiagnosticId(messageId),
    conversationId: shortDiagnosticId(conversationId),
    ...details,
  })
}

function logAmoFailure(stage: string, messageId: string | undefined, conversationId: string | undefined, error: unknown): void {
  console.error('amo_request_failed', {
    stage,
    messageId: shortDiagnosticId(messageId),
    conversationId: shortDiagnosticId(conversationId),
    status: error instanceof AmoChatApiError || error instanceof AmoApiError ? error.status : undefined,
    bodyKind: error instanceof AmoChatApiError ? error.bodyKind : undefined,
    errorKind: error instanceof Error ? error.name : 'unknown',
  })
}

function shortDiagnosticId(value?: string): string | undefined {
  if (!value) return undefined
  return value.length <= 16 ? value : `${value.slice(0, 6)}...${value.slice(-6)}`
}

function externalConversationIdFor(chatJid: string): string {
  return `wa-${sha1(chatJid).slice(0, 32)}`
}

function externalSenderIdFor(chatJid: string): string {
  return `wa-user-${sha1(chatJid).slice(0, 24)}`
}

function externalMessageIdFor(messageId: string): string {
  return `wa-msg-${sha1(messageId).slice(0, 32)}`
}

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function normalizePhoneForAmo(phone?: string | null): string | undefined {
  if (!phone) return undefined
  const candidate = phoneCandidate(phone)
  return candidate ? normalizePhoneAmo(candidate)[0] : undefined
}

function phoneCandidate(value?: string | null): string | undefined {
  if (!value || value.includes('@')) return undefined
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15 ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
