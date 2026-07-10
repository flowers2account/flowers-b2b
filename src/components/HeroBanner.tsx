'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Package, Truck, ClipboardList, Bot, ArrowRight, ArrowDown } from 'lucide-react'
import {
  HERO_ROUTE, HERO_PERKS, CATALOG_GRID_ANCHOR_ID,
  type HeroCta, type PerkKey,
} from './hero-banner-content'
import styles from './HeroBanner.module.css'

const HERO_IMG = '/images/hero-sklad.webp'

const PERK_ICON: Record<PerkKey, React.ReactNode> = {
  assortment: <Package size={22} strokeWidth={1.7} />,
  trips: <Truck size={22} strokeWidth={1.7} />,
  stock: <ClipboardList size={22} strokeWidth={1.7} />,
  ai: <Bot size={22} strokeWidth={1.7} />,
}

// Плашка маршрута — общая для обеих страниц.
function RoutePlate() {
  return (
    <div className={styles.route}>
      <span className={styles.rt}>{HERO_ROUTE.label}</span>
      {HERO_ROUTE.legs.map((leg) => (
        <span key={leg.city} className={`${styles.leg}${leg.mid ? ` ${styles.legMid}` : ''}`}>
          {leg.arrow && <span className={styles.ar}>↓</span>}
          <b>{leg.city}</b>{'note' in leg && leg.note ? ` · ${leg.note}` : ''}
        </span>
      ))}
    </div>
  )
}

// Фон-фото (next/image) + читаемость-градиент + виньетка. Композиция фото не меняется.
function Photo({ withVignette }: { withVignette?: boolean }) {
  return (
    <>
      <div className={styles.photo}>
        <Image
          src={HERO_IMG}
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className={styles.img}
        />
      </div>
      <div className={styles.scrim} />
      {withVignette && <div className={styles.vig} />}
    </>
  )
}

export type HeroBannerProps = {
  variant: 'home' | 'catalog'
  eyebrow: string
  title: string
  titleAccent: string
  subtitle: string
  cta?: HeroCta
  fine?: string
  showPerks?: boolean
}

export default function HeroBanner({
  variant, eyebrow, title, titleAccent, subtitle, cta, fine, showPerks,
}: HeroBannerProps) {
  // CTA каталога (iconDown, без href) — плавный скролл к сетке товаров.
  const scrollToGrid = () => {
    document.getElementById(CATALOG_GRID_ANCHOR_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (variant === 'catalog') {
    const cbInner = (
      <>
        <div className={styles.cbEyebrow}>{eyebrow}</div>
        <h2 className={styles.cbTitle}>{title} <span className={styles.it}>{titleAccent}</span></h2>
        <p className={styles.cbSub}>{subtitle}</p>
        {cta && (
          cta.href ? (
            <Link href={cta.href} className={styles.cbCta}>
              {cta.label}{cta.iconDown ? <ArrowDown size={16} strokeWidth={2.4} /> : <ArrowRight size={16} strokeWidth={2.4} />}
            </Link>
          ) : (
            <button type="button" onClick={scrollToGrid} className={styles.cbCta}>
              {cta.label}{cta.iconDown ? <ArrowDown size={16} strokeWidth={2.4} /> : <ArrowRight size={16} strokeWidth={2.4} />}
            </button>
          )
        )}
      </>
    )
    return (
      <div className={styles.hb}>
        <div className={styles.catban}>
          <Photo />
          <RoutePlate />
          <div className={styles.cbContent}>{cbInner}</div>
        </div>
      </div>
    )
  }

  // variant === 'home'
  return (
    <div className={styles.hb}>
      <section className={styles.promobanner}>
        <Photo withVignette />
        <RoutePlate />
        <div className={styles.pbContent}>
          <div className={styles.pbEyebrow}>{eyebrow}</div>
          <h2 className={styles.pbTitle}>{title}<br /><span className={styles.it}>{titleAccent}</span></h2>
          <p className={styles.pbSub}>{subtitle}</p>
          {cta && (
            <div className={styles.pbActs}>
              {cta.href ? (
                <Link href={cta.href} className={styles.btn}>
                  {cta.label}{cta.iconDown ? <ArrowDown size={16} strokeWidth={2.4} /> : <ArrowRight size={16} strokeWidth={2.4} />}
                </Link>
              ) : (
                <button type="button" onClick={scrollToGrid} className={styles.btn}>
                  {cta.label}{cta.iconDown ? <ArrowDown size={16} strokeWidth={2.4} /> : <ArrowRight size={16} strokeWidth={2.4} />}
                </button>
              )}
            </div>
          )}
          {fine && <p className={styles.pbFine}>{fine}</p>}
        </div>
      </section>

      {showPerks && (
        <div className={styles.pbPerks}>
          {HERO_PERKS.map((p) => (
            <div key={p.title} className={styles.pbPerk}>
              <span className={styles.ic}>{PERK_ICON[p.icon]}</span>
              <div>
                <div className={styles.pt}>{p.title}</div>
                <div className={styles.ps}>{p.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
