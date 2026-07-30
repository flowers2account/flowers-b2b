export interface AmoChatWebhookMessage {
  amoScopeId: string
  amoChatId?: string
  amoConversationId?: string
  amoConversationClientId?: string
  amoMessageId: string
  receiverPhone?: string
  text: string
  timestampMs: number
}

export function parseAmoChatWebhookMessage(scopeId: string, body: unknown): AmoChatWebhookMessage | null {
  const root = readObject(body)
  const message = readObject(root?.message)
  const payloadMessage = readObject(message?.message)
  const type = typeof payloadMessage?.type === 'string' ? payloadMessage.type : ''
  const text = typeof payloadMessage?.text === 'string' ? payloadMessage.text.trim() : ''
  const id = typeof payloadMessage?.id === 'string' ? payloadMessage.id : ''

  if (type !== 'text' || !text || !id) return null

  const conversation = readObject(message?.conversation)
  const conversationId = readString(conversation?.id)
  const conversationClientId = readString(conversation?.client_id)
  const msecTimestamp = Number(message?.msec_timestamp)
  const timestamp = Number(message?.timestamp)
  const timestampMs = Number.isFinite(msecTimestamp) && msecTimestamp > 0
    ? Math.trunc(msecTimestamp)
    : Number.isFinite(timestamp) && timestamp > 0
      ? Math.trunc(timestamp * 1000)
      : Date.now()

  return {
    amoScopeId: scopeId,
    amoChatId: conversationId,
    amoConversationId: conversationId ?? conversationClientId,
    amoConversationClientId: conversationClientId,
    amoMessageId: id,
    receiverPhone: normalizeDigits(readString(readObject(message?.receiver)?.phone)),
    text,
    timestampMs,
  }
}

function normalizeDigits(phone?: string): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, '')
  return digits || undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}
