import assert from 'node:assert/strict'
import test from 'node:test'
import { AmoChatApiError, AmoChatClient } from '../src/lib/amo-chat/client.ts'
import { findKnownOutgoingWithRetry } from '../src/lib/amo-chat/outgoing-echo.ts'
import { isStaleAmoLinkError, withSingleStaleLinkRecovery } from '../src/lib/amo-chat/recovery.ts'

test('existing amo chat is reused without reset or retry', async () => {
  let attempts = 0
  let resets = 0
  const result = await withSingleStaleLinkRecovery({
    attempt: async () => {
      attempts += 1
      return { amoConversationId: 'existing-conversation' }
    },
    resetLink: async () => {
      resets += 1
    },
  })

  assert.equal(result.retryCount, 0)
  assert.equal(result.value.amoConversationId, 'existing-conversation')
  assert.equal(attempts, 1)
  assert.equal(resets, 0)
})

test('404 clears the stale link, recreates it, and retries exactly once', async () => {
  const stages: string[] = []
  let attempts = 0
  let resets = 0
  let persistedConversationId = 'deleted-conversation'

  const result = await withSingleStaleLinkRecovery({
    attempt: async (retryCount) => {
      attempts += 1
      if (retryCount === 0) throw { status: 404, staleEntity: true }
      persistedConversationId = 'new-conversation'
      return { amoConversationId: persistedConversationId, amoMessageId: 'new-message' }
    },
    resetLink: async () => {
      resets += 1
      persistedConversationId = ''
    },
    onStage: (stage) => stages.push(stage),
  })

  assert.equal(result.retryCount, 1)
  assert.equal(attempts, 2)
  assert.equal(resets, 1)
  assert.equal(result.value.amoConversationId, 'new-conversation')
  assert.equal(result.value.amoMessageId, 'new-message')
  assert.deepEqual(stages, [
    'amo_stale_link_detected',
    'amo_link_reset',
    'amo_message_retry_started',
    'amo_chat_recreated',
  ])
})

test('a stale send is retried once and never loops', async () => {
  let attempts = 0
  await assert.rejects(
    withSingleStaleLinkRecovery({
      attempt: async () => {
        attempts += 1
        throw { status: 404, staleLink: true }
      },
      resetLink: async () => undefined,
    }),
  )
  assert.equal(attempts, 2)
})

test('only confirmed missing entities are destructive-reset candidates', () => {
  assert.equal(isStaleAmoLinkError({ status: 404 }), true)
  assert.equal(isStaleAmoLinkError({ status: 410 }), true)
  assert.equal(isStaleAmoLinkError({ status: 400, staleLink: true }), true)
  assert.equal(isStaleAmoLinkError({ status: 400, staleEntity: true }), true)

  for (const error of [
    { status: 400, staleLink: false, reason: 'receiver validation' },
    { status: 401 },
    { status: 403 },
    { status: 429 },
    { status: 500 },
    { status: 503 },
    new Error('network timeout'),
  ]) {
    assert.equal(isStaleAmoLinkError(error), false)
  }
})

test('amo chat client distinguishes stale conversation from payload validation', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ error_description: 'conversation not found' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
    const client = new AmoChatClient({ baseUrl: 'https://amo.invalid', secretKey: 'test-secret' })
    await assert.rejects(
      client.sendIncomingText({
        scopeId: 'scope',
        conversationId: 'conversation',
        messageId: 'message',
        senderId: 'sender',
        senderName: 'Test',
        text: 'test',
        timestampMs: 1,
      }),
      (error) => error instanceof AmoChatApiError && error.staleLink,
    )

    globalThis.fetch = async () => new Response(
      JSON.stringify({ error_description: 'receiver validation: exactly one origin user must be provided' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
    await assert.rejects(
      client.sendIncomingText({
        scopeId: 'scope',
        conversationId: 'conversation',
        messageId: 'message',
        senderId: 'sender',
        senderName: 'Test',
        text: 'test',
        timestampMs: 1,
      }),
      (error) => error instanceof AmoChatApiError && !error.staleLink,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('delayed outbox visibility prevents an AI echo from becoming handoff', async () => {
  let lookups = 0
  const outgoing = await findKnownOutgoingWithRetry(async () => {
    lookups += 1
    return lookups === 2 ? { source: 'ai' } : null
  }, [0, 0, 0])

  assert.deepEqual(outgoing, { source: 'ai' })
  assert.equal(lookups, 2)
})

test('a real manager message remains unmatched and can trigger handoff', async () => {
  let lookups = 0
  const outgoing = await findKnownOutgoingWithRetry(async () => {
    lookups += 1
    return null
  }, [0, 0, 0])

  assert.equal(outgoing, null)
  assert.equal(lookups, 3)
})
