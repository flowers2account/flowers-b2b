import { createClient } from '@/lib/supabase/client'

// Заголовок Authorization с access-токеном текущей сессии (для вызовов API,
// которые резолвят владельца из токена). Гость → пустой объект.
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}
