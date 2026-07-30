import path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

loadDotenv()

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3025),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AUTH_STATE_DIR: z.string().min(1).optional(),
  WHATSAPP_AUTH_DIR: z.string().min(1).optional(),
  AI_AGENT_SECRET: z.string().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_EVENT_SECRET: z.string().optional(),
  WHATSAPP_AUTO_REPLY: z
    .string()
    .min(1)
    .default('Сообщение получено. Тестовый WhatsApp-коннектор работает.'),
  AI_ENABLED: z.enum(['true', 'false']).default('false'),
  AI_AGENT_URL: z.string().optional(),
  AI_ENDPOINT: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(70000),
  STALE_MESSAGE_MAX_AGE_MS: z.coerce.number().int().min(1000).max(86400000).default(300000),
})

type RawAppConfig = z.infer<typeof envSchema>

export type AppConfig = Omit<
  RawAppConfig,
  | 'AI_ENABLED'
  | 'AI_ENDPOINT'
  | 'AI_API_KEY'
  | 'AI_AGENT_URL'
  | 'AI_AGENT_SECRET'
  | 'AUTH_STATE_DIR'
  | 'WHATSAPP_AUTH_DIR'
  | 'WHATSAPP_API_KEY'
  | 'WHATSAPP_EVENT_SECRET'
> & {
  AI_ENABLED: boolean
  AI_AGENT_URL: string
  AI_AGENT_SECRET: string
  WHATSAPP_EVENT_SECRET: string
  AUTH_STATE_DIR: string
  resolvedAuthDir: string
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment: ${details}`)
  }

  if (parsed.data.HOST !== '127.0.0.1') {
    throw new Error('Invalid environment: HOST must be 127.0.0.1')
  }

  const authStateDir = parsed.data.AUTH_STATE_DIR ?? parsed.data.WHATSAPP_AUTH_DIR ?? 'auth'
  const aiEnabled = parsed.data.AI_ENABLED === 'true'
  const aiAgentUrl = parsed.data.AI_AGENT_URL ?? parsed.data.AI_ENDPOINT ?? 'http://127.0.0.1:3000/api/internal/ai/whatsapp-reply'
  const aiAgentSecret = (parsed.data.AI_AGENT_SECRET ?? parsed.data.AI_API_KEY ?? parsed.data.WHATSAPP_API_KEY ?? '').trim()
  const eventSecret = (parsed.data.WHATSAPP_EVENT_SECRET ?? '').trim()

  try {
    new URL(aiAgentUrl)
  } catch {
    throw new Error('Invalid environment: AI_AGENT_URL must be a valid URL')
  }

  if (!aiAgentSecret) {
    throw new Error('Invalid environment: AI_AGENT_SECRET is required')
  }

  if (!eventSecret) {
    throw new Error('Invalid environment: WHATSAPP_EVENT_SECRET is required')
  }

  return {
    PORT: parsed.data.PORT,
    HOST: parsed.data.HOST,
    LOG_LEVEL: parsed.data.LOG_LEVEL,
    WHATSAPP_AUTO_REPLY: parsed.data.WHATSAPP_AUTO_REPLY,
    AI_ENABLED: aiEnabled,
    AI_AGENT_URL: aiAgentUrl,
    AI_AGENT_SECRET: aiAgentSecret,
    WHATSAPP_EVENT_SECRET: eventSecret,
    AI_TIMEOUT_MS: parsed.data.AI_TIMEOUT_MS,
    STALE_MESSAGE_MAX_AGE_MS: parsed.data.STALE_MESSAGE_MAX_AGE_MS,
    AUTH_STATE_DIR: authStateDir,
    resolvedAuthDir: path.resolve(process.cwd(), authStateDir),
  }
}
