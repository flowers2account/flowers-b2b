import { NextRequest, NextResponse } from 'next/server'
import { checkPassword, expectedCookieValue, POD_ZAKAZ_COOKIE, POD_ZAKAZ_COOKIE_MAX_AGE } from '@/lib/pod-zakaz/access'

export const dynamic = 'force-dynamic'

// Единственный путь под /api/pod-zakaz/*, открытый БЕЗ куки (см. middleware.ts) — иначе
// невозможно было бы её получить. Пароль общий на весь раздел, не привязан к клиенту/сессии.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!(await checkPassword(password))) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 })
  }

  const cookieValue = await expectedCookieValue()
  if (!cookieValue) {
    // POD_ZAKAZ_PASSWORD пуст — checkPassword выше уже вернул бы false для этого случая,
    // сюда дойти невозможно; страховка на случай будущих правок checkPassword.
    return NextResponse.json({ error: 'Раздел временно недоступен' }, { status: 503 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(POD_ZAKAZ_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: POD_ZAKAZ_COOKIE_MAX_AGE,
  })
  return res
}
