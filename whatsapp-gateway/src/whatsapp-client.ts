import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type ConnectionState,
  type WASocket,
  type WAMessage,
  useMultiFileAuthState,
} from 'baileys'
import qrcode from 'qrcode-terminal'
import type { Boom } from '@hapi/boom'
import type { AppConfig } from './config.js'
import type { AppLogger } from './logger.js'
import { InMemoryMessageStore } from './message-store.js'
import { jidToOptionalPhone, jidToPhone, phoneToJid, isPersonalChatJid } from './phone.js'
import { ProcessedMessageStore } from './processed-messages.js'
import { MainProjectClient } from './main-project-client.js'
import type { IncomingMessage, MessageHandler, MessageSource, WhatsAppConnectionStatus } from './types.js'

interface SendResult {
  messageId?: string
}

type IgnoreReason =
  | 'missing_remote_jid'
  | 'missing_message_id'
  | 'from_me'
  | 'stub_message'
  | 'status'
  | 'group'
  | 'broadcast'
  | 'unsupported_jid'
  | 'empty_or_unsupported_text'
  | 'duplicate'
  | 'stale_message'
  | 'human_takeover'
  | 'gateway_outgoing'

interface IncomingParseResult {
  message: IncomingMessage | null
  reason?: IgnoreReason
  meta: IncomingLogMeta
}

interface IncomingLogMeta {
  traceId: string
  messageId?: string
  remoteJid?: string
  fromMe: boolean
  textLength: number
  messageType: string
}

export class WhatsAppClient {
  private socket: WASocket | null = null
  private status: WhatsAppConnectionStatus = 'idle'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shuttingDown = false
  private readonly processed = new ProcessedMessageStore()
  private readonly gatewayOutgoingMessageIds = new Set<string>()
  private readonly startedAt = Date.now()
  private lastIncomingMessageAt: string | null = null
  private lastOutgoingMessageAt: string | null = null

  constructor(
    private readonly config: AppConfig,
    private readonly handler: MessageHandler,
    private readonly messages: InMemoryMessageStore,
    private readonly mainProject: MainProjectClient,
    private readonly logger: AppLogger,
  ) {}

  getStatus(): WhatsAppConnectionStatus {
    return this.status
  }

  getHealth() {
    return {
      process: 'alive',
      whatsapp: this.status === 'connected' ? 'connected' : 'disconnected',
      whatsappStatus: this.status,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      lastIncomingMessageAt: this.lastIncomingMessageAt,
      lastOutgoingMessageAt: this.lastOutgoingMessageAt,
    }
  }

  async connect(): Promise<void> {
    this.shuttingDown = false
    this.setStatus('connecting')

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.config.resolvedAuthDir)
      const { version } = await fetchLatestBaileysVersion()

      const socket = makeWASocket({
        version,
        auth: state,
        logger: this.logger.child({ module: 'baileys' }),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        browser: ['Flowers B2B Gateway', 'Chrome', '1.0.0'],
      })

      this.socket = socket
      socket.ev.on('creds.update', saveCreds)
      socket.ev.on('connection.update', (update) => {
        void this.handleConnectionUpdate(update)
      })
      socket.ev.on('messages.upsert', (event) => {
        void this.handleMessages(event.messages ?? [])
      })
    } catch (error) {
      this.setStatus('error')
      this.logger.error({ error: safeErrorMessage(error) }, 'whatsapp connect failed')
      this.scheduleReconnect()
    }
  }

  async sendTextMessage(phone: string, text: string): Promise<SendResult> {
    if (!this.socket || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected')
    }

    const jid = phoneToJid(phone)
    return this.sendTextMessageToJid(jid, text, jidToPhone(jid), 'gateway')
  }

  async sendTextMessageWithIdempotency(input: {
    chatJid?: string
    phone: string
    text: string
    idempotencyKey: string
    source?: MessageSource
  }): Promise<SendResult & { duplicate: boolean; status?: string }> {
    const jid = input.chatJid ?? phoneToJid(input.phone)
    const phone = jidToOptionalPhone(jid) ?? input.phone
    const source = input.source ?? 'gateway'
    const reservation = await this.mainProject.reserveOutgoing({
      idempotencyKey: input.idempotencyKey,
      chatJid: jid,
      phone,
      source,
    })

    if (!reservation.reserved) {
      this.logger.info(
        { idempotencyKeyPresent: true, status: reservation.status, messageId: reservation.messageId },
        'outgoing message duplicate skipped',
      )
      return { messageId: reservation.messageId, duplicate: true, status: reservation.status }
    }

    try {
      const result = await this.sendTextMessageToJid(jid, input.text, phone, source)
      await this.mainProject.completeOutgoing({ idempotencyKey: input.idempotencyKey, messageId: result.messageId })
      return { ...result, duplicate: false, status: 'sent' }
    } catch (error) {
      await this.mainProject.failOutgoing({
        idempotencyKey: input.idempotencyKey,
        error: safeErrorMessage(error),
      })
      throw error
    }
  }

  async setAiEnabled(chatJidOrPhone: string, aiEnabled: boolean): Promise<void> {
    const chatJid = chatJidOrPhone.includes('@') ? chatJidOrPhone : phoneToJid(chatJidOrPhone)
    await this.mainProject.setAiEnabled({
      chatJid,
      phone: jidToOptionalPhone(chatJid),
      aiEnabled,
    })
  }

  private async sendTextMessageToJid(chatJid: string, text: string, phone?: string, source: MessageSource = 'gateway'): Promise<SendResult> {
    if (!this.socket || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected')
    }

    const result = await this.socket.sendMessage(chatJid, { text })
    const messageId = result?.key.id ?? `outgoing-${Date.now()}`
    this.gatewayOutgoingMessageIds.add(messageId)
    if (this.gatewayOutgoingMessageIds.size > 5000) {
      const oldest = this.gatewayOutgoingMessageIds.values().next().value
      if (oldest) this.gatewayOutgoingMessageIds.delete(oldest)
    }
    this.lastOutgoingMessageAt = new Date().toISOString()
    if (source === 'gateway' || source === 'ai') {
      void this.mainProject.recordSentOutgoing({
        chatJid,
        phone,
        messageId,
        source,
      })
    }

    this.messages.save({
      whatsappId: chatJid,
      chatJid,
      phone,
      messageId,
      text,
      timestamp: new Date().toISOString(),
      direction: 'outgoing',
      source,
    })

    return { messageId: result?.key.id ?? undefined }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const socket = this.socket
    this.socket = null

    if (socket) {
      try {
        socket.end(undefined)
      } catch (error) {
        this.logger.warn({ error: safeErrorMessage(error) }, 'whatsapp socket shutdown warning')
      }
    }

    this.setStatus('disconnected')
  }

  private async handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
    if (update.qr) {
      this.setStatus('qr')
      this.logger.info('QR generated')
      qrcode.generate(update.qr, { small: true })
    }

    if (update.connection === 'connecting') {
      this.setStatus('connecting')
    }

    if (update.connection === 'open') {
      this.setStatus('connected')
      this.logger.info('connected')
    }

    if (update.connection === 'close') {
      const reason = getDisconnectReason(update.lastDisconnect?.error)

      if (reason === DisconnectReason.loggedOut) {
        this.setStatus('logged_out')
        this.logger.warn('logged out')
        return
      }

      this.setStatus('disconnected')
      this.logger.warn({ reason }, 'disconnected')
      this.scheduleReconnect()
    }
  }

  private async handleMessages(messages: WAMessage[]): Promise<void> {
    for (const rawMessage of messages) {
      const parsed = this.toIncomingMessage(rawMessage)
      const incoming = parsed.message
      if (!incoming) {
        if (parsed.reason === 'from_me') {
          await this.handleFromMe(rawMessage, parsed.meta)
          continue
        }
        this.logger.info({ ...parsed.meta, reason: parsed.reason }, 'incoming message ignored')
        continue
      }

      const dedupeKey = `${incoming.whatsappId}:${incoming.messageId}`
      if (this.processed.hasSeen(dedupeKey)) {
        this.logger.info({ ...parsed.meta, reason: 'duplicate' }, 'incoming message ignored')
        continue
      }

      this.logger.info(parsed.meta, 'incoming message received')
      this.lastIncomingMessageAt = new Date().toISOString()

      const state = await this.mainProject.getDialogState({
        chatJid: incoming.chatJid,
        phone: incoming.phone,
        conversationId: incoming.conversationId,
        traceId: incoming.traceId,
      })
      if (state?.conversationId) incoming.conversationId = state.conversationId
      incoming.aiEnabled = state?.aiEnabled ?? true
      incoming.humanTakeover = incoming.aiEnabled === false || state?.takeoverStatus === 'human'

      void this.mainProject.recordIncomingMessage({
        chatJid: incoming.chatJid,
        phone: incoming.phone,
        conversationId: incoming.conversationId,
        messageId: incoming.messageId,
        text: incoming.text,
        timestamp: incoming.timestamp,
        contactName: incoming.contactName,
        traceId: incoming.traceId,
      })

      if (incoming.humanTakeover) {
        this.logger.info(
          {
            ...parsed.meta,
            reason: 'human_takeover',
            conversationId: incoming.conversationId,
            takeoverStatus: state?.takeoverStatus,
          },
          'incoming message ignored',
        )
        continue
      }

      this.messages.save({
        whatsappId: incoming.whatsappId,
        chatJid: incoming.chatJid,
        phone: incoming.phone,
        contactName: incoming.contactName,
        messageId: incoming.messageId,
        text: incoming.text,
        timestamp: incoming.timestamp,
        direction: incoming.direction,
        source: incoming.source,
      })

      let reply
      try {
        reply = await this.handler.handleIncomingMessage(incoming)
      } catch (error) {
        this.setStatus('error')
        this.logger.error({ traceId: incoming.traceId, error: safeErrorMessage(error), messageId: incoming.messageId }, 'handler failed')
        continue
      }

      if (!reply) {
        this.logger.info({ traceId: incoming.traceId, messageId: incoming.messageId, remoteJid: incoming.whatsappId }, 'handler returned null')
        continue
      }

      this.logger.info(
        { traceId: incoming.traceId, messageId: incoming.messageId, remoteJid: incoming.whatsappId, replyTextLength: reply.text.length },
        'handler returned reply',
      )

      try {
        const result = await this.sendTextMessageToJid(reply.chatJid, reply.text, reply.phone, reply.source ?? 'ai')
        this.logger.info(
          { traceId: incoming.traceId, messageId: incoming.messageId, remoteJid: incoming.whatsappId, outgoingMessageId: result.messageId },
          'auto reply sent',
        )
      } catch (error) {
        this.setStatus('error')
        this.logger.error(
          { traceId: incoming.traceId, error: safeErrorMessage(error), messageId: incoming.messageId, remoteJid: incoming.whatsappId },
          'auto reply send failed',
        )
      }
    }
  }

  private toIncomingMessage(rawMessage: WAMessage): IncomingParseResult {
    const remoteJid = rawMessage.key.remoteJid
    const messageId = rawMessage.key.id
    const meta = getIncomingLogMeta(rawMessage)

    if (!remoteJid) return { message: null, reason: 'missing_remote_jid', meta }
    if (!messageId) return { message: null, reason: 'missing_message_id', meta }
    if (rawMessage.key.fromMe) return { message: null, reason: 'from_me', meta }
    if (rawMessage.messageStubType) return { message: null, reason: 'stub_message', meta }
    if (isStaleMessage(rawMessage, this.config.STALE_MESSAGE_MAX_AGE_MS)) return { message: null, reason: 'stale_message', meta }
    if (remoteJid === 'status@broadcast') return { message: null, reason: 'status', meta }
    if (remoteJid.endsWith('@g.us')) return { message: null, reason: 'group', meta }
    if (remoteJid.endsWith('@broadcast')) return { message: null, reason: 'broadcast', meta }
    if (!isPersonalChatJid(remoteJid)) return { message: null, reason: 'unsupported_jid', meta }

    const text = extractText(rawMessage)
    if (!text) return { message: null, reason: 'empty_or_unsupported_text', meta }

    return {
      message: {
        whatsappId: remoteJid,
        chatJid: remoteJid,
        traceId: meta.traceId,
        phone: jidToOptionalPhone(remoteJid),
        senderPhone: jidToOptionalPhone(remoteJid),
        contactName: rawMessage.pushName ?? undefined,
        messageId,
        text,
        timestamp: messageTimestampToIso(rawMessage.messageTimestamp),
        direction: 'incoming',
        source: 'human',
        aiEnabled: true,
        humanTakeover: false,
      },
      meta: {
        ...meta,
        textLength: text.length,
      },
    }
  }

  private async handleFromMe(rawMessage: WAMessage, meta: IncomingLogMeta): Promise<void> {
    const remoteJid = rawMessage.key.remoteJid
    const messageId = rawMessage.key.id

    if (!remoteJid || !messageId) {
      this.logger.info({ ...meta, reason: !remoteJid ? 'missing_remote_jid' : 'missing_message_id' }, 'incoming message ignored')
      return
    }

    if (this.gatewayOutgoingMessageIds.has(messageId)) {
      this.logger.info({ ...meta, reason: 'gateway_outgoing' }, 'incoming message ignored')
      return
    }

    if (rawMessage.messageStubType) {
      this.logger.info({ ...meta, reason: 'stub_message' }, 'incoming message ignored')
      return
    }
    if (remoteJid === 'status@broadcast') {
      this.logger.info({ ...meta, reason: 'status' }, 'incoming message ignored')
      return
    }
    if (remoteJid.endsWith('@g.us')) {
      this.logger.info({ ...meta, reason: 'group' }, 'incoming message ignored')
      return
    }
    if (remoteJid.endsWith('@broadcast')) {
      this.logger.info({ ...meta, reason: 'broadcast' }, 'incoming message ignored')
      return
    }
    if (!isPersonalChatJid(remoteJid)) {
      this.logger.info({ ...meta, reason: 'unsupported_jid' }, 'incoming message ignored')
      return
    }
    if (isStaleMessage(rawMessage, this.config.STALE_MESSAGE_MAX_AGE_MS)) {
      this.logger.info({ ...meta, reason: 'stale_message' }, 'incoming message ignored')
      return
    }

    const state = await this.mainProject.recordManualOutgoing({
      chatJid: remoteJid,
      phone: jidToOptionalPhone(remoteJid),
      messageId,
      traceId: meta.traceId,
    })

    this.logger.info(
      {
        ...meta,
        source: 'human',
        conversationId: state?.conversationId,
        aiEnabled: state?.aiEnabled,
        takeoverStatus: state?.takeoverStatus,
      },
      state?.takeoverStatus === 'human' ? 'manual outgoing message recorded' : 'manual outgoing message ignored',
    )
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.status === 'logged_out') return
    if (this.reconnectTimer) return

    this.setStatus('reconnecting')
    this.logger.info('reconnecting')

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, 5000)
  }

  private setStatus(status: WhatsAppConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    this.logger.info({ status }, 'whatsapp status')
  }
}

function extractText(rawMessage: WAMessage): string | null {
  const message = rawMessage.message
  if (!message) return null

  const text =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.ephemeralMessage?.message?.conversation ??
    message.ephemeralMessage?.message?.extendedTextMessage?.text ??
    null

  const normalized = text?.trim()
  return normalized ? normalized : null
}

function getIncomingLogMeta(rawMessage: WAMessage): IncomingLogMeta {
  const text = extractText(rawMessage)

  return {
    traceId: createTraceId(),
    messageId: rawMessage.key.id ?? undefined,
    remoteJid: rawMessage.key.remoteJid ?? undefined,
    fromMe: Boolean(rawMessage.key.fromMe),
    textLength: text?.length ?? 0,
    messageType: getMessageType(rawMessage),
  }
}

function createTraceId(): string {
  return `wa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function getMessageType(rawMessage: WAMessage): string {
  const message = rawMessage.message
  if (!message) return 'empty'

  return Object.keys(message)[0] ?? 'unknown'
}

function messageTimestampToIso(timestamp: WAMessage['messageTimestamp']): string {
  if (!timestamp) return new Date().toISOString()

  if (typeof timestamp === 'number') {
    return new Date(timestamp * 1000).toISOString()
  }

  const maybeLong = timestamp as { toNumber?: () => number }
  if (typeof maybeLong.toNumber === 'function') {
    return new Date(maybeLong.toNumber() * 1000).toISOString()
  }

  return new Date().toISOString()
}

function messageTimestampToMs(timestamp: WAMessage['messageTimestamp']): number {
  if (!timestamp) return Date.now()
  if (typeof timestamp === 'number') return timestamp * 1000
  const maybeLong = timestamp as { toNumber?: () => number }
  if (typeof maybeLong.toNumber === 'function') return maybeLong.toNumber() * 1000
  return Date.now()
}

function isStaleMessage(rawMessage: WAMessage, maxAgeMs: number): boolean {
  return Date.now() - messageTimestampToMs(rawMessage.messageTimestamp) > maxAgeMs
}

function getDisconnectReason(error: unknown): number | undefined {
  return (error as Boom | undefined)?.output?.statusCode
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
