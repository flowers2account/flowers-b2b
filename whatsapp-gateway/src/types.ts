export type MessageDirection = 'incoming' | 'outgoing'
export type MessageSource = 'gateway' | 'human' | 'ai'

export type WhatsAppConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'logged_out'
  | 'error'

export interface IncomingMessage {
  whatsappId: string
  chatJid: string
  traceId?: string
  phone?: string
  senderPhone?: string
  contactName?: string
  messageId: string
  text: string
  timestamp: string
  direction: 'incoming'
  source?: MessageSource
  conversationId?: string
  aiEnabled?: boolean
  humanTakeover?: boolean
  campaignId?: string
  contactId?: string
}

export interface OutgoingMessage {
  whatsappId: string
  chatJid: string
  traceId?: string
  phone?: string
  text: string
  direction: 'outgoing'
  source?: MessageSource
  conversationId?: string
  aiEnabled?: boolean
  humanTakeover?: boolean
  campaignId?: string
  contactId?: string
}

export interface StoredMessage {
  whatsappId: string
  chatJid?: string
  phone?: string
  contactName?: string
  messageId: string
  text: string
  timestamp: string
  direction: MessageDirection
  source?: MessageSource
}

export interface MessageHandler {
  handleIncomingMessage(message: IncomingMessage): Promise<OutgoingMessage | null>
}
