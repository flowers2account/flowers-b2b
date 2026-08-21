// Telegram Bot API клиент для бота «Менеджер» — уведомления о WhatsApp Cloud API диалогах
// в группу + приём reply от менеджера. Нативный fetch, без зависимостей — как
// src/lib/dispatcher/telegram.ts, но отдельный токен/бот (см. TELEGRAM_MANAGER_BOT_TOKEN).

const TOKEN = process.env.TELEGRAM_MANAGER_BOT_TOKEN

function apiBase(): string {
  if (!TOKEN) throw new Error('TELEGRAM_MANAGER_BOT_TOKEN не задан')
  return `https://api.telegram.org/bot${TOKEN}`
}

export interface SendMessageResult {
  messageId?: number
}

/** Отправить текстовое сообщение в чат (группу). Возвращает telegram message_id для линковки. */
export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { replyToMessageId?: number } = {},
): Promise<SendMessageResult> {
  const res = await fetch(`${apiBase()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(opts.replyToMessageId ? { reply_to_message_id: opts.replyToMessageId } : {}),
    }),
  })

  const bodyText = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`telegram-manager sendMessage ${res.status}: ${bodyText.slice(0, 300)}`)
  }

  let parsed: { result?: { message_id?: number } } | null = null
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null
  } catch { /* без message_id — линковка просто не запишется */ }

  return { messageId: parsed?.result?.message_id }
}
