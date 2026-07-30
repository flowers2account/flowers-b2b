import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveConversation } from '@/lib/bot/conversation-store'
import {
  AMO_INQUIRY_PIPELINE_ID,
  AMO_INQUIRY_STATUS_NEW,
  createContact,
  createLead,
  ensureContactName,
  findContactByPhone,
  findLeadByPhoneInPipeline,
  inquiryConfigured,
  normalizePhoneAmo,
} from '@/lib/amo'
import { AmoChatClient } from './client'
import { getAmoChatConfig } from './config'
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

  const text = input.text.trim()
  if (!text) return { status: 'skipped', reason: 'empty_text' }
  if (text.length > MAX_TEXT_LENGTH) return { status: 'skipped', reason: 'text_too_long' }

  const conversation = await resolveWhatsAppConversation(input)
  const conversationId = conversation.id
  const link = await ensureAmoChatLink({
    conversationId,
    chatJid: input.chatJid,
    phone: input.phone ?? conversation.phone ?? undefined,
    scopeId: config.scopeId,
    contactName: input.contactName,
  })

  const dedupeKey = `whatsapp:${input.messageId}`
  const reserved = await reserveDedupe(dedupeKey, conversationId, link.id)
  if (!reserved) return { status: 'duplicate', conversationId }

  const externalConversationId = link.amo_conversation_id ?? externalConversationIdFor(input.chatJid)
  const senderId = externalSenderIdFor(input.chatJid)
  const client = new AmoChatClient({ baseUrl: config.baseUrl, secretKey: config.secretKey })
  const result = await client.sendIncomingText({
    scopeId: config.scopeId,
    conversationId: externalConversationId,
    messageId: externalMessageIdFor(input.messageId),
    senderId,
    senderName: input.contactName ?? input.phone ?? 'WhatsApp client',
    phone: normalizePhoneForAmo(input.phone ?? conversation.phone ?? undefined),
    text,
    timestampMs: input.timestamp ? Date.parse(input.timestamp) || Date.now() : Date.now(),
    silent: false,
  })

  await updateAmoChatLink(link.id, {
    amo_conversation_id: result.amoConversationId ?? externalConversationId,
    last_whatsapp_message_id: input.messageId,
    last_amo_message_id: result.amoMessageId ?? null,
  })

  return { status: 'sent', conversationId }
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

  const dedupeKey = `amo:${input.amoMessageId}`
  const reserved = await reserveDedupe(dedupeKey, link?.conversation_id ?? undefined, link?.id)
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

  const amoIds = await ensureAmoContactAndLead({
    conversationId: input.conversationId,
    phone: input.phone,
    contactName: input.contactName,
    existingContactId: existing?.amo_contact_id ?? null,
    existingLeadId: existing?.amo_lead_id ?? null,
  })

  const patch = {
    conversation_id: input.conversationId ?? existing?.conversation_id ?? null,
    phone: input.phone ?? existing?.phone ?? null,
    whatsapp_chat_jid: input.chatJid,
    amo_scope_id: input.scopeId,
    amo_conversation_id: existing?.amo_conversation_id ?? externalConversationIdFor(input.chatJid),
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

  const phones = normalizePhoneAmo(input.phone)
  let contactId = input.existingContactId ?? await findContactByPhone(phones)
  if (!contactId) {
    contactId = await createContact({
      name: input.contactName ?? input.phone,
      phone: phones[0],
    })
  } else if (input.contactName) {
    await ensureContactName(contactId, input.contactName)
  }

  let leadId = input.existingLeadId ?? null
  if (!leadId && inquiryConfigured()) {
    const existingLead = await findLeadByPhoneInPipeline(phones, AMO_INQUIRY_PIPELINE_ID)
    leadId = existingLead?.leadId ?? null
    if (!leadId) {
      leadId = await createLead({
        name: `WhatsApp chat ${phones[0]}`,
        price: 0,
        contactId,
        pipelineId: AMO_INQUIRY_PIPELINE_ID,
        statusId: AMO_INQUIRY_STATUS_NEW,
        tags: ['WhatsApp', 'AI assistant'],
      })
    }
  }

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
  phone?: string
}): Promise<AmoChatLink | null> {
  const admin = createAdminClient()
  const filters: string[] = []
  if (input.amoChatId) filters.push(`amo_chat_id.eq.${input.amoChatId}`)
  if (input.amoConversationId) filters.push(`amo_conversation_id.eq.${input.amoConversationId}`)
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

async function reserveDedupe(messageKey: string, conversationId?: string, linkId?: string): Promise<boolean> {
  const { error } = await createAdminClient().from('amo_chat_message_dedupe').insert({
    source: messageKey.startsWith('amo:') ? 'amo' : 'whatsapp',
    message_key: messageKey,
    conversation_id: conversationId ?? null,
    amo_chat_link_id: linkId ?? null,
  })

  return !error
}

async function updateAmoChatLink(id: string, patch: Record<string, unknown>): Promise<void> {
  await createAdminClient().from('amo_chat_links').update({
    ...patch,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
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

  const data = await response.json().catch(() => null) as { messageId?: unknown } | null
  return { messageId: readString(data?.messageId) }
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
  return normalizePhoneAmo(phone)[0]
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
