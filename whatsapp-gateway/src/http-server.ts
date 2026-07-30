import express, { type Request, type Response } from 'express'
import type { Server } from 'node:http'
import type { AppConfig } from './config.js'
import type { AppLogger } from './logger.js'
import type { WhatsAppClient } from './whatsapp-client.js'

interface SendMessageBody {
  phone?: unknown
  text?: unknown
  idempotency_key?: unknown
}

interface DialogAiBody {
  chatJid?: unknown
  phone?: unknown
  ai_enabled?: unknown
}

export class HttpServer {
  private server: Server | null = null

  constructor(
    private readonly config: AppConfig,
    private readonly whatsapp: WhatsAppClient,
    private readonly logger: AppLogger,
  ) {}

  start(): Promise<void> {
    const app = express()

    app.disable('x-powered-by')
    app.use(express.json({ limit: '16kb', strict: true }))

    app.get('/health', (_req: Request, res: Response) => {
      res.json(this.whatsapp.getHealth())
    })

    app.post('/messages/send', this.requireApiKey.bind(this), async (req: Request, res: Response) => {
      const body = req.body as SendMessageBody

      if (typeof body.phone !== 'string' || typeof body.text !== 'string' || typeof body.idempotency_key !== 'string') {
        res.status(400).json({ error: 'phone, text and idempotency_key are required strings' })
        return
      }

      if (body.text.trim().length === 0 || body.idempotency_key.trim().length === 0) {
        res.status(400).json({ error: 'text and idempotency_key must not be empty' })
        return
      }

      try {
        const result = await this.whatsapp.sendTextMessageWithIdempotency({
          phone: body.phone,
          text: body.text,
          idempotencyKey: body.idempotency_key,
        })
        res.json({ status: result.status ?? 'sent', messageId: result.messageId, duplicate: result.duplicate })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'send failed'
        const status = message.includes('connected') ? 503 : 400
        this.logger.warn({ error: message }, 'send endpoint failed')
        res.status(status).json({ error: message })
      }
    })

    app.post('/dialogs/ai', this.requireApiKey.bind(this), async (req: Request, res: Response) => {
      const body = req.body as DialogAiBody
      const chatJidOrPhone = typeof body.chatJid === 'string' ? body.chatJid : typeof body.phone === 'string' ? body.phone : ''

      if (!chatJidOrPhone || typeof body.ai_enabled !== 'boolean') {
        res.status(400).json({ error: 'chatJid or phone and ai_enabled are required' })
        return
      }

      try {
        await this.whatsapp.setAiEnabled(chatJidOrPhone, body.ai_enabled)
        res.json({ status: 'ok', aiEnabled: body.ai_enabled })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'update failed'
        this.logger.warn({ error: message }, 'dialog ai endpoint failed')
        res.status(400).json({ error: message })
      }
    })

    app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
      const message = error instanceof Error ? error.message : 'bad request'
      this.logger.warn({ error: message }, 'http request failed')
      res.status(400).json({ error: 'bad request' })
    })

    return new Promise((resolve) => {
      this.server = app.listen(this.config.PORT, this.config.HOST, () => {
        this.logger.info({ host: this.config.HOST, port: this.config.PORT }, 'http server listening')
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    if (!this.server) return Promise.resolve()

    return new Promise((resolve, reject) => {
      this.server?.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private requireApiKey(req: Request, res: Response, next: express.NextFunction): void {
    const provided = req.header('X-API-Key')

    if (!provided || provided !== this.config.AI_AGENT_SECRET) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    next()
  }
}
