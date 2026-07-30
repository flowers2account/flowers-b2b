import { NextRequest, NextResponse } from 'next/server'
import { getRequiredAmoChatConfig, AmoChatConfigError } from '@/lib/amo-chat/config'
import { verifyAmoChatWebhookSignature } from '@/lib/amo-chat/signature'
import { handleAmoManagerWebhook, parseAmoChatWebhookMessage } from '@/lib/amo-chat/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY_BYTES = 32 * 1024

export async function POST(req: NextRequest, ctx: { params: Promise<{ scopeId: string }> }) {
  const startedAt = Date.now()
  const { scopeId } = await ctx.params

  try {
    const config = getRequiredAmoChatConfig()
    const rawBody = await readRawBody(req)
    const signature = req.headers.get('x-signature')

    if (!verifyAmoChatWebhookSignature({ rawBody, signature, secret: config.secretKey })) {
      console.warn('amo chat webhook rejected', {
        durationMs: Date.now() - startedAt,
        scopeIdPresent: Boolean(scopeId),
        reason: 'bad_signature',
      })
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'bad json' }, { status: 400 })
    }

    const parsed = parseAmoChatWebhookMessage(scopeId, body)
    if (!parsed) {
      console.log('amo chat webhook ignored', {
        durationMs: Date.now() - startedAt,
        scopeIdPresent: Boolean(scopeId),
        reason: 'unsupported_or_empty_message',
      })
      return NextResponse.json({ status: 'ignored' })
    }

    const result = await handleAmoManagerWebhook(parsed)
    console.log('amo chat webhook handled', {
      durationMs: Date.now() - startedAt,
      scopeIdPresent: Boolean(scopeId),
      status: result.status,
      reason: result.reason,
      conversationId: result.conversationId,
      inputTextLength: parsed.text.length,
    })

    return NextResponse.json({ status: result.status, conversationId: result.conversationId })
  } catch (error) {
    const status = error instanceof AmoChatConfigError ? 503 : error instanceof PayloadTooLargeError ? 413 : 502
    console.error('amo chat webhook failed', {
      durationMs: Date.now() - startedAt,
      scopeIdPresent: Boolean(scopeId),
      status,
      error: error instanceof Error ? error.message : 'unknown error',
    })
    return NextResponse.json({ error: 'webhook failed' }, { status })
  }
}

async function readRawBody(req: NextRequest): Promise<string> {
  const rawBody = await req.text()
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError()
  }
  return rawBody
}

class PayloadTooLargeError extends Error {}
