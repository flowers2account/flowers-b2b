import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Серверная авторизация API по Bearer-токену Supabase ───────────────────────
// Сессия живёт в localStorage (куки пустые), поэтому фронт шлёт access-token в
// заголовке Authorization. Сервер валидирует токен и резолвит владельца ИЗ него,
// игнорируя phone/clientId из тела/квери — это закрывает IDOR.

export type AuthedUser = { userId: string; phone: string | null }

function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

/** Валидирует токен, возвращает владельца ({userId, phone}) или null (→ 401). */
export async function getAuthedUser(req: NextRequest): Promise<AuthedUser | null> {
  const token = bearer(req)
  if (!token) return null

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) return null

  // email формируется как <digits>@flowers.local → телефон +<digits>
  let phone: string | null = null
  const local = (data.user.email ?? '').split('@')[0]
  if (/^\d{10,15}$/.test(local)) phone = '+' + local

  return { userId: data.user.id, phone }
}

/**
 * Supabase-клиент, привязанный к access-токену запроса (anon-ключ + Bearer).
 * Все запросы выполняются ОТ ИМЕНИ пользователя: работает RLS и `auth.uid()`
 * (нужно, чтобы триггер log_order_status_change писал changed_by сам).
 * Используется для мутаций оператора вместо service-role.
 */
export function sessionClient(req: NextRequest) {
  const token = bearer(req)
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

/** Как getAuthedUser, но дополнительно проверяет роль (profiles.role). */
export async function getAuthedWithRole(
  req: NextRequest,
  roles: string[],
): Promise<(AuthedUser & { role: string }) | null> {
  const authed = await getAuthedUser(req)
  if (!authed) return null
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('role').eq('id', authed.userId).maybeSingle()
  const role = (data?.role as string) ?? ''
  if (!roles.includes(role)) return null
  return { ...authed, role }
}
