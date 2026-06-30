'use client'

import { usePathname } from 'next/navigation'
import Header from '@/components/catalog/Header'
import SiteFooter from '@/components/SiteFooter'
import MobileTabBar from '@/components/MobileTabBar'
import FavoritesGate from '@/components/FavoritesGate'
import AiWidget from '@/components/AiWidget'

// Сайтовый chrome (шапка/навигация, футер, моб. таб-бар, AI-виджет) монтируется
// здесь, а не в корневом layout, чтобы можно было его НЕ рендерить на автономных роутах:
//  • /admin/console — киоск-пульт оператора;
//  • /print/*       — печатные документы (накладная). Иначе подвал сайта (оферта, политика,
//    «с 2008 года» и т.п.) уходил в хвост печатного документа после подписей «Сдал/Принял».
function isBare(pathname: string | null): boolean {
  return !!pathname && (pathname.startsWith('/admin/console') || pathname.startsWith('/print'))
}

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isBare(pathname)) {
    // Только содержимое страницы: никакого сайтового chrome, футера и AI-виджета.
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
