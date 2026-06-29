'use client'

import { usePathname } from 'next/navigation'
import Header from '@/components/catalog/Header'
import SiteFooter from '@/components/SiteFooter'
import MobileTabBar from '@/components/MobileTabBar'
import FavoritesGate from '@/components/FavoritesGate'
import AiWidget from '@/components/AiWidget'

// Сайтовый chrome (шапка/навигация, футер, моб. таб-бар, AI-виджет) монтируется
// здесь, а не в корневом layout, чтобы можно было его НЕ рендерить на «киоск»-роутах.
// Пульт оператора /admin/console — автономный экран без сайтовой навигации и виджета.
function isKiosk(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith('/admin/console')
}

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isKiosk(pathname)) {
    // Киоск: только содержимое страницы, никакого сайтового chrome и AI-виджета.
    return <>{children}</>
  }

  return (
    <>
      <Header />
      {children}
      <SiteFooter />
      <MobileTabBar />
      <FavoritesGate />
      {/* Нативный AI-виджет-консультант (заменил виджет Umnico на сайте). */}
      <AiWidget />
    </>
  )
}
