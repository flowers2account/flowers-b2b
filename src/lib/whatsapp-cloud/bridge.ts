// Мост Cloud API → существующий whatsapp-event/whatsapp-reply pipeline.
//
// Зеркалит контракт полей и порядок HTTP-вызовов MainProjectClient
// (whatsapp-gateway/src/main-project-client.ts) и AiMessageHandler
// (whatsapp-gateway/src/handlers/ai-message-handler.ts) — САМ pipeline
// (whatsapp-event/route.ts, whatsapp-reply/route.ts, amo-chat/service.ts,
// bot/accessories-bot.ts) этот файл не меняет и не импортирует напрямую:
// вызывает его теми же HTTP-запросами, что и Baileys-шлюз, с теми же секретами.

function internalBaseUrl(): string {
  // Тот же паттерн локального loopback, что DEFAULT_GATEWAY_URL в amo-chat/service.ts —
  // свой же процесс на VPS (pm2), не публичный домен/nginx.
  return process.env.WHATSAPP_CLOUD_INTERNAL_BASE_URL?.trim() || `http://127.0.0.1:${process.env.PORT || 3000}`
}

async function postEvent(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const secret = process.env.WHATSAPP_GATEWAY_EVENT_API_KEY
  if (!secret) {
    console.warn('[whatsapp-cloud bridge] WHATSAPP_GATEWAY_EVENT_API_KEY не задан')
    return null
  }

  try {
    const res = await fetch(`${internalBaseUrl()}/api/internal/ai/whatsapp-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': secret },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      console.warn('[whatsapp-cloud bridge] whatsapp-event failed', { status: res.status, type: payload.type })
      return null
    }

    const text = await res.text()
    if (!text.trim()) return null
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return null
    }
  } catch (error) {
    console.warn('[whatsapp-cloud bridge] whatsapp-event request failed', {
      type: payload.type,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export interface DialogState {
  conversationId?: string
  aiEnabled: boolean
  takeoverStatus: string
}

export async function getDialogState(input: {
  chatJid: string
  phone?: string
  traceId?: string
}): Promise<DialogState | null> {
  const data = await postEvent({
    type: 'get_dialog_state',
    chatJid: input.chatJid,
    phone: input.phone,
    source: 'gateway',
  })
  if (!data) return null

  return {
    conversationId: readString(data.conversationId),
    aiEnabled: data.aiEnabled !== false,
    takeoverStatus: readString(data.takeoverStatus) ?? 'none',
  }
}

export async function recordIncomingMessage(input: {
  chatJid: string
  phone?: string
  conversationId?: string
  messageId: string
  text: string
  timestamp: string
  contactName?: string
  traceId?: string
}): Promise<void> {
  await postEvent({
    type: 'incoming_message',
    chatJid: input.chatJid,
    phone: input.phone,
    conversationId: input.conversationId,
    messageId: input.messageId,
    text: input.text,
    timestamp: input.timestamp,
    contactName: input.contactName,
    traceId: input.traceId,
    source: 'human',
  })
}

export interface AiReply {
  text: string
  conversationId?: string
}

export async function requestAiReply(input: {
  text: string
  chatJid: string
  traceId?: string
  phone?: string
  conversationId?: string
  contactName?: string
}): Promise<AiReply> {
  const secret = process.env.WHATSAPP_GATEWAY_AI_API_KEY
  if (!secret) throw new Error('WHATSAPP_GATEWAY_AI_API_KEY не задан')

  const res = await fetch(`${internalBaseUrl()}/api/internal/ai/whatsapp-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': secret },
    body: JSON.stringify({
      text: input.text,
      chatJid: input.chatJid,
      traceId: input.traceId,
      phone: input.phone,
      conversationId: input.conversationId,
      contactName: input.contactName,
    }),
  })

  const bodyText = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`whatsapp-reply ${res.status}: ${bodyText.slice(0, 300)}`)
  }

  let parsed: { text?: unknown; conversationId?: unknown } = {}
  try {
    parsed = bodyText ? JSON.parse(bodyText) : {}
  } catch {
    throw new Error('whatsapp-reply: invalid json response')
  }

  return {
    text: readString(parsed.text) ?? '',
    conversationId: readString(parsed.conversationId),
  }
}

// Зеркало recordSentOutgoing() из main-project-client.ts: reserve_outgoing → complete_outgoing.
// complete_outgoing с source='ai' — это и есть точка, где whatsapp-event дёргает
// forwardWhatsAppAiOutgoingToAmo() и синкает ответ бота обратно в amoCRM-чат.
export async function recordSentOutgoing(input: {
  chatJid: string
  phone?: string
  messageId: string
  text: string
  traceId?: string
}): Promise<void> {
  const idempotencyKey = `message:${input.messageId}`

  await postEvent({
    type: 'reserve_outgoing',
    idempotencyKey,
    chatJid: input.chatJid,
    phone: input.phone,
    source: 'ai',
  })

  await postEvent({
    type: 'complete_outgoing',
    idempotencyKey,
    messageId: input.messageId,
    text: input.text,
    chatJid: input.chatJid,
    phone: input.phone,
    traceId: input.traceId,
  })
}

// Ручной ответ менеджера (источник — Telegram-группа, см. src/app/api/telegram/manager/
// route.ts), а не AI. type:'manual_outgoing' на whatsapp-event сам проставляет
// ai_enabled=false/takeover_status='human' (если ещё не активен) и синкает текст в
// amoCRM через forwardWhatsAppManualOutgoingToAmo — тем же путём, что и обычный ручной
// ответ. postEvent не бросает исключений (см. выше) — вызывающая сторона это не блокирует.
export async function recordManualOutgoing(input: {
  chatJid: string
  phone?: string
  messageId: string
  text: string
  traceId?: string
  takeoverReason?: string
}): Promise<void> {
  await postEvent({
    type: 'manual_outgoing',
    chatJid: input.chatJid,
    phone: input.phone,
    messageId: input.messageId,
    text: input.text,
    traceId: input.traceId,
    takeoverReason: input.takeoverReason,
    source: 'human',
  })
}

// Возврат AI командой /ai (/ии) из Telegram-группы (см. src/app/api/telegram/manager/
// route.ts). type:'set_ai_enabled' на whatsapp-event — уже существующий эндпоинт
// (использует его и остальной pipeline), просто раньше не был обёрнут в bridge.ts.
export async function setAiEnabled(input: {
  chatJid: string
  phone?: string
  aiEnabled: boolean
  traceId?: string
}): Promise<void> {
  await postEvent({
    type: 'set_ai_enabled',
    chatJid: input.chatJid,
    phone: input.phone,
    aiEnabled: input.aiEnabled,
    traceId: input.traceId,
    source: 'human',
  })
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
