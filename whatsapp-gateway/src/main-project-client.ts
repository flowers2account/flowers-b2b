import type { AppConfig } from './config.js'
import type { AppLogger } from './logger.js'

export interface DialogState {
  conversationId?: string
  aiEnabled: boolean
  takeoverStatus: string
  takeoverStartedAt?: string
  takeoverReason?: string
  ignored?: boolean
  reason?: string
}

export interface IdempotencyReservation {
  reserved: boolean
  status: string
  messageId?: string
  conversationId?: string
}

export class MainProjectClient {
  private readonly eventUrl: string

  constructor(
    private readonly config: Pick<AppConfig, 'AI_AGENT_URL' | 'WHATSAPP_EVENT_SECRET' | 'AI_TIMEOUT_MS'>,
    private readonly logger: AppLogger,
  ) {
    this.eventUrl = deriveEventUrl(config.AI_AGENT_URL)
  }

  async getDialogState(input: {
    chatJid: string
    phone?: string
    conversationId?: string
    traceId?: string
  }): Promise<DialogState | null> {
    const data = await this.postEvent(
      {
        type: 'get_dialog_state',
        chatJid: input.chatJid,
        phone: input.phone,
        conversationId: input.conversationId,
        source: 'gateway',
      },
      input.traceId,
    )

    if (!data) return null

    return {
      conversationId: readString(data.conversationId),
      aiEnabled: data.aiEnabled !== false,
      takeoverStatus: readString(data.takeoverStatus) ?? 'none',
      takeoverStartedAt: readString(data.takeoverStartedAt),
      takeoverReason: readString(data.takeoverReason),
    }
  }

  async recordManualOutgoing(input: {
    chatJid: string
    phone?: string
    messageId?: string
    text?: string
    timestamp?: string
    contactName?: string
    traceId?: string
  }): Promise<DialogState | null> {
    const data = await this.postEvent(
      {
        type: 'manual_outgoing',
        chatJid: input.chatJid,
        phone: input.phone,
        messageId: input.messageId,
        text: input.text,
        timestamp: input.timestamp,
        contactName: input.contactName,
        source: 'human',
        takeoverReason: 'manual_outgoing',
      },
      input.traceId,
    )

    if (!data) return null
    if (data.ignored === true) {
      return {
        conversationId: readString(data.conversationId),
        aiEnabled: true,
        takeoverStatus: 'ignored',
        ignored: true,
        reason: readString(data.reason),
      }
    }

    return {
      conversationId: readString(data.conversationId),
      aiEnabled: data.aiEnabled !== false,
      takeoverStatus: readString(data.takeoverStatus) ?? 'human',
    }
  }

  async setAiEnabled(input: {
    chatJid: string
    phone?: string
    aiEnabled: boolean
    traceId?: string
  }): Promise<DialogState | null> {
    const data = await this.postEvent(
      {
        type: 'set_ai_enabled',
        chatJid: input.chatJid,
        phone: input.phone,
        aiEnabled: input.aiEnabled,
        source: 'gateway',
        takeoverReason: input.aiEnabled ? undefined : 'manual_api',
      },
      input.traceId,
    )

    if (!data) return null
    return {
      conversationId: readString(data.conversationId),
      aiEnabled: data.aiEnabled !== false,
      takeoverStatus: readString(data.takeoverStatus) ?? (input.aiEnabled ? 'none' : 'human'),
    }
  }

  async recordIncomingMessage(input: {
    chatJid: string
    phone?: string
    conversationId?: string
    messageId: string
    text: string
    timestamp: string
    contactName?: string
    traceId?: string
  }): Promise<void> {
    await this.postEvent(
      {
        type: 'incoming_message',
        chatJid: input.chatJid,
        phone: input.phone,
        conversationId: input.conversationId,
        messageId: input.messageId,
        text: input.text,
        timestamp: input.timestamp,
        contactName: input.contactName,
        traceId: input.traceId,
        source: 'human',
      },
      input.traceId,
    )
  }

  async reserveOutgoing(input: {
    idempotencyKey: string
    chatJid: string
    phone?: string
    source: 'gateway' | 'human' | 'ai'
    traceId?: string
  }): Promise<IdempotencyReservation> {
    const data = await this.postEvent(
      {
        type: 'reserve_outgoing',
        idempotencyKey: input.idempotencyKey,
        chatJid: input.chatJid,
        phone: input.phone,
        source: input.source,
      },
      input.traceId,
    )

    return {
      reserved: data?.reserved === true,
      status: readString(data?.status) ?? 'reserved',
      messageId: readString(data?.messageId),
      conversationId: readString(data?.conversationId),
    }
  }

  async completeOutgoing(input: {
    idempotencyKey: string
    messageId?: string
    text?: string
    chatJid?: string
    phone?: string
    traceId?: string
  }): Promise<void> {
    await this.postEvent(
      {
        type: 'complete_outgoing',
        idempotencyKey: input.idempotencyKey,
        messageId: input.messageId,
        text: input.text,
        chatJid: input.chatJid,
        phone: input.phone,
        source: 'gateway',
      },
      input.traceId,
    )
  }

  async recordSentOutgoing(input: {
    chatJid: string
    phone?: string
    messageId: string
    text: string
    source: 'gateway' | 'ai'
    traceId?: string
  }): Promise<void> {
    const idempotencyKey = `message:${input.messageId}`
    await this.reserveOutgoing({
      idempotencyKey,
      chatJid: input.chatJid,
      phone: input.phone,
      source: input.source,
      traceId: input.traceId,
    })
    await this.completeOutgoing({
      idempotencyKey,
      messageId: input.messageId,
      text: input.text,
      chatJid: input.chatJid,
      phone: input.phone,
      traceId: input.traceId,
    })
  }

  async failOutgoing(input: {
    idempotencyKey: string
    error: string
    traceId?: string
  }): Promise<void> {
    await this.postEvent(
      {
        type: 'fail_outgoing',
        idempotencyKey: input.idempotencyKey,
        error: input.error,
        source: 'gateway',
      },
      input.traceId,
    )
  }

  private async postEvent(payload: Record<string, unknown>, traceId?: string): Promise<Record<string, unknown> | null> {
    const startedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.min(this.config.AI_TIMEOUT_MS, 30000))
    timeout.unref?.()

    try {
      const response = await fetch(this.eventUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.WHATSAPP_EVENT_SECRET,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!response.ok) {
        this.logger.warn(
          { traceId, status: response.status, durationMs: Date.now() - startedAt, eventType: payload.type },
          'main project event failed',
        )
        return null
      }

      const body = await response.text()
      if (!body.trim()) return null
      if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('json')) return null
      try {
        return JSON.parse(body) as Record<string, unknown>
      } catch {
        this.logger.warn(
          { traceId, durationMs: Date.now() - startedAt, eventType: payload.type },
          'main project event response invalid json',
        )
        return null
      }
    } catch (error) {
      this.logger.warn(
        {
          traceId,
          durationMs: Date.now() - startedAt,
          eventType: payload.type,
          error: error instanceof Error ? error.message : String(error),
        },
        'main project event request failed',
      )
      return null
    } finally {
      clearTimeout(timeout)
    }
  }
}

function deriveEventUrl(replyUrl: string): string {
  const url = new URL(replyUrl)
  url.pathname = url.pathname.replace(/\/whatsapp-reply\/?$/, '/whatsapp-event')
  if (!url.pathname.endsWith('/whatsapp-event')) {
    url.pathname = '/api/internal/ai/whatsapp-event'
  }
  return url.toString()
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
