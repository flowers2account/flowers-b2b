import type { AppConfig } from '../config.js'
import type { IncomingMessage, MessageHandler, OutgoingMessage } from '../types.js'

export class TestAutoReplyHandler implements MessageHandler {
  constructor(private readonly config: Pick<AppConfig, 'WHATSAPP_AUTO_REPLY'>) {}

  async handleIncomingMessage(message: IncomingMessage): Promise<OutgoingMessage | null> {
    return {
      whatsappId: message.whatsappId,
      chatJid: message.chatJid,
      phone: message.phone,
      text: this.config.WHATSAPP_AUTO_REPLY,
      direction: 'outgoing',
      source: 'gateway',
      conversationId: message.conversationId,
      aiEnabled: false,
      humanTakeover: false,
      campaignId: message.campaignId,
      contactId: message.contactId,
    }
  }
}
