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

// Тип вложения Umnico + MIME по расширению файла в URL/имени.
// attachment.type ∈ { photo, doc, video, mail } (api.umnico.com/docs → «Отправка сообщений»).
// Раньше тип/mime вычислялись всегда как photo/image-jpeg — PDF уходил как «фото» и падал.
export interface UmnicoAttachmentMeta {
  attachmentType: 'photo' | 'doc' | 'video'
  mime: string
  filename: string
}

const ATTACHMENT_BY_EXT: Record<string, { attachmentType: UmnicoAttachmentMeta['attachmentType']; mime: string }> = {
  pdf:  { attachmentType: 'doc',   mime: 'application/pdf' },
  jpg:  { attachmentType: 'photo', mime: 'image/jpeg' },
  jpeg: { attachmentType: 'photo', mime: 'image/jpeg' },
  png:  { attachmentType: 'photo', mime: 'image/png' },
  webp: { attachmentType: 'photo', mime: 'image/webp' },
  gif:  { attachmentType: 'photo', mime: 'image/gif' },
  mp4:  { attachmentType: 'video', mime: 'video/mp4' },
}

export function attachmentMetaFromUrl(fileUrl: string, fallbackName = 'file.jpg'): UmnicoAttachmentMeta {
  const clean = fileUrl.split('?')[0].split('#')[0]
  const base = clean.split('/').pop() || fallbackName
  const ext = (base.includes('.') ? base.split('.').pop()! : '').toLowerCase()
  const hit = ATTACHMENT_BY_EXT[ext] ?? { attachmentType: 'photo' as const, mime: 'image/jpeg' }
  const filename = base.includes('.') ? base : `${base}.${ext || 'jpg'}`
  return { attachmentType: hit.attachmentType, mime: hit.mime, filename }
}

/**
 * Загрузка файла в Umnico → Umnico-hosted src для attachment.media.src, либо null.
 * POST /messaging/upload (multipart: media=<файл>, source=<realId диалога>).
 * Нужна, когда внутренний WhatsApp-гейт Umnico не может сам скачать файл по нашему
 * публичному URL: наблюдалось 500 «Internal Server Error» на /messaging/{leadId}/send
 * с src=https://uralskflowers.kz/... (и PDF, и JPG). Механизм-образец — uploadFile в
 * src/lib/umnico/client.ts (используется в проде для карточек товаров/уведомлений).
 * ⚠️ Формат upload доками v1.3 детализирован не полностью (api.umnico.com/docs →
 * «Отправка сообщений»): поле файла — `media`, идентификатор — `source` XOR `saId`
 * (для потока «Отправка сообщения» — source). Лимит по размеру не документирован.
 */
interface UmnicoUploadResponse {
  src?: string
  media?: { src?: string }
  data?: { src?: string; media?: { src?: string } }
  file?: { src?: string }
}

async function uploadFileToUmnico(
  fileUrl: string,
  filename: string,
  mime: string,
  sourceRealId: string | number,
): Promise<string | null> {
  try {
    const fileRes = await fetch(fileUrl)
    if (!fileRes.ok) {
      console.error('[umnico] upload: не скачать файл', fileRes.status, fileUrl)
      return null
    }
    const blob = await fileRes.blob()

    const token = process.env.UMNICO_API_TOKEN
    if (!token) throw new Error('UMNICO_API_TOKEN not set')

    const fd = new FormData()
    fd.append('media', new File([blob], filename, { type: mime }))
    fd.append('source', String(sourceRealId))

    const up = await fetch(`${UMNICO_BASE}/messaging/upload`, {
      method: 'POST',
      headers: { Authorization: `bearer ${token}` }, // Content-Type (multipart boundary) выставит FormData
      body: fd,
    })
    if (!up.ok) {
      console.error('[umnico] upload failed:', up.status, await up.text().catch(() => ''))
      return null
    }
    const d = (await up.json().catch(() => null)) as UmnicoUploadResponse | null
    const src: string | null =
      d?.media?.src ?? d?.src ?? d?.data?.src ?? d?.data?.media?.src ?? d?.file?.src ?? null
    if (!src) console.error('[umnico] upload: src не найден в ответе', JSON.stringify(d).slice(0, 300))
    return src
  } catch (e) {
    console.error('[umnico] upload error:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * POST /messaging/{leadId}/send — отправить ФОТО/ФАЙЛ в чат лида отдельным сообщением.
 *
 * Форма media зависит от канала (api.umnico.com/docs → «Отправка сообщений»):
 *   WhatsApp:            attachment.media = { type: <mime>, filename, src }
 *   onlinechat / others: attachment.media = { path, name, mime }   (живой тест 21.06.2026)
 * channelType (поле sa.type из вебхука Umnico) выбирает форму; по умолчанию — onlinechat.
 * message.text шлётся ВСЕГДА (пустая строка без caption): whatsapp2 без него → 422.
 * attachment.type/mime — по расширению файла (PDF → doc / application/pdf).
 *
 * WhatsApp: если отправка по прямому URL (src=наш публичный адрес) вернула ЛЮБУЮ
 * ошибку (400/422/500 — гейт Umnico не скачивает файл сам), делаем POST
 * /messaging/upload и повторяем отправку с Umnico-hosted src. Для onlinechat
 * фолбэка нет — там прямой path работает.
 */
export async function sendPhoto(
  leadId: string | number,
  fileUrl: string,
  caption?: string,
  source?: UmnicoSource,
  channelType?: string,
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
  const t: UmnicoSource = target

  const { attachmentType, mime, filename } = attachmentMetaFromUrl(fileUrl)
  const isWhatsApp = /whatsapp/i.test(channelType ?? '')
  const userIdRaw = process.env.UMNICO_BOT_USER_ID

  const send = (media: Record<string, unknown>): Promise<Response> => {
    const body: Record<string, unknown> = {
      message: { text: caption?.trim() || '', attachment: { type: attachmentType, media } },
      source: toNum(t.realId),
    }
    if (userIdRaw) body.userId = toNum(userIdRaw)
    return fetch(`${UMNICO_BASE}/messaging/${leadId}/send`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
  }

  // 1) прямой URL в src (WhatsApp) / path (onlinechat)
  let res = await send(
    isWhatsApp ? { type: mime, filename, src: fileUrl } : { path: fileUrl, name: filename, mime },
  )
  if (res.ok) return true
  console.error('[umnico] sendPhoto (url) failed:', res.status, await res.text().catch(() => ''))
  if (!isWhatsApp) return false

  // 2) фолбэк (только WhatsApp): грузим файл в Umnico и шлём с их src
  const uploadedSrc = await uploadFileToUmnico(fileUrl, filename, mime, t.realId)
  if (!uploadedSrc) return false

  res = await send({ type: mime, filename, src: uploadedSrc })
  if (!res.ok) {
    console.error('[umnico] sendPhoto (uploaded src) failed:', res.status, await res.text().catch(() => ''))
    return false
  }
  console.log('[umnico] sendPhoto: отправлено через upload')
  return true
}

// ── История диалога (контекст для бота) ──────────────────────────────────────

export interface DialogMessage {
  role: 'client' | 'bot' | 'manager'
  text: string
  /** Момент сообщения (epoch ms), если Umnico вернул datetime. Нужен catch-up-
   *  проверке «давности последнего сообщения» (laps-catchup.ts). */
  ts?: number
}

// datetime из истории Umnico бывает числом (epoch ms) или ISO-строкой.
function toEpochMs(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Date.parse(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
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

      const ts = toEpochMs(
        m.datetime ?? m.createdAt ?? m.created_at ?? m.timestamp ?? inner.datetime ?? inner.timestamp,
      )
      parsed.push(ts !== undefined ? { role, text, ts } : { role, text })
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
