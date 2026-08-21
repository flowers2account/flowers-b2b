import { NextRequest, NextResponse } from 'next/server'
import { sendTextMessage } from '@/lib/whatsapp-cloud/client'
import {
  getDialogState,
  recordIncomingMessage,
  requestAiReply,
  recordSentOutgoing,
} from '@/lib/whatsapp-cloud/bridge'
import { notifyIncoming, notifyAiReply } from '@/lib/telegram-manager/notify'

export const dynamic = 'force-dynamic'

// Official WhatsApp Cloud API (Meta) webhook.
//
// Мост в существующий Baileys-независимый pipeline (whatsapp-event → amo-chat →
// whatsapp-reply → AI), не меняя сам pipeline: входящее сообщение прогоняется через
// те же внутренние роуты /api/internal/ai/whatsapp-event и /whatsapp-reply, что и
// whatsapp-gateway/src/whatsapp-client.ts, а ответ уходит клиенту через Cloud API
// (src/lib/whatsapp-cloud/client.ts) вместо Baileys-сокета. Канал помечен отдельным
// chatJid-суффиксом (@cloudapi, см. CLOUD_API_JID_SUFFIX) — источники не путаются
// в логах/БД, если когда-нибудь понадобится держать оба транспорта одновременно.
// Собственно pipeline (whatsapp-event/route.ts, whatsapp-reply/route.ts,
// amo-chat/service.ts, bot/accessories-bot.ts) этот файл не трогает.

const CLOUD_API_JID_SUFFIX = '@cloudapi'
const MAX_PROCESSED_IDS = 5000

// Meta может повторно доставить один и тот же вебхук (сетевые ретраи и т.п.). У Baileys
// от этого защищает ProcessedMessageStore перед вызовом хендлера (whatsapp-client.ts:284) —
// здесь тот же приём: ограниченный in-memory Set, чтобы не задвоить AI-ответ клиенту.
const processedMessageIds = new Set<string>()

function markProcessed(messageId: string): boolean {
  if (processedMessageIds.has(messageId)) return false
  processedMessageIds.add(messageId)
  if (processedMessageIds.size > MAX_PROCESSED_IDS) {
    const oldest = processedMessageIds.values().next().value
    if (oldest) processedMessageIds.delete(oldest)
  }
  return true
}

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

// POST — incoming WhatsApp Cloud API event payload. Meta expects a fast 200 regardless of
// content to avoid retry storms — так что сначала лог + ack, а сама прогонка через pipeline
// (getDialogState → recordIncomingMessage → [AI → send → recordSentOutgoing]) идёт ПОСЛЕ
// ответа, не блокируя его (процесс на VPS постоянный — pm2, не serverless — фоновая работа
// после return продолжается нормально, как и void-вызовы в самом Baileys-клиенте).
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    console.warn('[whatsapp cloud webhook] non-JSON body received')
    return NextResponse.json({ status: 'ok' })
  }

  console.log('[whatsapp cloud webhook] payload:', JSON.stringify(body))

  const messages = extractTextMessages(body)
  for (const message of messages) {
    if (!markProcessed(message.messageId)) {
      console.log('[whatsapp cloud webhook] duplicate delivery ignored', { messageId: message.messageId })
      continue
    }
    void processIncomingMessage(message)
  }

  return NextResponse.json({ status: 'ok' })
}

interface ParsedCloudMessage {
  chatJid: string
  phone: string
  messageId: string
  text: string
  timestamp: string
  contactName?: string
  traceId: string
}

// Минимальная форма payload Meta Cloud API (WhatsApp Business Account webhook) — только
// поля, которые реально читаем. Остальное (statuses, реакции, медиа-типы) не типизируем,
// они просто не совпадут с type:'text' ниже и будут пропущены.
interface CloudWebhookBody {
  entry?: Array<{
    changes?: Array<{
      field?: string
      value?: {
        contacts?: Array<{ profile?: { name?: string } }>
        messages?: Array<{
          type?: string
          from?: string
          id?: string
          timestamp?: string | number
          text?: { body?: string }
        }>
      }
    }>
  }>
}

// Разбирает entry[].changes[].value — берёт только текстовые сообщения (type:'text').
// Остальное (statuses, contacts-обмен, реакции, медиа) тихо игнорируется, как и
// extractText() в Baileys-клиенте для неподдерживаемых типов.
function extractTextMessages(body: unknown): ParsedCloudMessage[] {
  const out: ParsedCloudMessage[] = []
  const entries = asArray((body as CloudWebhookBody)?.entry)

  for (const entry of entries) {
    const changes = asArray(entry?.changes)
    for (const change of changes) {
      if (change?.field !== 'messages') continue
      const value = change?.value
      const contacts = asArray(value?.contacts)
      const contactName = typeof contacts[0]?.profile?.name === 'string' ? contacts[0]!.profile!.name : undefined
      const rawMessages = asArray(value?.messages)

      for (const raw of rawMessages) {
        if (raw?.type !== 'text') continue
        const from = typeof raw?.from === 'string' ? raw.from.trim() : ''
        const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
        const text = typeof raw?.text?.body === 'string' ? raw.text!.body!.trim() : ''
        if (!from || !id || !text) continue

        out.push({
          chatJid: `${from}${CLOUD_API_JID_SUFFIX}`,
          phone: from,
          messageId: id,
          text,
          timestamp: timestampToIso(raw?.timestamp),
          contactName,
          traceId: createTraceId(),
        })
      }
    }
  }

  return out
}

// Тот же текст, что FALLBACK_TEXT в whatsapp-gateway/src/handlers/ai-message-handler.ts:6 —
// Baileys-путь отвечает им клиенту при падении AI, а не молчит. Держим формулировку в синхроне вручную.
const AI_FALLBACK_TEXT = 'Не удалось обработать сообщение. Диалог передан менеджеру.'

// Зеркало handleMessages() из whatsapp-client.ts (строки 271-346): getDialogState →
// recordIncomingMessage (всегда) → если human-takeover, дальше не идём → иначе AI-ответ →
// отправка через Cloud API → recordSentOutgoing (синк ответа в amoCRM).
async function processIncomingMessage(message: ParsedCloudMessage): Promise<void> {
  const { chatJid, phone, messageId, text, timestamp, contactName, traceId } = message

  try {
    const state = await getDialogState({ chatJid, phone, traceId })
    const conversationId = state?.conversationId
    const aiEnabled = state?.aiEnabled ?? true
    const humanTakeover = aiEnabled === false || state?.takeoverStatus === 'human'

    await recordIncomingMessage({ chatJid, phone, conversationId, messageId, text, timestamp, contactName, traceId })
    await notifyIncoming({ chatJid, phone, contactName, text })

    if (humanTakeover) {
      console.log('[whatsapp cloud webhook] human takeover — ai skipped', { traceId, messageId, chatJid })
      return
    }

    let replyText: string
    let replyConversationId: string | undefined
    try {
      const reply = await requestAiReply({ text, chatJid, traceId, phone, conversationId, contactName })
      replyText = reply.text
      replyConversationId = reply.conversationId
    } catch (error) {
      // Зеркало catch-блока AiMessageHandler.handleIncomingMessage (ai-message-handler.ts:49-82):
      // Baileys-путь при падении AI не молчит, а шлёт клиенту fallback-текст. Делаем то же самое;
      // если и сама отправка fallback упадёт — просто логируем, без повторных попыток.
      console.error('[whatsapp cloud webhook] ai reply failed — sending fallback', {
        traceId,
        messageId,
        chatJid,
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        const sentFallback = await sendTextMessage(phone, AI_FALLBACK_TEXT)
        if (!sentFallback.messageId) {
          console.warn('[whatsapp cloud webhook] fallback send succeeded without messageId', { traceId, chatJid })
          return
        }
        // Тот же синк в amoCRM, что и у обычного AI-ответа (recordSentOutgoing → complete_outgoing →
        // forwardWhatsAppAiOutgoingToAmo) — fallback тоже должен быть виден в чате amoCRM. Если синк
        // упадёт — только лог, без ретраев и без влияния на уже отправленное клиенту сообщение.
        try {
          await recordSentOutgoing({
            chatJid,
            phone,
            messageId: sentFallback.messageId,
            text: AI_FALLBACK_TEXT,
            traceId,
          })
        } catch (syncError) {
          console.error('[whatsapp cloud webhook] fallback amo sync failed', {
            traceId,
            messageId,
            chatJid,
            error: syncError instanceof Error ? syncError.message : String(syncError),
          })
        }
      } catch (sendError) {
        console.error('[whatsapp cloud webhook] fallback send failed', {
          traceId,
          messageId,
          chatJid,
          error: sendError instanceof Error ? sendError.message : String(sendError),
        })
      }
      return
    }

    if (!replyText) {
      console.log('[whatsapp cloud webhook] empty ai reply — nothing to send', { traceId, messageId, chatJid })
      return
    }

    const sent = await sendTextMessage(phone, replyText)
    if (!sent.messageId) {
      console.warn('[whatsapp cloud webhook] send succeeded without messageId', { traceId, chatJid })
      return
    }

    await recordSentOutgoing({
      chatJid,
      phone,
      messageId: sent.messageId,
      text: replyText,
      traceId,
    })
    await notifyAiReply({ chatJid, phone, text: replyText })

    console.log('[whatsapp cloud webhook] auto reply sent', { traceId, messageId, chatJid, conversationId: replyConversationId })
  } catch (error) {
    console.error('[whatsapp cloud webhook] processing failed', {
      traceId,
      messageId,
      chatJid,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : []
}

function timestampToIso(value: unknown): string {
  const seconds = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isFinite(seconds)) return new Date().toISOString()
  return new Date(seconds * 1000).toISOString()
}

function createTraceId(): string {
  return `cloudapi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
