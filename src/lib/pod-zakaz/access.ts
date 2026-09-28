// Общий пароль на /pod-zakaz — показ ограниченному кругу по ссылке, не для клиентов.
// Кука хранит НЕ сам пароль, а его SHA-256 (сверяемая с env, без отдельного секрета для
// подписи — Web Crypto доступен и в Edge-мидлваре, и в обычном Node route handler).

export const POD_ZAKAZ_COOKIE = 'pz_auth'
export const POD_ZAKAZ_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 дней

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// null, если пароль не задан в env — вызывающий код должен трактовать это как «доступ закрыт
// для всех» (fail closed), не как «пароль не нужен».
export async function expectedCookieValue(): Promise<string | null> {
  const password = process.env.POD_ZAKAZ_PASSWORD
  if (!password) return null
  return sha256Hex(password)
}

export async function checkPassword(input: string): Promise<boolean> {
  const password = process.env.POD_ZAKAZ_PASSWORD
  if (!password || !input) return false
  return input === password
}

export async function hasValidCookie(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false
  const expected = await expectedCookieValue()
  return expected !== null && cookieValue === expected
}
