export type WhatsAppReplyReason =
  | 'ai_null_response'
  | 'ai_business_fallback'
  | 'ai_classification_timeout'

export interface WhatsAppReplyMeta {
  intent?: 'smalltalk' | 'accessories' | 'pot' | 'site_help' | 'other'
  helped?: boolean
  classificationSource?: 'rules' | 'gemini' | 'fallback'
  classificationReason?: 'ai_classification_timeout'
  classificationDurationMs?: number
}

export interface WhatsAppBotReplyLike {
  text: string | null
  meta?: WhatsAppReplyMeta
}

export interface NormalizedWhatsAppReply {
  text: string
  reason?: WhatsAppReplyReason
  fallbackSource?: 'endpoint' | 'accessories-bot'
  replyKind: 'ai_text_response' | WhatsAppReplyReason
}

export const TECHNICAL_FALLBACK_TEXT = 'Не удалось обработать сообщение. Диалог передан менеджеру.'
export const BUSINESS_FALLBACK_TEXT = 'Диалог передан менеджеру.'
export const CLASSIFICATION_TIMEOUT_TEXT = 'Ответ занимает больше времени, чем обычно. Диалог передан менеджеру.'

export function normalizeWhatsAppReply(reply: WhatsAppBotReplyLike): NormalizedWhatsAppReply {
  const normalized = reply.text?.trim()
  if (normalized) return { text: normalized, replyKind: 'ai_text_response' }

  if (reply.meta?.classificationReason === 'ai_classification_timeout') {
    return {
      text: CLASSIFICATION_TIMEOUT_TEXT,
      reason: 'ai_classification_timeout',
      fallbackSource: 'accessories-bot',
      replyKind: 'ai_classification_timeout',
    }
  }

  if (reply.meta?.helped === false) {
    return {
      text: BUSINESS_FALLBACK_TEXT,
      reason: 'ai_business_fallback',
      fallbackSource: 'accessories-bot',
      replyKind: 'ai_business_fallback',
    }
  }

  return {
    text: TECHNICAL_FALLBACK_TEXT,
    reason: 'ai_null_response',
    fallbackSource: 'accessories-bot',
    replyKind: 'ai_null_response',
  }
}

export function businessFallbackReason(reply: WhatsAppBotReplyLike): string | undefined {
  if (reply.text?.trim()) return undefined
  if (reply.meta?.classificationReason === 'ai_classification_timeout') return 'classification_timeout'
  if (reply.meta?.intent === 'other') return 'intent_other_whatsapp_null_text'
  if (reply.meta?.helped === false) return 'agent_not_helped_null_text'
  return undefined
}
