export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // Казахстан / Россия: 10 цифр без кода или 11 цифр с 7/8
  if (digits.length === 10) return '+7' + digits
  if (digits.length === 11 && digits.startsWith('8')) return '+7' + digits.slice(1)
  if (digits.length === 11 && digits.startsWith('7')) return '+' + digits
  // Международный номер (Беларусь +375, Украина +380 и т.д.) — сохраняем как есть
  if (digits.length >= 11) return '+' + digits
  return '+7' + digits
}
