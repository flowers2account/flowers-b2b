// Umnico API client (v1.3) — https://api.umnico.com
// Auth: header `Authorization: bearer <UMNICO_API_TOKEN>` (JWT из Настройки → API).

const UMNICO_BASE = 'https://api.umnico.com/v1.3'

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
 * Сам резолвит source (type='message') и подставляет userId бота.
 */
export async function sendMessage(leadId: string | number, text: string): Promise<boolean> {
  const sources = await getSources(leadId)
  const source = pickMessageSource(sources)
  if (!source) {
    console.error('[umnico] sendMessage: no source with type=message for lead', leadId)
    return false
  }

  const userId = process.env.UMNICO_BOT_USER_ID
  const body: Record<string, unknown> = {
    message: { text },
    source: source.realId,
  }
  if (userId) body.userId = userId

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
