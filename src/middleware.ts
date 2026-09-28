import { NextResponse, type NextRequest } from 'next/server'
import { hasValidCookie, POD_ZAKAZ_COOKIE } from '@/lib/pod-zakaz/access'

// Гейт по общему паролю на /pod-zakaz и /api/pod-zakaz/* — раздел не для клиентов, показ
// ограниченному кругу по ссылке (не воронка продаж). Остальной сайт не затрагивает: проверка
// строго по префиксу пути. /pod-zakaz/access и /api/pod-zakaz/auth исключены — иначе некуда
// было бы вводить пароль (замкнутый редирект).
const PUBLIC_POD_ZAKAZ_PATHS = new Set(['/pod-zakaz/access', '/api/pod-zakaz/auth'])

function isPodZakazPath(pathname: string): boolean {
  return pathname === '/pod-zakaz' || pathname.startsWith('/pod-zakaz/') || pathname.startsWith('/api/pod-zakaz/')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPodZakazPath(pathname) && !PUBLIC_POD_ZAKAZ_PATHS.has(pathname)) {
    const cookie = request.cookies.get(POD_ZAKAZ_COOKIE)?.value
    const authed = await hasValidCookie(cookie)
    if (!authed) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const url = new URL('/pod-zakaz/access', request.url)
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
