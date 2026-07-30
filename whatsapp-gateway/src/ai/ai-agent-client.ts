export type AiFailureReason =
  | 'ai_timeout_gateway'
  | 'ai_timeout_endpoint'
  | 'ai_null_response'
  | 'ai_business_fallback'
  | 'ai_network_error'
  | 'ai_invalid_response'
  | 'ai_auth_error'
  | 'ai_server_config_error'
  | 'ai_server_error'

export class AiAgentError extends Error {
  constructor(
    readonly reason: AiFailureReason,
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface AiAgentClient {
  generateReply(input: {
    text: string
    chatJid: string
    traceId?: string
    phone?: string
    conversationId?: string
    contactName?: string
  }): Promise<{
    text: string
    conversationId?: string
  }>
}
