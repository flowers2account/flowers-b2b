export interface AmoChatConfig {
  channelId: string
  channelCode: string
  secretKey: string
  scopeId?: string
  botId?: string
  baseUrl: string
}

export function getAmoChatConfig(required: boolean): AmoChatConfig | null {
  const channelId = readEnv('AMO_CHAT_CHANNEL_ID')
  const channelCode = readEnv('AMO_CHAT_CHANNEL_CODE')
  const secretKey = readEnv('AMO_CHAT_SECRET_KEY')
  const scopeId = readEnv('AMO_CHAT_SCOPE_ID')
  const botId = readEnv('AMO_CHAT_BOT_ID')
  const baseUrl = readEnv('AMO_CHAT_BASE_URL') ?? 'https://amojo.amocrm.ru'

  if (!channelId || !channelCode || !secretKey) {
    if (!required) return null
    throw new AmoChatConfigError('amo chat credentials are not configured')
  }

  return { channelId, channelCode, secretKey, scopeId, botId, baseUrl }
}

export function getRequiredAmoChatConfig(): AmoChatConfig {
  const config = getAmoChatConfig(true)
  if (!config) throw new AmoChatConfigError('amo chat credentials are not configured')
  return config
}

export class AmoChatConfigError extends Error {}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
