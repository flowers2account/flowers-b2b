import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveConversation } from '@/lib/bot/conversation-store'
import { forwardWhatsAppAiOutgoingToAmo, forwardWhatsAppIncomingToAmo, forwardWhatsAppManualOutgoingToAmo } from '@/lib/amo-chat/service'
import { AmoChatApiError } from '@/lib/amo-chat/client'
import { findKnownOutgoingWithRetry } from '@/lib/amo-chat/outgoing-echo'
import { AmoApiError } from '@/lib/amo'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 16 * 1024
const OUTBOX_RESERVATION_STALE_MS = 10 * 60 * 1000

type EventType =
  | 'manual_outgoing'
  | 'set_ai_enabled'
  | 'get_dialog_state'
  | 'reserve_outgoing'
  | 'complete_outgoing'
  | 'fail_outgoing'
  | 'incoming_message'

interface RequestBody {
  type?: unknown
  chatJid?: unknown
  phone?: unknown
  conversationId?: unknown
  messageId?: unknown
  idempotencyKey?: unknown
  aiEnabled?: unknown
  takeoverReason?: unknown
  source?: unknown
  error?: unknown
  text?: unknown
  timestamp?: unknown
  contactName?: unknown
  traceId?: unknown
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const configuredSecret = process.env.WHATSAPP_GATEWAY_EVENT_API_KEY

  if (!configuredSecret) {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
  }

  const providedSecret = req.headers.get('x-api-key')
  if (!providedSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = parseBody(await readJsonBody(req))
    console.log('whatsapp_event_received', {
      type: body.type,
      source: body.source,
      chatJidPresent: Boolean(body.chatJid),
      messageIdPresent: Boolean(body.messageId),
    })
    const result = await handleEvent(body)

    console.log('whatsapp event handled', {
      durationMs: Date.now() - startedAt,
      type: body.type,
      source: body.source,
      conversationId: result.conversationId,
      chatJidPresent: Boolean(body.chatJid),
      idempotencyKeyPresent: Boolean(body.idempotencyKey),
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const isAmoError = error instanceof AmoChatApiError || error instanceof AmoApiError
    const status = error instanceof HttpError ? error.status : 500
    const responseStatus = isAmoError ? 502 : status
    const publicMessage = error instanceof HttpError ? error.publicMessage : 'internal error'
    const stage = error instanceof HttpError ? error.stage : error instanceof AmoChatApiError ? error.stage : 'whatsapp_event'

    console.error('whatsapp event failed', {
      durationMs: Date.now() - startedAt,
      status: responseStatus,
      stage,
      errorKind: error instanceof Error ? error.name : 'unknown',
      bodyKind: error instanceof AmoChatApiError ? error.bodyKind : undefined,
    })
    console.error('processing_failed', {
      stage,
      status: responseStatus,
      errorKind: error instanceof Error ? error.name : 'unknown',
    })

    return NextResponse.json({
      ok: false,
      stage,
      status: responseStatus,
      error: isAmoError ? 'amo_api_error' : publicMessage,
    }, { status: responseStatus })
  }
}

async function handleEvent(body: ParsedBody): Promise<Record<string, unknown>> {
  if (body.type === 'manual_outgoing') {
    if (body.messageId) {
      const knownOutgoing = await findKnownOutgoingWithRetry(() => findOutgoingByMessageId(body.messageId as string))
      console.log('dedupe_checked', {
        eventType: body.type,
        knownSystemOutgoing: Boolean(knownOutgoing),
        messageIdPresent: true,
      })
      if (knownOutgoing) {
        return {
          status: 'ignored',
          ignored: true,
          reason: 'known_system_outgoing',
          source: knownOutgoing.source,
          conversationId: knownOutgoing.conversation_id ?? undefined,
        }
      }
    }

    const conversation = await resolveConversationContext(body)
    if (conversation.id) {
      await updateConversationState(conversation.id, {
        ai_enabled: false,
        takeover_status: 'human',
        takeover_started_at: new Date().toISOString(),
        takeover_reason: body.takeoverReason ?? 'manual_outgoing',
        whatsapp_chat_jid: body.chatJid,
      })
    }

    const amoResult = body.chatJid && body.messageId && body.text
      ? await forwardWhatsAppManualOutgoingToAmo({
        chatJid: body.chatJid,
        phone: body.phone,
        conversationId: conversation.id,
        messageId: body.messageId,
        text: body.text,
        timestamp: body.timestamp,
        contactName: body.contactName,
        traceId: body.traceId,
      })
      : { status: 'skipped', reason: 'empty_or_unsupported_text' }

    return {
      status: 'ok',
      conversationId: conversation.id,
      aiEnabled: false,
      takeoverStatus: 'human',
      amoStatus: amoResult.status,
      amoReason: amoResult.reason,
    }
  }

  if (body.type === 'incoming_message') {
    if (!body.chatJid) throw new HttpError(400, 'chatJid is required')
    if (!body.messageId) throw new HttpError(400, 'messageId is required')
    if (!body.text) throw new HttpError(400, 'text is required')

    const result = await forwardWhatsAppIncomingToAmo({
      chatJid: body.chatJid,
      phone: body.phone,
      conversationId: body.conversationId,
      messageId: body.messageId,
      text: body.text,
      timestamp: body.timestamp,
      contactName: body.contactName,
      traceId: body.traceId,
    })

    return {
      status: result.status,
      conversationId: result.conversationId,
      reason: result.reason,
    }
  }

  if (body.type === 'set_ai_enabled') {
    if (typeof body.aiEnabled !== 'boolean') throw new HttpError(400, 'aiEnabled is required')
    const conversation = await resolveConversationContext(body)
    if (conversation.id) {
      await updateConversationState(conversation.id, {
        ai_enabled: body.aiEnabled,
        takeover_status: body.aiEnabled ? 'none' : 'human',
        takeover_started_at: body.aiEnabled ? null : new Date().toISOString(),
        takeover_reason: body.aiEnabled ? null : body.takeoverReason ?? 'manual_api',
        whatsapp_chat_jid: body.chatJid,
      })
    }
    return {
      status: 'ok',
      conversationId: conversation.id,
      aiEnabled: body.aiEnabled,
      takeoverStatus: body.aiEnabled ? 'none' : 'human',
    }
  }

  if (body.type === 'get_dialog_state') {
    const conversation = await resolveConversationContext(body)
    console.log('ai_mode_checked', {
      conversationId: conversation.id,
      aiEnabled: conversation.aiEnabled,
      takeoverStatus: conversation.takeoverStatus,
    })
    return {
      status: 'ok',
      conversationId: conversation.id,
      aiEnabled: conversation.aiEnabled,
      takeoverStatus: conversation.takeoverStatus,
      takeoverStartedAt: conversation.takeoverStartedAt,
      takeoverReason: conversation.takeoverReason,
    }
  }

  if (body.type === 'reserve_outgoing') {
    if (!body.idempotencyKey) throw new HttpError(400, 'idempotencyKey is required')
    const conversation = await resolveConversationContext(body)
    const reserved = await reserveOutgoing({
      idempotencyKey: body.idempotencyKey,
      conversationId: conversation.id,
      chatJid: body.chatJid,
      phone: body.phone,
      source: body.source,
    })
    return { ...reserved, conversationId: conversation.id }
  }

  if (body.type === 'complete_outgoing' || body.type === 'fail_outgoing') {
    if (!body.idempotencyKey) throw new HttpError(400, 'idempotencyKey is required')
    const row = await updateOutgoing(body.idempotencyKey, {
      status: body.type === 'complete_outgoing' ? 'sent' : 'failed',
      message_id: body.messageId ?? null,
      error: body.type === 'fail_outgoing' ? body.error ?? 'send failed' : null,
      updated_at: new Date().toISOString(),
    })
    if (body.type === 'complete_outgoing' && row?.source === 'ai') {
      console.log('ai_reply_whatsapp_sent', {
        conversationId: row.conversation_id ?? undefined,
        messageIdPresent: Boolean(row.message_id),
      })
      console.log('ai_reply_sent', {
        conversationId: row.conversation_id ?? undefined,
        messageIdPresent: Boolean(row.message_id),
      })

      const amoResult = body.messageId && body.text
        ? await forwardWhatsAppAiOutgoingToAmo({
          chatJid: body.chatJid,
          phone: body.phone,
          conversationId: row.conversation_id ?? body.conversationId,
          messageId: body.messageId,
          text: body.text,
          timestamp: body.timestamp,
          contactName: body.contactName,
          traceId: body.traceId,
        })
        : { status: 'skipped', reason: 'empty_or_unsupported_text' }

      return {
        status: row?.status ?? 'unknown',
        messageId: row?.message_id ?? undefined,
        amoStatus: amoResult.status,
        amoReason: amoResult.reason,
      }
    }
    return { status: row?.status ?? 'unknown', messageId: row?.message_id ?? undefined }
  }

  throw new HttpError(400, 'unsupported event type')
}

async function readJsonBody(req: NextRequest): Promise<RequestBody> {
  const raw = await req.text()
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload too large')
  }
  if (!raw.trim()) throw new HttpError(400, 'invalid request body', 'request_body_empty')
  try {
    return JSON.parse(raw) as RequestBody
  } catch {
    throw new HttpError(400, 'invalid request body', 'request_body_invalid_json')
  }
}

interface ParsedBody {
  type: EventType
  chatJid?: string
  phone?: string
  conversationId?: string
  messageId?: string
  idempotencyKey?: string
  aiEnabled?: boolean
  takeoverReason?: string
  source: 'gateway' | 'human' | 'ai'
  error?: string
  text?: string
  timestamp?: string
  contactName?: string
  traceId?: string
}

function parseBody(body: RequestBody): ParsedBody {
  const type = typeof body.type === 'string' ? body.type.trim() : ''
  if (!isEventType(type)) throw new HttpError(400, 'type is required')

  const chatJid = readOptionalString(body.chatJid)
  const phone = readOptionalString(body.phone)
  const conversationId = readOptionalString(body.conversationId)
  const messageId = readOptionalString(body.messageId)
  const idempotencyKey = readOptionalString(body.idempotencyKey)
  const takeoverReason = readOptionalString(body.takeoverReason)
  const error = readOptionalString(body.error)
  const text = readOptionalString(body.text)
  const timestamp = readOptionalString(body.timestamp)
  const contactName = readOptionalString(body.contactName)
  const traceId = readOptionalString(body.traceId)
  const source = parseSource(body.source)
  const aiEnabled = typeof body.aiEnabled === 'boolean' ? body.aiEnabled : undefined

  if (!chatJid && !phone && !conversationId && type !== 'complete_outgoing' && type !== 'fail_outgoing') {
    throw new HttpError(400, 'chatJid, phone or conversationId is required')
  }

  return {
    type,
    chatJid,
    phone,
    conversationId,
    messageId,
    idempotencyKey,
    aiEnabled,
    takeoverReason,
    source,
    error,
    text,
    timestamp,
    contactName,
    traceId,
  }
}

function isEventType(value: string): value is EventType {
  return [
    'manual_outgoing',
    'set_ai_enabled',
    'get_dialog_state',
    'reserve_outgoing',
    'complete_outgoing',
    'fail_outgoing',
    'incoming_message',
  ].includes(value)
}

function parseSource(value: unknown): 'gateway' | 'human' | 'ai' {
  if (value === 'human' || value === 'ai' || value === 'gateway') return value
  return 'gateway'
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function resolveConversationContext(opts: {
  conversationId?: string
  chatJid?: string
  phone?: string
}): Promise<{
  id?: string
  aiEnabled: boolean
  takeoverStatus: string
  takeoverStartedAt: string | null
  takeoverReason: string | null
}> {
  const admin = createAdminClient()

  if (opts.conversationId && isUuid(opts.conversationId)) {
    const byId = await readConversation('id', opts.conversationId)
    if (byId) return byId
  }

  if (opts.chatJid) {
    const byChat = await readConversation('whatsapp_chat_jid', opts.chatJid)
    if (byChat) return byChat
  }

  const anonId = opts.chatJid ? `whatsapp:${opts.chatJid}` : undefined
  const resolved = await resolveConversation({ anonId, phone: opts.phone ?? null })
  if (!resolved?.id) {
    return { aiEnabled: true, takeoverStatus: 'none', takeoverStartedAt: null, takeoverReason: null }
  }

  await admin
    .from('conversations')
    .update({ channel: 'whatsapp', whatsapp_chat_jid: opts.chatJid ?? null, updated_at: new Date().toISOString() })
    .eq('id', resolved.id)

  const reread = await readConversation('id', resolved.id)
  return reread ?? { id: resolved.id, aiEnabled: true, takeoverStatus: 'none', takeoverStartedAt: null, takeoverReason: null }
}

async function readConversation(
  column: 'id' | 'whatsapp_chat_jid',
  value: string,
): Promise<{
  id: string
  aiEnabled: boolean
  takeoverStatus: string
  takeoverStartedAt: string | null
  takeoverReason: string | null
} | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversations')
    .select('id, ai_enabled, takeover_status, takeover_started_at, takeover_reason')
    .eq(column, value)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return {
    id: data.id,
    aiEnabled: data.ai_enabled !== false,
    takeoverStatus: data.takeover_status ?? 'none',
    takeoverStartedAt: data.takeover_started_at ?? null,
    takeoverReason: data.takeover_reason ?? null,
  }
}

async function updateConversationState(conversationId: string, patch: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('conversations')
    .update({ ...patch, channel: 'whatsapp', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
}

async function reserveOutgoing(opts: {
  idempotencyKey: string
  conversationId?: string
  chatJid?: string
  phone?: string
  source: 'gateway' | 'human' | 'ai'
}): Promise<{ reserved: boolean; status: string; messageId?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('whatsapp_gateway_outbox')
    .insert({
      idempotency_key: opts.idempotencyKey,
      conversation_id: opts.conversationId ?? null,
      chat_jid: opts.chatJid ?? null,
      phone: opts.phone ?? null,
      source: opts.source,
      status: 'reserved',
    })
    .select('status, message_id')
    .single()

  if (!error && data) return { reserved: true, status: data.status ?? 'reserved', messageId: data.message_id ?? undefined }

  const { data: existing } = await admin
    .from('whatsapp_gateway_outbox')
    .select('status, message_id, updated_at')
    .eq('idempotency_key', opts.idempotencyKey)
    .maybeSingle()

  if (!existing) {
    return { reserved: false, status: 'unknown' }
  }

  const existingStatus = existing.status ?? 'reserved'
  const existingUpdatedAt = typeof existing.updated_at === 'string' ? Date.parse(existing.updated_at) : Number.NaN
  const isStaleReserved =
    existingStatus === 'reserved' &&
    Number.isFinite(existingUpdatedAt) &&
    Date.now() - existingUpdatedAt > OUTBOX_RESERVATION_STALE_MS

  if (existingStatus === 'failed') {
    const retried = await tryReReserveOutgoing(opts, 'failed')
    if (retried) return retried
  }

  if (isStaleReserved) {
    const staleBefore = new Date(Date.now() - OUTBOX_RESERVATION_STALE_MS).toISOString()
    const retried = await tryReReserveOutgoing(opts, 'reserved', staleBefore)
    if (retried) return retried
  }

  return {
    reserved: false,
    status: existingStatus,
    messageId: existing.message_id ?? undefined,
  }
}

async function tryReReserveOutgoing(
  opts: {
    idempotencyKey: string
    conversationId?: string
    chatJid?: string
    phone?: string
    source: 'gateway' | 'human' | 'ai'
  },
  expectedStatus: 'failed' | 'reserved',
  staleBefore?: string,
): Promise<{ reserved: boolean; status: string; messageId?: string } | null> {
  const admin = createAdminClient()
  let query = admin
    .from('whatsapp_gateway_outbox')
    .update({
      conversation_id: opts.conversationId ?? null,
      chat_jid: opts.chatJid ?? null,
      phone: opts.phone ?? null,
      source: opts.source,
      status: 'reserved',
      message_id: null,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('idempotency_key', opts.idempotencyKey)
    .eq('status', expectedStatus)

  if (staleBefore) {
    query = query.lt('updated_at', staleBefore)
  }

  const { data } = await query.select('status, message_id').maybeSingle()

  if (!data) return null
  return { reserved: true, status: data.status ?? 'reserved', messageId: data.message_id ?? undefined }
}

async function findOutgoingByMessageId(messageId: string): Promise<{ source: string; conversation_id?: string | null } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('whatsapp_gateway_outbox')
    .select('source, conversation_id')
    .eq('message_id', messageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

async function updateOutgoing(
  idempotencyKey: string,
  patch: Record<string, unknown>,
): Promise<{ status?: string; message_id?: string | null; source?: string; conversation_id?: string | null } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('whatsapp_gateway_outbox')
    .update(patch)
    .eq('idempotency_key', idempotencyKey)
    .select('status, message_id, source, conversation_id')
    .maybeSingle()
  return data ?? null
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
    readonly stage = 'whatsapp_event',
  ) {
    super(publicMessage)
  }
}
