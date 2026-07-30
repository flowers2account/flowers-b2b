import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const sourcePath = path.join(process.cwd(), 'src', 'lib', 'amo-chat', 'webhook-parser.ts')
const source = await readFile(sourcePath, 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
})

const tempDir = await mkdtemp(path.join(tmpdir(), 'amo-chat-parser-'))
const modulePath = path.join(tempDir, 'webhook-parser.mjs')

try {
  await writeFile(modulePath, output.outputText, 'utf8')
  const { parseAmoChatWebhookMessage } = await import(pathToFileURL(modulePath).href)

  const withConversationId = parseAmoChatWebhookMessage('scope-1', webhookPayload({
    conversation: {
      id: 'conversation-id',
      client_id: 'legacy-client-id',
    },
  }))

  assert.equal(withConversationId?.amoConversationId, 'conversation-id')
  assert.equal(withConversationId?.amoConversationClientId, 'legacy-client-id')

  const withClientIdFallback = parseAmoChatWebhookMessage('scope-1', webhookPayload({
    conversation: {
      client_id: 'legacy-client-id',
    },
  }))

  assert.equal(withClientIdFallback?.amoConversationId, 'legacy-client-id')
  assert.equal(withClientIdFallback?.amoConversationClientId, 'legacy-client-id')

  console.log('test-amo-chat-webhook-parser: ok')
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

function webhookPayload({ conversation }) {
  return {
    message: {
      conversation,
      receiver: {
        phone: '+7 747 610 84 58',
      },
      msec_timestamp: 1785343601399,
      message: {
        id: 'amo-message-id',
        type: 'text',
        text: 'Ответ менеджера',
      },
    },
  }
}
