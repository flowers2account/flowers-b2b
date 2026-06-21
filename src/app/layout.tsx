import { Analytics } from "@vercel/analytics/next"
import type { Metadata } from 'next'
import { Golos_Text, Lora, JetBrains_Mono, Playfair_Display } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'
import Header from '@/components/catalog/Header'
import SiteFooter from '@/components/SiteFooter'
import FavoritesGate from '@/components/FavoritesGate'
import MobileTabBar from '@/components/MobileTabBar'
import AiWidget from '@/components/AiWidget'

const golos = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-golos'
})

const lora = Lora({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-serif'   // --font-serif = Lora
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains'
})

// Акцентный шрифт ТОЛЬКО для AI-виджета (шапка/цены/заголовки карточек).
// Каталог сайта остаётся на Lora (--font-serif).
const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-playfair'
})

export const metadata: Metadata = {
  metadataBase: new URL('https://uralskflowers.kz'),
  title: {
    default: '«Цветы Уральска» — всё для флориста и магазина | Уральск',
    template: '%s | Цветы Уральска',
  },
  description: 'Оптовая база флористических материалов и расходников в Уральске. Упаковка, ленты, грунты, горшки, удобрения — от производителей. Доставка по Казахстану.',
  openGraph: {
    siteName: 'Цветы Уральска',
    locale: 'ru_KZ',
    type: 'website',
  },
  alternates: {
    canonical: 'https://uralskflowers.kz',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${lora.variable} ${jetbrains.variable} ${playfair.variable}`}>
      <body className="font-[family-name:var(--font-golos)]">
        <Header />
        {children}
        <SiteFooter />
        <MobileTabBar />
        <FavoritesGate />
        {/* Нативный AI-виджет-консультант (заменил виджет Umnico на сайте). */}
        <AiWidget />
        <Toaster position="bottom-center" toastOptions={{ style: { fontSize: 13 } }} />
        <Analytics />
      </body>
    </html>
  )
}
