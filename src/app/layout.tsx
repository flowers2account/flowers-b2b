import { Analytics } from "@vercel/analytics/next"
import type { Metadata } from 'next'
import { Golos_Text, Playfair_Display, Cormorant_Garamond, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import Header from '@/components/catalog/Header'
import SiteFooter from '@/components/SiteFooter'

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

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains'
})

export const metadata: Metadata = {
  title: 'Цветы Уральска — оптовый прайс',
  description: 'B2B оптовый прайс-лист остатков',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${playfair.variable} ${cormorant.variable} ${jetbrains.variable}`}>
      <body className="font-[family-name:var(--font-golos)]">
        <Header />
        {children}
        <SiteFooter />
        <Script id="umnico-widget" strategy="afterInteractive">{`
(function(){
  if(document.querySelector('[data-umnico-logo]'))return;
  var a=document.createElement('a');
  a.href='https://umnico.com/?utm_source=widget&utm_medium=online_chat&utm_campaign=button';
  a.target='_blank';a.draggable=false;
  a.setAttribute('data-umnico-logo','true');
  a.setAttribute('style','position:fixed !important;right:38px !important;bottom:25px !important;z-index:2147483646 !important;display:flex !important;align-items:center !important;justify-content:center !important;padding-top:1px !important;padding-bottom:2px !important;background-color:rgba(227, 237, 243, 0.4) !important;border-radius:41px !important;cursor:pointer !important');
  var img=document.createElement('img');img.draggable=false;
  img.src='https://umnico.com/assets/index/umnico1.svg';img.alt='Umnico logo';
  img.setAttribute('style','width:45px !important;height:9px !important');
  a.appendChild(img);document.body.appendChild(a);
  var d=document.createElement('div');
  d.setAttribute('data-umnico-loader','true');
  d.setAttribute('style','all: initial;position:fixed !important;right:37px !important;bottom:9px !important;z-index:2147483646 !important;font-family:sans-serif !important;font-size:10px !important;line-height:1 !important;font-weight:bold !important;padding:2px 4px 1px !important;background-color:rgba(227, 237, 243, 0.4) !important;border-radius:41px !important');
  d.textContent='Loading';document.body.appendChild(d);
  document.umnicoWidgetHash='f3ed509085f6da0d5fb4fa5e40ec3156';
  var x=document.createElement('script');
  x.src='https://umnico.com/assets/widget-loader.js';x.type='text/javascript';x.charset='UTF-8';x.async=true;
  document.body.appendChild(x);
})();
        `}</Script>
      </body>
    </html>
  )
}
