import type { AppLogger } from './logger.js'
import type { StoredMessage } from './types.js'

export class InMemoryMessageStore {
  private readonly messages: StoredMessage[] = []

  constructor(
    private readonly logger: AppLogger,
    private readonly maxMessages = 1000,
  ) {}

  save(message: StoredMessage): void {
    this.messages.push(message)

    if (this.messages.length > this.maxMessages) {
      this.messages.splice(0, this.messages.length - this.maxMessages)
    }

    this.logger.info(
      {
        direction: message.direction,
        messageId: message.messageId,
        phone: message.phone ? maskPhone(message.phone) : undefined,
        chatJid: message.chatJid,
        textLength: message.text.length,
      },
      'message saved',
    )
  }

  list(): StoredMessage[] {
    return [...this.messages]
  }
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****'
  return `${phone.slice(0, 3)}******${phone.slice(-2)}`
}
