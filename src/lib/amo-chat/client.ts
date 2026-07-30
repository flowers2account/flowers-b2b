import { signAmoChatRequest } from './signature'

export interface AmoChatClientConfig {
  baseUrl: string
  secretKey: string
}

export interface AmoChatIncomingTextInput {
  scopeId: string
  conversationId: string
  messageId: string
  senderId: string
  senderName: string
  phone?: string
  text: string
  timestampMs: number
  silent?: boolean
}

export interface AmoChatSendResult {
  amoMessageId?: string
  amoConversationId?: string
  amoRefId?: string
}

interface AmoChatSendResponse {
  new_message?: {
    msgid?: unknown
    conversation_id?: unknown
    ref_id?: unknown
  }
}

export class AmoChatClient {
  constructor(private readonly config: AmoChatClientConfig) {}

  async sendIncomingText(input: AmoChatIncomingTextInput): Promise<AmoChatSendResult> {
    const path = `/v2/origin/custom/${encodeURIComponent(input.scopeId)}`
    const timestamp = Math.floor(input.timestampMs / 1000)
    const profile = input.phone ? { phone: input.phone } : undefined
    const body = JSON.stringify({
      event_type: 'new_message',
      payload: {
        timestamp,
        msec_timestamp: input.timestampMs,
        msgid: input.messageId,
        conversation_id: input.conversationId,
        sender: {
          id: input.senderId,
          name: input.senderName,
          ...(profile ? { profile } : {}),
        },
        message: {
          type: 'text',
          text: input.text,
        },
        silent: input.silent === true,
      },
    })

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: signAmoChatRequest({
        method: 'POST',
        path,
        body,
        secret: this.config.secretKey,
      }),
      body,
    })

    if (!response.ok) {
      const responseText = await response.text().catch(() => '')
      throw new Error(`amo chats api ${response.status}: ${responseText.slice(0, 200)}`)
    }

    const data = await response.json().catch(() => null) as AmoChatSendResponse | null
    const message = data?.new_message
    return {
      amoMessageId: typeof message?.msgid === 'string' ? message.msgid : undefined,
      amoConversationId: typeof message?.conversation_id === 'string' ? message.conversation_id : undefined,
      amoRefId: typeof message?.ref_id === 'string' ? message.ref_id : undefined,
    }
  }
}
