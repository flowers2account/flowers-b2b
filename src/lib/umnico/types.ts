export interface UmnicoConfig {
  apiToken: string
  whatsappSaId: number
}

export interface UmnicoSendMessageRequest {
  message: {
    text: string
  }
  destination: string
  saId: number
}

export interface UmnicoCheckContactRequest {
  saId: number
  chatId: string
}
