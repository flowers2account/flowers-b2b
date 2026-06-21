// Umnico API client (v1.3) — https://api.umnico.com
// Auth: header `Authorization: bearer <UMNICO_API_TOKEN>` (JWT из Настройки → API).

const UMNICO_BASE = 'https://api.umnico.com/v1.3'

/** Приводит числовую строку к number (Umnico требует integer); нечисловое отдаёт как есть. */
function toNum(v: string | number): number | string {
  const n = Number(v)
  return Number.isFinite(n) ? n : v
}

function authHeaders(): HeadersInit {
  const token = process.env.UMNICO_API_TOKEN
  if (!token) throw new Error('UMNICO_API_TOKEN not set')
  return {
    'Authorization': `bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export interface UmnicoSource {
  realId: number | string
  type: string
  [k: string]: unknown
}

/** GET /messaging/{leadId}/sources — список каналов лида. */
export async function getSources(leadId: string | number): Promise<UmnicoSource[]> {
  const res = await fetch(`${UMNICO_BASE}/messaging/${leadId}/sources`, {
    method: 'GET',
    headers: authHeaders(),
  })
  if (!res.ok) {
    console.error('[umnico] getSources failed:', res.status, await res.text().catch(() => ''))
    return []
  }
  const data = await res.json().catch(() => null)
  // API может вернуть { data: [...] } либо массив напрямую
  const list = Array.isArray(data) ? data : (data?.data ?? data?.sources ?? [])
  return Array.isArray(list) ? (list as UmnicoSource[]) : []
}

/** Выбрать source с type='message' (через него отвечаем клиенту). */
export function pickMessageSource(sources: UmnicoSource[]): UmnicoSource | null {
  return sources.find((s) => s.type === 'message') ?? null
}

/**
 * POST /messaging/{leadId}/send — отправить текст в чат лида.
 * Если source (type='message') пришёл в вебхуке — используем его и не дёргаем
 * GET /sources. Иначе резолвим сами. Подставляет userId бота.
 */
export async function sendMessage(
  leadId: string | number,
  text: string,
  source?: UmnicoSource,
): Promise<boolean> {
  let target = source && source.type === 'message' ? source : null
  if (!target) {
    const sources = await getSources(leadId)
    target = pickMessageSource(sources)
  }
  if (!target) {
    console.error('[umnico] sendMessage: no source with type=message for lead', leadId)
    return false
  }

  // Umnico ждёт integer в body.userId/source — env и payload приходят строками.
  const body: Record<string, unknown> = {
    message: { text },
    source: toNum(target.realId),
  }
  const userIdRaw = process.env.UMNICO_BOT_USER_ID
  if (userIdRaw) body.userId = toNum(userIdRaw)

  const res = await fetch(`${UMNICO_BASE}/messaging/${leadId}/send`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error('[umnico] sendMessage failed:', res.status, await res.text().catch(() => ''))
    return false
  }
  return true
}

/**
 * POST /messaging/{leadId}/send — отправить ФОТО в чат лида (отдельным сообщением).
 * Формат вложения по докам Umnico (umnico.com/messaging-api):
 *   { message: { text?, attachment: { media: { url }, type: 'photo' } }, source, userId }
 * В доке у media есть ещё `id` (для пересылки ПОЛУЧЕННЫХ медиа) — при отправке своего фото
 * по URL шлём только media.url. ⚠️ Формат не на 100% подтверждён доками v1.3 → нужен живой тест.
 */
export async function sendPhoto(
  leadId: string | number,
  imageUrl: string,
  caption?: string,
  source?: UmnicoSource,
): Promise<boolean> {
  let target = source && source.type === 'message' ? source : null
  if (!target) {
    const sources = await getSources(leadId)
    target = pickMessageSource(sources)
  }
  if (!target) {
    console.error('[umnico] sendPhoto: no source with type=message for lead', leadId)
    return false
  }

  const message: Record<string, unknown> = {
    attachment: { media: { url: imageUrl }, type: 'photo' },
  }
  if (caption && caption.trim()) message.text = caption.trim()

  const body: Record<string, unknown> = { message, source: toNum(target.realId) }
  const userIdRaw = process.env.UMNICO_BOT_USER_ID
  if (userIdRaw) body.userId = toNum(userIdRaw)

  const res = await fetch(`${UMNICO_BASE}/messaging/${leadId}/send`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error('[umnico] sendPhoto failed:', res.status, await res.text().catch(() => ''))
    return false
  }
  return true
}

// ── История диалога (контекст для бота) ──────────────────────────────────────

export interface DialogMessage {
  role: 'client' | 'bot' | 'manager'
  text: string
}

/**
 * Последние сообщения диалога для контекста бота.
 * POST /messaging/{leadId}/history/{realId} (первый запрос без cursor).
 * Роли: incoming → client; sender/userId === UMNICO_BOT_USER_ID → bot; иначе manager.
 * `excludeMessageId` — текущее входящее (идёт в конвейер отдельно).
 * Любая ошибка/таймаут → [] (конвейер продолжает без контекста).
 */
export async function fetchDialogContext(
  leadId: string | number,
  realId: string | number,
  opts: { excludeMessageId?: string | number; limit?: number } = {},
): Promise<DialogMessage[]> {
  const limit = opts.limit ?? 10
  try {
    const res = await fetch(`${UMNICO_BASE}/messaging/${leadId}/history/${realId}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}), // первый запрос — без cursor
    })
    if (!res.ok) {
      console.error('[umnico] history HTTP error:', res.status, await res.text().catch(() => ''))
      console.log('[umnico] history: failed, continue without')
      return []
    }
    const data = await res.json().catch(() => null)
    const raw = Array.isArray(data)
      ? data
      : ((data?.data ?? data?.messages ?? data?.history ?? data?.items ?? []) as unknown)
    if (!Array.isArray(raw)) return []

    const botUserId = process.env.UMNICO_BOT_USER_ID
    const parsed: DialogMessage[] = []
    for (const m of raw as Array<Record<string, unknown>>) {
      const id = m.messageId ?? m.id
      if (opts.excludeMessageId !== undefined && id !== undefined && String(id) === String(opts.excludeMessageId)) {
        continue
      }
      const inner = (m.message ?? m) as Record<string, unknown>
      const rawText = (inner.text ?? m.text ?? m.body) as unknown
      const text = typeof rawText === 'string' ? rawText.trim() : ''
      if (!text) continue // вложения без текста пропускаем

      const incoming = m.incoming === true || m.direction === 'incoming'
      const sender = m.userId ?? m.sender ?? m.user_id ?? m.managerId ?? m.employeeId
      let role: DialogMessage['role']
      if (incoming) role = 'client'
      else if (botUserId && sender !== undefined && String(sender) === String(botUserId)) role = 'bot'
      else role = 'manager'

      parsed.push({ role, text })
    }

    // История пагинируется cursor'ом → первая страница = самые свежие (newest-first).
    // Берём последние `limit` и разворачиваем в хронологический порядок (старые→новые).
    return parsed.slice(0, limit).reverse()
  } catch (err) {
    console.error('[umnico] history error:', (err as Error)?.message)
    console.log('[umnico] history: failed, continue without')
    return []
  }
}

/** POST /tags/{leadId}/{tag} — повесить тег на лид (напр. "отвечено-ботом"). Неблокирующе. */
export async function addTag(leadId: string | number, tag: string): Promise<void> {
  try {
    const res = await fetch(`${UMNICO_BASE}/tags/${leadId}/${encodeURIComponent(tag)}`, {
      method: 'POST',
      headers: authHeaders(),
    })
    if (!res.ok) {
      console.error('[umnico] addTag failed:', res.status, await res.text().catch(() => ''))
    }
  } catch (err) {
    console.error('[umnico] addTag error:', err)
  }
}
