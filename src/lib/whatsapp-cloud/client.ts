// WhatsApp Cloud API (Meta) — низкоуровневая отправка текстовых сообщений.
// Аналог sendTextMessageToJid() из whatsapp-gateway/src/whatsapp-client.ts, только через
// Graph API вместо Baileys-сокета. Никакой оркестрации/idempotency здесь нет — это делает
// bridge.ts (recordSentOutgoing), как и у Baileys-клиента.

const DEFAULT_GRAPH_API_VERSION = 'v22.0'

export class WhatsAppCloudNotConfiguredError extends Error {
  constructor() {
    super('WhatsApp Cloud API не настроен: WHATSAPP_PHONE_NUMBER_ID и/или WHATSAPP_ACCESS_TOKEN не заданы')
    this.name = 'WhatsAppCloudNotConfiguredError'
  }
}

export interface SendTextResult {
  messageId?: string
}

/** phone — как в остальном пайплайне: только цифры, с кодом страны, без "+" (напр. "77476108458"). */
export async function sendTextMessage(phone: string, text: string): Promise<SendTextResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) throw new WhatsAppCloudNotConfiguredError()

  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_API_VERSION
  const to = phone.replace(/\D/g, '')

  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  const bodyText = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`whatsapp cloud send ${res.status}: ${bodyText.slice(0, 300)}`)
  }

  let parsed: { messages?: Array<{ id?: string }> } | null = null
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null
  } catch {
    // Успешный ответ без валидного JSON — считаем отправленным, но без messageId.
  }

  return { messageId: parsed?.messages?.[0]?.id }
}
