import assert from 'node:assert/strict'
import {
  BUSINESS_FALLBACK_TEXT,
  CLASSIFICATION_TIMEOUT_TEXT,
  normalizeWhatsAppReply,
} from '../src/lib/bot/whatsapp-reply-normalizer.ts'

const timeoutReply = normalizeWhatsAppReply({
  text: null,
  meta: {
    intent: 'other',
    helped: false,
    classificationSource: 'fallback',
    classificationReason: 'ai_classification_timeout',
    classificationDurationMs: 10000,
  },
})

assert.equal(timeoutReply.reason, 'ai_classification_timeout')
assert.equal(timeoutReply.fallbackSource, 'accessories-bot')
assert.equal(timeoutReply.replyKind, 'ai_classification_timeout')
assert.equal(timeoutReply.text, CLASSIFICATION_TIMEOUT_TEXT)

const businessReply = normalizeWhatsAppReply({
  text: null,
  meta: {
    intent: 'other',
    helped: false,
    classificationSource: 'gemini',
    classificationDurationMs: 1200,
  },
})

assert.equal(businessReply.reason, 'ai_business_fallback')
assert.equal(businessReply.fallbackSource, 'accessories-bot')
assert.equal(businessReply.replyKind, 'ai_business_fallback')
assert.equal(businessReply.text, BUSINESS_FALLBACK_TEXT)

const accessoriesReply = normalizeWhatsAppReply({
  text: 'Есть несколько вариантов.',
  meta: {
    intent: 'accessories',
    helped: true,
    classificationSource: 'rules',
    classificationDurationMs: 4,
  },
})

assert.equal(accessoriesReply.reason, undefined)
assert.equal(accessoriesReply.fallbackSource, undefined)
assert.equal(accessoriesReply.replyKind, 'ai_text_response')
assert.equal(accessoriesReply.text, 'Есть несколько вариантов.')

console.log(JSON.stringify({ passed: 3 }))
