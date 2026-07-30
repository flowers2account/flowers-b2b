import type { AppConfig } from '../config.js'
import type { AppLogger } from '../logger.js'
import { AiAgentError, type AiAgentClient, type AiFailureReason } from './ai-agent-client.js'

interface AiReplyResponse {
  text?: unknown
  conversationId?: unknown
  reason?: unknown
  fallbackSource?: unknown
}

export class HttpAiAgentClient implements AiAgentClient {
  constructor(
    private readonly config: Pick<AppConfig, 'AI_AGENT_URL' | 'AI_AGENT_SECRET' | 'AI_TIMEOUT_MS'>,
    private readonly logger: AppLogger,
  ) {}

  async generateReply(input: {
    text: string
    chatJid: string
    traceId?: string
    phone?: string
    conversationId?: string
    contactName?: string
  }): Promise<{ text: string; conversationId?: string }> {
    const startedAt = Date.now()
    const inputTextLength = input.text.length

    this.logger.info(
      {
        durationMs: 0,
        traceId: input.traceId,
        conversationId: input.conversationId,
        inputTextLength,
      },
      'ai request started',
    )

    const controller = new AbortController()
    let didTimeout = false
    const timeout = setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, this.config.AI_TIMEOUT_MS)
    timeout.unref?.()

    try {
      const response = await fetch(this.config.AI_AGENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.AI_AGENT_SECRET,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new AiAgentError(reasonForStatus(response.status), `AI endpoint responded with status ${response.status}`, response.status)
      }

      let data: AiReplyResponse
      try {
        data = (await response.json()) as AiReplyResponse
      } catch {
        throw new AiAgentError('ai_invalid_response', 'AI endpoint returned invalid JSON', response.status)
      }

      const text = typeof data.text === 'string' ? data.text.trim() : ''
      const conversationId =
        typeof data.conversationId === 'string' && data.conversationId.trim()
          ? data.conversationId.trim()
          : undefined
      const reason = typeof data.reason === 'string' ? data.reason : undefined
      const fallbackSource = typeof data.fallbackSource === 'string' ? data.fallbackSource : undefined

      if (!text) {
        throw new AiAgentError('ai_invalid_response', 'AI endpoint returned empty text', response.status)
      }

      this.logger.info(
        {
          durationMs: Date.now() - startedAt,
          traceId: input.traceId,
          conversationId,
          reason,
          fallbackSource,
          inputTextLength,
          outputTextLength: text.length,
        },
        'ai response received',
      )

      return { text, conversationId }
    } catch (error) {
      const classified = classifyError(error, didTimeout)
      this.logger.error(
        {
          durationMs: Date.now() - startedAt,
          traceId: input.traceId,
          conversationId: input.conversationId,
          reason: classified.reason,
          fallbackSource: 'gateway',
          inputTextLength,
          outputTextLength: 0,
          error: classified.message,
        },
        'ai request failed',
      )
      throw classified
    } finally {
      clearTimeout(timeout)
    }
  }
}

function reasonForStatus(status: number): AiFailureReason {
  if (status === 504) return 'ai_timeout_endpoint'
  if (status === 401 || status === 403) return 'ai_auth_error'
  if (status === 503) return 'ai_server_config_error'
  if (status >= 500) return 'ai_server_error'
  return 'ai_invalid_response'
}

function classifyError(error: unknown, didTimeout: boolean): AiAgentError {
  if (error instanceof AiAgentError) return error

  if (isAbortError(error)) {
    return new AiAgentError(
      didTimeout ? 'ai_timeout_gateway' : 'ai_network_error',
      didTimeout ? 'AI request timed out in gateway' : 'AI request was aborted',
    )
  }

  return new AiAgentError(
    'ai_network_error',
    error instanceof Error ? error.message : 'AI network request failed',
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
