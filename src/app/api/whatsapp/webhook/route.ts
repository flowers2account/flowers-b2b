import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Official WhatsApp Cloud API (Meta) webhook. Fully isolated from the
// existing Baileys gateway (WHATSAPP_GATEWAY_*) and from the Umnico/AI/
// amoCRM bot logic — this route only does the Meta subscription handshake
// and logs incoming payloads. No other route imports or calls into this file.

function getVerifyToken(): string | undefined {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
}

// GET https://.../api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// Meta's one-time subscription verification (see WhatsApp Cloud API docs).
// A plain GET with none of the hub.* params (e.g. a manual/uptime check)
// is treated as a minimal health/test probe instead of a failed verification.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === null && token === null && challenge === null) {
    return NextResponse.json({ status: 'ok', endpoint: 'whatsapp-cloud-webhook' })
  }

  const verifyToken = getVerifyToken()
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    console.log('[whatsapp cloud webhook] verification succeeded')
    return new NextResponse(challenge ?? '', { status: 200 })
  }

  console.warn('[whatsapp cloud webhook] verification failed', { mode, tokenPresent: token !== null })
  return new NextResponse('Forbidden', { status: 403 })
}

// POST — incoming WhatsApp Cloud API event payload. Meta expects a fast 200
// regardless of content to avoid retry storms, so this only logs and acks;
// it never throws and never touches Baileys/Umnico/amoCRM state.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    console.warn('[whatsapp cloud webhook] non-JSON body received')
    return NextResponse.json({ status: 'ok' })
  }

  console.log('[whatsapp cloud webhook] payload:', JSON.stringify(body))

  return NextResponse.json({ status: 'ok' })
}
