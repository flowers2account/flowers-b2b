import { NextRequest, NextResponse } from 'next/server'
import { getAccessoriesReply, type WidgetProduct } from '@/lib/bot/accessories-bot'
import { resolveConversation, loadHistory, saveMessages } from '@/lib/bot/conversation-store'
import { businessFallbackReason, normalizeWhatsAppReply, TECHNICAL_FALLBACK_TEXT } from '@/lib/bot/whatsapp-reply-normalizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { addClientCartItem } from '@/lib/server-cart'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 16 * 1024
const MAX_TEXT_LENGTH = 4000
const DEFAULT_REQUEST_TIMEOUT_MS = 55000
const FALLBACK_TEXT = TECHNICAL_FALLBACK_TEXT
const CART_LOGIN_TEXT = 'Чтобы сохранить товар в корзину, напишите номер телефона, на который зарегистрирован личный кабинет.'
const CART_AMBIGUOUS_TEXT = 'Нашёл несколько похожих товаров. Уточните, какую именно позицию добавить в корзину.'
const CART_NOT_FOUND_TEXT = 'Не нашёл товар для добавления в корзину. Уточните название или отправьте ссылку на карточку.'

interface RequestBody {
  text?: unknown
  chatJid?: unknown
  traceId?: unknown
  phone?: unknown
  conversationId?: unknown
  contactName?: unknown
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const configuredSecret = process.env.WHATSAPP_GATEWAY_AI_API_KEY
  const timeoutMs = getTimeoutMs()

  if (!configuredSecret) {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
  }

  const providedSecret = req.headers.get('x-api-key')
  if (!providedSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let inputTextLength = 0
  let conversationId: string | undefined
  let conversationClientId: string | null = null
  let traceId: string | undefined

  try {
    const body = await readJsonBody(req)
    const parsed = parseBody(body)
    inputTextLength = parsed.text.length
    traceId = parsed.traceId

    console.log('ai whatsapp request received', {
      durationMs: Date.now() - startedAt,
      traceId: parsed.traceId,
      conversationId: parsed.conversationId,
      inputTextLength,
    })

    const anonId = `whatsapp:${parsed.chatJid}`
    const resolveStartedAt = Date.now()
    const conversation = await resolveConversationContext({
      conversationId: parsed.conversationId,
      anonId,
      phone: parsed.phone,
    })
    conversationId = conversation.id
    conversationClientId = conversation.clientId
    console.log('[ai timing] resolveConversation', {
      durationMs: Date.now() - resolveStartedAt,
      traceId: parsed.traceId,
      conversationId,
      clientResolved: Boolean(conversationClientId),
      inputTextLength,
    })

    let timedOut = false
    const result = await withTimeout(async () => {
      const historyStartedAt = Date.now()
      const history = conversationId ? await loadHistory(conversationId) : []
      console.log('[ai timing] loadHistory', {
        durationMs: Date.now() - historyStartedAt,
        traceId: parsed.traceId,
        conversationId,
        historyCount: history.length,
      })
      const reply = await getAccessoriesReply(parsed.text, {
        history,
        channel: 'whatsapp',
      })
      const normalized = normalizeReply(reply)
      const cartAction = detectCartAdd(parsed.text)
      const cartResult = cartAction
        ? await applyCartAdd({
            clientId: conversationClientId,
            product: pickCartProduct(reply.products ?? []),
            requestedQty: cartAction.qty,
          })
        : null
      const outputText = cartResult?.text ?? normalized.text
      console.log('[ai diagnostic] normalized reply', {
        intent: reply.meta?.intent,
        traceId: parsed.traceId,
        classificationSource: reply.meta?.classificationSource,
        classificationReason: reply.meta?.classificationReason,
        classificationDurationMs: reply.meta?.classificationDurationMs,
        productCount: reply.products?.length ?? 0,
        cartAction: cartAction ? cartResult?.status ?? 'detected' : 'none',
        cartQty: cartAction?.qty,
        replyKind: normalized.replyKind,
        fallbackSource: normalized.fallbackSource,
        normalizedOutputLength: outputText.length,
        businessFallbackReason: businessFallbackReason(reply),
      })

      if (conversationId && !timedOut) {
        const saveStartedAt = Date.now()
        await saveMessages(conversationId, [
          { role: 'user', text: parsed.text },
          { role: 'bot', text: outputText },
        ])
        console.log('[ai timing] saveMessages', {
          durationMs: Date.now() - saveStartedAt,
          traceId: parsed.traceId,
          conversationId,
          outputTextLength: outputText.length,
        })
      }

      return {
        ...normalized,
        text: outputText,
        conversationId,
        cartAction: cartAction ? cartResult?.status ?? 'detected' : 'none',
        intent: reply.meta?.intent,
        classificationSource: reply.meta?.classificationSource,
        classificationReason: reply.meta?.classificationReason,
        classificationDurationMs: reply.meta?.classificationDurationMs,
      }
    }, timeoutMs, () => {
      timedOut = true
    })

    console.log('ai whatsapp response generated', {
      durationMs: Date.now() - startedAt,
      traceId: parsed.traceId,
      conversationId: result.conversationId,
      reason: result.reason,
      fallbackSource: result.fallbackSource,
      intent: result.intent,
      classificationSource: result.classificationSource,
      classificationReason: result.classificationReason,
      classificationDurationMs: result.classificationDurationMs,
      cartAction: result.cartAction,
      replyKind: result.replyKind,
      inputTextLength,
      outputTextLength: result.text.length,
    })

    return NextResponse.json({
      text: result.text,
      conversationId: result.conversationId,
    })
  } catch (error) {
    const isTimeout = error instanceof TimeoutError
    const reason = isTimeout ? 'ai_timeout_endpoint' : error instanceof HttpError ? 'http_error' : 'ai_endpoint_error'
    const fallbackSource = isTimeout ? 'endpoint' : 'endpoint'

    console.error('ai whatsapp request failed', {
      durationMs: Date.now() - startedAt,
      traceId,
      conversationId,
      reason,
      fallbackSource,
      inputTextLength,
      outputTextLength: 0,
      error: error instanceof Error ? error.message : 'unknown error',
    })

    if (isTimeout) {
      return NextResponse.json(
        {
          error: 'ai timeout',
          reason: 'ai_timeout_endpoint',
          fallbackSource: 'endpoint',
          conversationId,
        },
        { status: 504 },
      )
    }

    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.publicMessage }, { status: error.status })
    }

    return NextResponse.json({
      text: FALLBACK_TEXT,
      conversationId,
      reason: 'ai_endpoint_error',
      fallbackSource: 'endpoint',
    })
  }
}

async function readJsonBody(req: NextRequest): Promise<RequestBody> {
  const raw = await req.text()

  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload too large')
  }

  try {
    return JSON.parse(raw) as RequestBody
  } catch {
    throw new HttpError(400, 'bad json')
  }
}

function parseBody(body: RequestBody) {
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const chatJid = typeof body.chatJid === 'string' ? body.chatJid.trim() : ''
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : undefined
  const traceId = typeof body.traceId === 'string' && body.traceId.trim() ? body.traceId.trim() : undefined
  const conversationId =
    typeof body.conversationId === 'string' && body.conversationId.trim()
      ? body.conversationId.trim()
      : undefined
  const contactName =
    typeof body.contactName === 'string' && body.contactName.trim()
      ? body.contactName.trim()
      : undefined

  if (!text) throw new HttpError(400, 'text is required')
  if (text.length > MAX_TEXT_LENGTH) throw new HttpError(400, 'text is too long')
  if (!chatJid) throw new HttpError(400, 'chatJid is required')

  return { text, chatJid, traceId, phone, conversationId, contactName }
}

async function resolveConversationContext(opts: {
  conversationId?: string
  anonId: string
  phone?: string
}): Promise<{ id?: string; clientId: string | null; phone: string | null }> {
  if (opts.conversationId && isUuid(opts.conversationId)) {
    const existing = await findConversationById(opts.conversationId)
    if (existing) {
      await markConversationAsWhatsApp(existing.id, opts.anonId.replace(/^whatsapp:/, ''))
      return existing
    }
  }

  const resolved = await resolveConversation({
    anonId: opts.anonId,
    phone: opts.phone ?? null,
  })

  if (resolved?.id) {
    await markConversationAsWhatsApp(resolved.id, opts.anonId.replace(/^whatsapp:/, ''))
  }

  return {
    id: resolved?.id,
    clientId: resolved?.clientId ?? null,
    phone: resolved?.phone ?? null,
  }
}

async function findConversationById(conversationId: string): Promise<{ id: string; clientId: string | null; phone: string | null } | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('conversations')
      .select('id, client_id, phone')
      .eq('id', conversationId)
      .maybeSingle()

    if (error || !data?.id) return null
    return {
      id: data.id,
      clientId: data.client_id ?? null,
      phone: data.phone ?? null,
    }
  } catch {
    return null
  }
}

async function markConversationAsWhatsApp(conversationId: string, chatJid?: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('conversations')
      .update({ channel: 'whatsapp', whatsapp_chat_jid: chatJid ?? null })
      .eq('id', conversationId)
  } catch {
    // Conversation persistence is best-effort in the existing store.
  }
}

function normalizeReply(reply: Awaited<ReturnType<typeof getAccessoriesReply>>): {
  text: string
  reason?: 'ai_null_response' | 'ai_business_fallback' | 'ai_classification_timeout'
  fallbackSource?: 'endpoint' | 'accessories-bot'
  replyKind: 'ai_text_response' | 'ai_null_response' | 'ai_business_fallback' | 'ai_classification_timeout'
} {
  return normalizeWhatsAppReply(reply)
}

function detectCartAdd(message: string): { qty: number } | null {
  const text = message.toLowerCase().replace(/ё/g, 'е')
  const hasCartWord = /(^|[^а-яa-z])корзин[ауыые]?([^а-яa-z]|$)/.test(text)
  const hasAddVerb = /(добав|полож|закин|кинь|докин|отлож|сохран)/.test(text)
  if (!hasCartWord || !hasAddVerb) return null

  const qtyMatch = text.match(/(?:^|\D)(\d{1,3})(?=\D|$)/)
  const qty = qtyMatch ? Math.max(1, Math.min(999, Number(qtyMatch[1]))) : 1
  return { qty }
}

function pickCartProduct(products: WidgetProduct[]): WidgetProduct | null {
  if (products.length !== 1) return null
  return products[0]
}

async function applyCartAdd(opts: {
  clientId: string | null
  product: WidgetProduct | null
  requestedQty: number
}): Promise<{ status: 'missing_client' | 'ambiguous_product' | 'added'; text: string }> {
  if (!opts.clientId) {
    return { status: 'missing_client', text: CART_LOGIN_TEXT }
  }

  if (!opts.product) {
    return { status: 'ambiguous_product', text: CART_AMBIGUOUS_TEXT }
  }

  const available = Math.max(0, Number(opts.product.qty) || 0)
  if (available <= 0) {
    return { status: 'ambiguous_product', text: CART_NOT_FOUND_TEXT }
  }

  const qty = Math.min(opts.requestedQty, available)
  const name = opts.product.display_name || `Товар ${opts.product.id}`
  await addClientCartItem(createAdminClient(), opts.clientId, {
    id: opts.product.id,
    name,
    price: Number(opts.product.price) || 0,
    qty,
    available,
    category: 'accessories',
    image_url: opts.product.image_url,
    unit: opts.product.unit,
    subcategory: opts.product.subcategory,
  })

  return {
    status: 'added',
    text: `Добавил в корзину: ${name} × ${qty}. Корзина сохранена в личном кабинете.`,
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          onTimeout()
          reject(new TimeoutError())
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function getTimeoutMs(): number {
  const raw = process.env.WHATSAPP_AI_TIMEOUT_MS
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 120000) {
    return DEFAULT_REQUEST_TIMEOUT_MS
  }

  return Math.trunc(parsed)
}

class TimeoutError extends Error {
  constructor() {
    super('ai whatsapp request timeout')
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage)
  }
}
