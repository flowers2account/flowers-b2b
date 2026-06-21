import { UmnicoConfig, UmnicoSendMessageRequest, UmnicoCheckContactRequest } from './types'

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

      const response = await fetch(`${this.baseUrl}/messaging/check-contact`, {
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

      return response.status === 200
    } catch (error) {
      console.error('Umnico checkContact error:', error)
      return false
    }
  }

  // Отправка КАРТИНКИ в WhatsApp по документированному формату Umnico:
  //   message.attachment = { type: 'photo', media: { type: <mime>, filename, src } }
  // src — ссылка на файл. Сначала пробуем публичный URL прямо в src; если Umnico вернёт
  // ошибку формата/URL — предварительно грузим файл через POST /messaging/upload и берём src.
  async sendImage(phone: string, imageUrl: string, caption?: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/[\s\+\-\(\)]/g, '')
      const noQuery = imageUrl.split('?')[0]
      const ext = (noQuery.split('.').pop() ?? 'jpg').toLowerCase()
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      const filename = noQuery.split('/').pop() || 'order.jpg'

      const post = (src: string) => fetch(`${this.baseUrl}/messaging/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `bearer ${this.apiToken}` },
        body: JSON.stringify({
          message: { text: caption ?? '', attachment: { type: 'photo', media: { type: mime, filename, src } } },
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
      const up = await fetch(`${this.baseUrl}/messaging/upload`, {
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

      const response = await fetch(`${this.baseUrl}/messaging/post`, {
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
        const error = await response.text()
        console.error('Umnico sendMessage failed:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Umnico sendMessage error:', error)
      return false
    }
  }
}

export const umnicoClient = new UmnicoClient({
  apiToken: process.env.UMNICO_API_TOKEN || '',
  whatsappSaId: parseInt(process.env.UMNICO_WHATSAPP_SA_ID || '0')
})
