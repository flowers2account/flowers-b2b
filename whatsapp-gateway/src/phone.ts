const WHATSAPP_PERSONAL_SUFFIX = '@s.whatsapp.net'
const WHATSAPP_LID_SUFFIX = '@lid'

export function normalizePhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '')

  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  if (digits.length >= 11 && digits.length <= 15) return digits

  throw new Error('Phone must include a country code and contain 11-15 digits')
}

export function phoneToJid(rawPhone: string): string {
  return `${normalizePhone(rawPhone)}${WHATSAPP_PERSONAL_SUFFIX}`
}

export function jidToPhone(jid: string): string {
  return jid.split('@')[0] ?? jid
}

export function jidToOptionalPhone(jid: string): string | undefined {
  if (!jid.endsWith(WHATSAPP_PERSONAL_SUFFIX)) return undefined
  return jidToPhone(jid)
}

export function isPersonalChatJid(jid: string): boolean {
  return jid.endsWith(WHATSAPP_PERSONAL_SUFFIX) || jid.endsWith(WHATSAPP_LID_SUFFIX)
}
