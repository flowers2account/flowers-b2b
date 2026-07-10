'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Package, Truck, ClipboardList, Bot, ArrowRight, ArrowDown, Check } from 'lucide-react'
import {
  CAMPAIGN, HERO_ROUTE, HERO_PERKS, CATALOG_GRID_ANCHOR_ID,
  type Campaign, type HeroCta, type PerkKey,
} from './hero-campaigns'
import styles from './HeroBanner.module.css'

const PERK_ICON: Record<PerkKey, React.ReactNode> = {
  assortment: <Package size={22} strokeWidth={1.7} />,
  trips: <Truck size={22} strokeWidth={1.7} />,
  stock: <ClipboardList size={22} strokeWidth={1.7} />,
  ai: <Bot size={22} strokeWidth={1.7} />,
}

// Тема кампании → CSS-переменные акцента на обёртке (по умолчанию — бордо из модуля).
function themeVars(c: Campaign): React.CSSProperties {
  const v: Record<string, string> = {}
  if (c.theme?.accent) v['--accent'] = c.theme.accent
  if (c.theme?.accentDeep) v['--accent-deep'] = c.theme.accentDeep
  return v as React.CSSProperties
}

// Плашка маршрута — общая для обеих страниц.
function RoutePlate() {
  return (
    <div className={styles.route}>
      <span className={styles.rt}>{HERO_ROUTE.label}</span>
      {HERO_ROUTE.legs.map((leg) => (
        <span key={leg.city} className={`${styles.leg}${leg.mid ? ` ${styles.legMid}` : ''}`}>
          {leg.arrow !== 'none' && <span className={styles.ar}>{leg.arrow === 'up' ? '↑' : '↓'}</span>}
          <b>{leg.city}</b>{'note' in leg && leg.note ? ` · ${leg.note}` : ''}
        </span>
      ))}
    </div>
  )
}

// Фон-фото (next/image) + читаемость-градиент + виньетка. Композиция фото не меняется.
function Photo({ src, withVignette }: { src: string; withVignette?: boolean }) {
  return (
    <>
      <div className={styles.photo}>
        <Image src={src} alt="" aria-hidden fill priority sizes="100vw" className={styles.img} />
      </div>
      <div className={styles.scrim} />
      {withVignette && <div className={styles.vig} />}
    </>
  )
}

function CtaIcon({ iconDown }: { iconDown?: boolean }) {
  return iconDown
    ? <ArrowDown size={16} strokeWidth={2.4} />
    : <ArrowRight size={16} strokeWidth={2.4} />
}

// Строка доверия под CTA (сильнее для B2B, чем ещё одна иконка).
function TrustLine({ text }: { text?: string }) {
  if (!text) return null
  return (
    <div className={styles.trust}>
      <Check size={15} strokeWidth={2.6} />
      <span>{text}</span>
    </div>
  )
}

export type HeroBannerProps = {
  variant: 'home' | 'catalog'
  campaign?: Campaign
  showPerks?: boolean
}

export default function HeroBanner({ variant, campaign = CAMPAIGN, showPerks }: HeroBannerProps) {
  const cta: HeroCta = variant === 'home' ? campaign.ctaHome : campaign.ctaCatalog
  const subtitle = variant === 'home' ? campaign.subtitleHome : campaign.subtitleCatalog

  // CTA каталога (iconDown, без href) — плавный скролл к сетке товаров.
  const scrollToGrid = () => {
    document.getElementById(CATALOG_GRID_ANCHOR_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const renderCta = (className: string) => {
    if (!cta) return null
    const inner = <>{cta.label}<CtaIcon iconDown={cta.iconDown} /></>
    return cta.href
      ? <Link href={cta.href} className={className}>{inner}</Link>
      : <button type="button" onClick={scrollToGrid} className={className}>{inner}</button>
  }

  if (variant === 'catalog') {
    return (
      <div className={styles.hb} style={themeVars(campaign)}>
        <div className={styles.catban}>
          <Photo src={campaign.image} />
          <RoutePlate />
          <div className={styles.cbContent}>
            <div className={styles.cbEyebrow}>{campaign.eyebrow}</div>
            <h2 className={styles.cbTitle}>{campaign.title} <span className={styles.it}>{campaign.titleAccent}</span></h2>
            <p className={styles.cbSub}>{subtitle}</p>
            {renderCta(styles.cbCta)}
            <TrustLine text={campaign.trustLine} />
          </div>
        </div>
      </div>
    )
  }

  // variant === 'home'
  return (
    <div className={styles.hb} style={themeVars(campaign)}>
      <section className={styles.promobanner}>
        <Photo src={campaign.image} withVignette />
        <RoutePlate />
        <div className={styles.pbContent}>
          <div className={styles.pbEyebrow}>{campaign.eyebrow}</div>
          <h2 className={styles.pbTitle}>{campaign.title}<br /><span className={styles.it}>{campaign.titleAccent}</span></h2>
          <p className={styles.pbSub}>{subtitle}</p>
          {cta && <div className={styles.pbActs}>{renderCta(styles.btn)}</div>}
          <TrustLine text={campaign.trustLine} />
          {campaign.finePrint && <p className={styles.pbFine}>{campaign.finePrint}</p>}
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
