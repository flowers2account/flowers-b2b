import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Header from '@/components/catalog/Header'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Цветы Уральска — оптовый прайс',
  description: 'B2B оптовый прайс-лист остатков',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={geist.className}>
        <Header />
        {children}
      </body>
    </html>
  )
}
