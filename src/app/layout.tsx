import { Analytics } from "@vercel/analytics/next"
import type { Metadata } from 'next'
import { Golos_Text, Playfair_Display, Cormorant_Garamond } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import Header from '@/components/catalog/Header'

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

        {/* Umnico chat widget */}
        <a
          href="https://umnico.com/?utm_source=widget&utm_medium=online_chat&utm_campaign=button"
          target="_blank"
          draggable={false}
          data-umnico-logo="true"
          style={{
            position: 'fixed', right: 38, bottom: 25, zIndex: 2147483646,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            paddingTop: 1, paddingBottom: 2,
            backgroundColor: 'rgba(227, 237, 243, 0.4)',
            borderRadius: 41, cursor: 'pointer',
          }}
        >
          <img
            draggable={false}
            src="https://umnico.com/assets/index/umnico1.svg"
            alt="Umnico logo"
            style={{ width: 45, height: 9 }}
          />
        </a>
        <div
          data-umnico-loader="true"
          style={{
            all: 'initial', position: 'fixed', right: 37, bottom: 9, zIndex: 2147483646,
            fontFamily: 'sans-serif', fontSize: 10, lineHeight: 1, fontWeight: 'bold',
            padding: '2px 4px 1px',
            backgroundColor: 'rgba(227, 237, 243, 0.4)',
            borderRadius: 41,
          } as React.CSSProperties}
        >
          Loading
        </div>
        <Script id="umnico-widget" strategy="lazyOnload">
          {`document.umnicoWidgetHash = '59018708dd7a418abf3e40cd543717d7';
var x = document.createElement('script');
x.src = 'https://umnico.com/assets/widget-loader.js';
x.type = 'text/javascript';
x.charset = 'UTF-8';
x.async = true;
document.body.appendChild(x);`}
        </Script>
      </body>
    </html>
  )
}
