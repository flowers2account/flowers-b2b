import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const service = await readFile('src/lib/amo-chat/service.ts', 'utf8')
const eventRoute = await readFile('src/app/api/internal/ai/whatsapp-event/route.ts', 'utf8')
const gateway = await readFile('whatsapp-gateway/src/whatsapp-client.ts', 'utf8')
const mainProjectClient = await readFile('whatsapp-gateway/src/main-project-client.ts', 'utf8')
const amoClient = await readFile('src/lib/amo-chat/client.ts', 'utf8')
const config = await readFile('src/lib/amo-chat/config.ts', 'utf8')
const recovery = await readFile('src/lib/amo-chat/recovery.ts', 'utf8')
const outgoingEcho = await readFile('src/lib/amo-chat/outgoing-echo.ts', 'utf8')
const aiReplyRoute = await readFile('src/app/api/internal/ai/whatsapp-reply/route.ts', 'utf8')

assert.match(
  service,
  /const externalConversationId = externalConversationIdFor\(input\.chatJid\)/,
  'incoming WhatsApp messages must use stable integration conversation_id from chatJid',
)

assert.doesNotMatch(
  service,
  /const externalConversationId = link\.amo_conversation_id \?\? externalConversationIdFor\(input\.chatJid\)/,
  'amo returned conversation id must not become the next integration conversation_id',
)

assert.match(
  service,
  /await findLeadByPhoneInPipeline\(phones, AMO_INQUIRY_PIPELINE_ID\)/,
  'existing active lead lookup by phone must run before falling back',
)

assert.doesNotMatch(
  service,
  /await createContact\(/,
  'custom chat flow should not create a CRM contact before amoCRM chat matching can reuse one',
)

assert.doesNotMatch(
  service,
  /await createLead\(/,
  'custom chat flow should not create a CRM lead before amoCRM chat matching can reuse one',
)

assert.match(
  service,
  /forwardWhatsAppManualOutgoingToAmo/,
  'manual WhatsApp outgoing import handler must exist',
)

assert.match(
  service,
  /reserveDedupe\('whatsapp_manual_outgoing', dedupeKey/,
  'manual WhatsApp outgoing messages must use separate dedupe source',
)

assert.match(
  eventRoute,
  /if \(knownOutgoing\) \{/,
  'any known outbox message id must be treated as gateway echo',
)

assert.match(
  eventRoute,
  /await forwardWhatsAppManualOutgoingToAmo\(/,
  'manual_outgoing event must import the message into amoCRM',
)

assert.match(
  gateway,
  /const text = extractText\(rawMessage\)/,
  'gateway must extract text from fromMe messages',
)

assert.match(
  gateway,
  /text: text \?\? undefined/,
  'gateway must send manual outgoing text to the main project',
)

assert.match(
  mainProjectClient,
  /text\?: string/,
  'main project client must accept manual outgoing text',
)

assert.match(amoClient, /ref_id: input\.senderRefId/, 'outgoing amo message must identify one registered bot/manager')
assert.match(config, /AMO_CHAT_BOT_ID/, 'registered amo bot id must be configured server-side')
assert.match(service, /amo_chat_bot_id_missing/, 'manual import must fail safely until the real amo bot id is configured')
assert.match(service, /dedupe_hit/, 'duplicate incoming messages must be logged and skipped')

assert.ok(
  service.indexOf("reserveDedupe('whatsapp'") < service.indexOf('const delivery = await withSingleStaleLinkRecovery'),
  'incoming message must reserve dedupe before stale-link recovery starts',
)
assert.match(service, /releaseDedupe\('whatsapp', dedupeKey\)/, 'failed incoming delivery must release dedupe')
assert.match(service, /amoMessageSent = true/, 'successful amo delivery must preserve dedupe during later persistence failures')
assert.match(service, /withSingleStaleLinkRecovery/, 'incoming amo delivery must use bounded stale-link recovery')
for (const field of ['amo_chat_id', 'amo_conversation_id', 'amo_contact_id', 'amo_lead_id', 'last_amo_message_id']) {
  assert.match(service, new RegExp(`${field}: null`), `stale reset must clear ${field}`)
}
for (const preserved of ['conversation_id', 'phone', 'whatsapp_chat_jid', 'last_whatsapp_message_id', 'created_at']) {
  assert.doesNotMatch(
    service.match(/async function resetAmoChatLink[\s\S]*?\n}/)?.[0] ?? '',
    new RegExp(`(^|\\n)\\s*${preserved}: null`),
    `stale reset must preserve ${preserved}`,
  )
}
assert.match(recovery, /retryCount: 0 \| 1/, 'stale recovery must be limited to one retry')
assert.match(recovery, /status === 401 \|\| status === 403 \|\| status === 429/, 'auth and rate-limit failures must not reset links')
assert.match(recovery, /status >= 500/, 'temporary server failures must not reset links')

assert.match(eventRoute, /findKnownOutgoingWithRetry/, 'manual takeover must tolerate delayed AI outbox persistence')
assert.match(outgoingEcho, /DEFAULT_RETRY_DELAYS_MS/, 'AI echo lookup must use bounded delayed checks')
assert.match(gateway, /void this\.mainProject\.recordIncomingMessage/, 'amo sync must remain independent from the AI reply path')
assert.ok(
  gateway.indexOf('void this.mainProject.recordIncomingMessage') < gateway.indexOf('this.handler.handleIncomingMessage'),
  'amo sync dispatch must not block AI generation',
)
assert.match(eventRoute, /takeover_reason: body\.takeoverReason \?\? 'manual_outgoing'/, 'real manager output must still enter handoff')
assert.match(eventRoute, /takeover_status: body\.aiEnabled \? 'none' : 'human'/, 'dialog endpoint must restore AI mode')

for (const stage of [
  'whatsapp_event_received',
  'conversation_resolved',
  'dedupe_checked',
  'amo_link_resolved',
  'amo_stale_link_detected',
  'amo_link_reset',
  'amo_chat_recreated',
  'amo_message_retry_started',
  'amo_message_sent',
  'processing_failed',
]) {
  assert.ok(service.includes(stage) || eventRoute.includes(stage) || recovery.includes(stage), `diagnostic stage ${stage} must exist`)
}
assert.match(aiReplyRoute, /ai_request_started/, 'AI endpoint must log request start without message text')
assert.match(eventRoute, /ai_reply_sent/, 'successful AI delivery must be logged from the outbox completion event')

console.log('test-amo-whatsapp-integration-rules: ok')
