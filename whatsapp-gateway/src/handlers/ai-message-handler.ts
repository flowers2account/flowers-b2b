import type { AiAgentClient } from '../ai/ai-agent-client.js'
import { AiAgentError } from '../ai/ai-agent-client.js'
import type { AppLogger } from '../logger.js'
import type { IncomingMessage, MessageHandler, OutgoingMessage } from '../types.js'

const FALLBACK_TEXT = 'Не удалось обработать сообщение. Диалог передан менеджеру.'
const TIMEOUT_TEXT = 'Ответ занимает больше времени, чем обычно. Диалог передан менеджеру.'

export class AiMessageHandler implements MessageHandler {
  private readonly conversationByChatJid = new Map<string, string>()

  constructor(
    private readonly aiAgentClient: AiAgentClient,
    private readonly logger: AppLogger,
  ) {}

  async handleIncomingMessage(message: IncomingMessage): Promise<OutgoingMessage | null> {
    const startedAt = Date.now()
    const conversationId = message.conversationId ?? this.conversationByChatJid.get(message.chatJid)

    try {
      const reply = await this.aiAgentClient.generateReply({
        text: message.text,
        chatJid: message.chatJid,
        traceId: message.traceId,
        phone: message.phone ?? message.senderPhone,
        conversationId,
        contactName: message.contactName,
      })

      if (reply.conversationId) {
        this.conversationByChatJid.set(message.chatJid, reply.conversationId)
      }

      return {
        whatsappId: message.whatsappId,
        chatJid: message.chatJid,
        traceId: message.traceId,
        phone: message.phone ?? message.senderPhone,
        text: reply.text,
        direction: 'outgoing',
        source: 'ai',
        conversationId: reply.conversationId ?? conversationId,
        aiEnabled: true,
        humanTakeover: message.humanTakeover,
        campaignId: message.campaignId,
        contactId: message.contactId,
      }
    } catch (error) {
      const reason = error instanceof AiAgentError ? error.reason : 'ai_network_error'
      const isTimeout = reason === 'ai_timeout_gateway' || reason === 'ai_timeout_endpoint'
      const text = isTimeout ? TIMEOUT_TEXT : FALLBACK_TEXT

      this.logger.warn(
        {
          conversationId,
          traceId: message.traceId,
          reason,
          fallbackSource: 'gateway',
          durationMs: Date.now() - startedAt,
          inputTextLength: message.text.length,
          outputTextLength: text.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'ai handler fallback reply',
      )

      return {
        whatsappId: message.whatsappId,
        chatJid: message.chatJid,
        traceId: message.traceId,
        phone: message.phone ?? message.senderPhone,
        text,
        direction: 'outgoing',
        source: 'ai',
        conversationId,
        aiEnabled: true,
        humanTakeover: message.humanTakeover,
        campaignId: message.campaignId,
        contactId: message.contactId,
      }
    }
  }
}
