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

  async sendImage(phone: string, imageUrl: string, caption?: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/[\s\+\-\(\)]/g, '')

      const response = await fetch(`${this.baseUrl}/messaging/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `bearer ${this.apiToken}`
        },
        body: JSON.stringify({
          message: {
            type: 'image',
            imageUrl,
            text: caption || ''
          },
          destination: cleanPhone,
          saId: this.whatsappSaId
        })
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('Umnico sendImage failed:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Umnico sendImage error:', error)
      return false
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
