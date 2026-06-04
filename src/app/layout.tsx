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
        <Script id="umnico-init" strategy="afterInteractive">{`
(function(){
  if(document.getElementById('umnico-app'))return;
  var g=typeof globalThis!=='undefined'?globalThis:typeof window!=='undefined'?window:typeof self!=='undefined'?self:global;
  g.SCRM_GLOBALS_PUBLIC_URL='https://umnico.com';
  g.document.umnicoWidgetHash='f3ed509085f6da0d5fb4fa5e40ec3156';
  var x=document.createElement('script');
  x.id='umnico-app';
  x.src='https://umnico.com/assets/manifest-umnico-app-c3542196967eb1750894.js';
  x.type='text/javascript';x.charset='UTF-8';x.defer=true;
  var z=document.createElement('script');
  z.src='https://umnico.com/assets/widgets-0be0ec429de4abf28951.js';
  z.type='text/javascript';z.charset='UTF-8';z.defer=true;
  document.body.appendChild(x);
  document.body.appendChild(z);
})();
        `}</Script>
      </body>
    </html>
  )
}
