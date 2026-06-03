import { Analytics } from "@vercel/analytics/next"
import type { Metadata } from 'next'
import { Golos_Text, Playfair_Display, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import Header from '@/components/catalog/Header'
import UmnicoWidget from '@/components/UmnicoWidget'

const golos = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-golos'
})

const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-playfair'
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant'
})

export const metadata: Metadata = {
  title: 'Цветы Уральска — оптовый прайс',
  description: 'B2B оптовый прайс-лист остатков',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${playfair.variable} ${cormorant.variable}`}>
      <body className="font-[family-name:var(--font-golos)]">
        <Header />
        {children}
        <UmnicoWidget />
      </body>
    </html>
  )
}
