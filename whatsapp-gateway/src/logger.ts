import pino from 'pino'
import type { AppConfig } from './config.js'

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL'>) {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: ['apiKey', 'WHATSAPP_API_KEY', '*.WHATSAPP_API_KEY', 'AI_API_KEY', '*.AI_API_KEY', 'auth', 'creds', 'keys'],
      remove: true,
    },
  })
}

export type AppLogger = ReturnType<typeof createLogger>
