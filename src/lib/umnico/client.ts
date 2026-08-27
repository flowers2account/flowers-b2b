import { UmnicoConfig, UmnicoSendMessageRequest, UmnicoCheckContactRequest } from './types'
import { attachmentMetaFromUrl } from '@/lib/umnico'

const DEFAULT_TIMEOUT_MS = 15_000

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function responseSnippet(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  return text.replace(/\s+/g, ' ').trim().slice(0, 500)
}

class UmnicoClient {
  private baseUrl = 'https://api.umnico.com/v1.3'
  private apiToken: string
  private whatsappSaId: number

  constructor(config: UmnicoConfig) {
    this.apiToken = config.apiToken
    this.whatsappSaId = config.whatsappSaId
  }

  async checkContact(phone: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/[\s\+\-\(\)]/g, '')

      const response = await fetchWithTimeout(`${this.baseUrl}/messaging/check-contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `bearer ${this.apiToken}`
        },
        body: JSON.stringify({
          saId: this.whatsappSaId,
          chatId: cleanPhone
        } as UmnicoCheckContactRequest)
      })

      if (response.status === 200) return true
      if (response.status >= 500) {
        console.error('Umnico checkContact failed:', response.status, await responseSnippet(response))
      }
      return false
    } catch (error) {
      console.error('Umnico checkContact error:', error)
      return false
    }
  }

  // Отправка ФОТО/ФАЙЛА в WhatsApp по документированному формату Umnico:
  //   message.attachment = { type: 'photo'|'doc'|'video', media: { type: <mime>, filename, src } }
  // type/mime — по расширению файла (PDF → doc / application/pdf), см. attachmentMetaFromUrl.
  // src — ссылка на файл. Сначала пробуем публичный URL прямо в src; если Umnico вернёт
  // ошибку формата/URL — предварительно грузим файл через POST /messaging/upload и берём src.
  async sendImage(phone: string, imageUrl: string, caption?: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/[\s\+\-\(\)]/g, '')
      const { attachmentType, mime, filename } = attachmentMetaFromUrl(imageUrl, 'order.jpg')

      const post = (src: string) => fetchWithTimeout(`${this.baseUrl}/messaging/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `bearer ${this.apiToken}` },
        body: JSON.stringify({
          message: { text: caption ?? '', attachment: { type: attachmentType, media: { type: mime, filename, src } } },
          destination: cleanPhone,
          saId: this.whatsappSaId,
        }),
      })

      // 1) публичный URL прямо в src
      let res = await post(imageUrl)
      if (res.ok) { console.log('Umnico sendImage: отправлено по публичному URL (src)'); return true }
      console.error('Umnico sendImage (url-in-src) failed:', res.status, await res.text().catch(() => ''))

      // 2) фолбэк — предварительная загрузка файла → /messaging/upload → src
      const uploadedSrc = await this.uploadFile(imageUrl, filename, mime)
      if (!uploadedSrc) return false
      res = await post(uploadedSrc)
      if (!res.ok) {
        console.error('Umnico sendImage (uploaded src) failed:', res.status, await res.text().catch(() => ''))
        return false
      }
      console.log('Umnico sendImage: отправлено через upload (src)')
      return true
    } catch (error) {
      console.error('Umnico sendImage error:', error)
      return false
    }
  }

  // Предварительная загрузка файла в Umnico → возвращает src для attachment.
  // ⚠️ Формат upload доками v1.3 не детализирован → нужен живой тест (multipart file + saId).
  private async uploadFile(imageUrl: string, filename: string, mime: string): Promise<string | null> {
    try {
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) { console.error('uploadFile: не скачать картинку', imgRes.status); return null }
      const blob = await imgRes.blob()
      const fd = new FormData()
      fd.append('file', new File([blob], filename, { type: mime }))
      fd.append('saId', String(this.whatsappSaId))
      const up = await fetchWithTimeout(`${this.baseUrl}/messaging/upload`, {
        method: 'POST',
        headers: { 'Authorization': `bearer ${this.apiToken}` }, // Content-Type выставит FormData (boundary)
        body: fd,
      })
      if (!up.ok) { console.error('Umnico upload failed:', up.status, await up.text().catch(() => '')); return null }
      const d = await up.json().catch(() => null)
      const src = d?.src ?? d?.data?.src ?? d?.file?.src ?? null
      if (!src) console.error('Umnico upload: src не найден в ответе', JSON.stringify(d).slice(0, 200))
      return src
    } catch (e) {
      console.error('Umnico uploadFile error:', e)
      return null
    }
  }

  async sendMessage(phone: string, text: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/[\s\+\-\(\)]/g, '')

      const response = await fetchWithTimeout(`${this.baseUrl}/messaging/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `bearer ${this.apiToken}`
        },
        body: JSON.stringify({
          message: { text },
          destination: cleanPhone,
          saId: this.whatsappSaId
        } as UmnicoSendMessageRequest)
      })

      if (!response.ok) {
        console.error('Umnico sendMessage failed:', response.status, await responseSnippet(response))
        return false
      }

      return true
    } catch (error) {
      console.error('Umnico sendMessage error:', error instanceof Error ? error.message : error)
      return false
    }
  }
}

export const umnicoClient = new UmnicoClient({
  apiToken: process.env.UMNICO_API_TOKEN || '',
  whatsappSaId: parseInt(process.env.UMNICO_WHATSAPP_SA_ID || '0')
})

// ── Получатели уведомлений ПО ЗАКАЗАМ (вся цепочка статусов) ───────────────────
// UMNICO_MANAGER_PHONE — менеджер/владелец; UMNICO_WAREHOUSE_PHONE — кладовщик.
// Каждая переменная поддерживает несколько номеров через запятую. Дедуп по цифрам.
// Не-заказные уведомления (новый клиент, потерянный лид) кладовщику НЕ шлём — они
// продолжают использовать только UMNICO_MANAGER_PHONE напрямую.
//
// Кладовщик по умолчанию: серверный env на VPS правится вручную, а CI несёт только
// NEXT_PUBLIC_*. Пока UMNICO_WAREHOUSE_PHONE не задан в env VPS — используем фолбэк,
// чтобы кладовщик получал заказы автоматически. Заданный env всегда имеет приоритет.
const DEFAULT_WAREHOUSE_PHONE = '77780079630'

export function orderNotifyPhones(): string[] {
  const raw = [
    process.env.UMNICO_MANAGER_PHONE,
    process.env.UMNICO_WAREHOUSE_PHONE || DEFAULT_WAREHOUSE_PHONE,
  ].filter(Boolean).join(',')
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of raw.split(/[,;\s]+/)) {
    const phone = p.trim()
    if (!phone) continue
    const key = phone.replace(/[\s+\-()]/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key); out.push(phone)
  }
  return out
}

// Текст всем получателям заказов. checkContact + sendMessage по каждому; ошибки не валят.
export async function notifyOrderChain(text: string): Promise<boolean> {
  let attempted = 0
  let failed = 0
  for (const phone of orderNotifyPhones()) {
    try {
      const hasContact = await umnicoClient.checkContact(phone)
      if (!hasContact) {
        failed += 1
        console.error('notifyOrderChain skipped: contact not found or unavailable', phone)
        continue
      }
      attempted += 1
      if (!(await umnicoClient.sendMessage(phone, text))) failed += 1
    } catch (e) {
      failed += 1
      console.error('notifyOrderChain failed:', phone, e instanceof Error ? e.message : e)
    }
  }
  return attempted > 0 && failed === 0
}

// Картинка всем получателям заказов (для «собран» с фото; подпись = текст шаблона).
export async function notifyOrderChainImage(imageUrl: string, caption?: string): Promise<boolean> {
  let attempted = 0
  let failed = 0
  for (const phone of orderNotifyPhones()) {
    try {
      const hasContact = await umnicoClient.checkContact(phone)
      if (!hasContact) {
        failed += 1
        console.error('notifyOrderChainImage skipped: contact not found or unavailable', phone)
        continue
      }
      attempted += 1
      if (!(await umnicoClient.sendImage(phone, imageUrl, caption))) failed += 1
    } catch (e) {
      failed += 1
      console.error('notifyOrderChainImage failed:', phone, e instanceof Error ? e.message : e)
    }
  }
  return attempted > 0 && failed === 0
}
