import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const service = await readFile('src/lib/amo-chat/service.ts', 'utf8')
const eventRoute = await readFile('src/app/api/internal/ai/whatsapp-event/route.ts', 'utf8')
const gateway = await readFile('whatsapp-gateway/src/whatsapp-client.ts', 'utf8')
const mainProjectClient = await readFile('whatsapp-gateway/src/main-project-client.ts', 'utf8')

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

console.log('test-amo-whatsapp-integration-rules: ok')
