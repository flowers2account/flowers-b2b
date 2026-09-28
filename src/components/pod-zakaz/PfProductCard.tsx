'use client'

import { useState } from 'react'
import type { PfCatalogItem } from '@/lib/pod-zakaz/types'
import { formatDeliveryDate, tradingDayLabel, stepPrice, maxSteps, stepLabel } from '@/lib/pod-zakaz/format'
import { colorSwatch, colorLabel, isLightSwatch } from '@/lib/colors'

// Визуальный клон GridCard (src/components/catalog/ProductGrid.tsx) — те же CSS-переменные
// и структура (фото/бейджи/тело/степпер), но без color-пикера, favorites и авторизационного
// гейта на цену: у Proflowers это отдельная, более простая сущность (один цвет на offer,
// цена видна всем). Corдняка со стором/стейтом основного каталога нет — см. pf-cart-store.ts.

type Props = {
  item: PfCatalogItem
  qty: number // в ступенях (см. stepUnits)
  onSetQty: (nextQty: number) => void
  onCardClick: () => void
}

export default function PfProductCard({ item, qty, onSetQty, onCardClick }: Props) {
  const [imgError, setImgError] = useState(false)
  const price = stepPrice(item)
  const max = maxSteps(item)
  const label = stepLabel(item)
  const dayLabel = tradingDayLabel(item.trading_day_type)
  const deliveryDate = formatDeliveryDate(item.trading_day_date)
  const swatch = item.color_name ? colorSwatch(item.color_name) : null

  return (
    <div
      onClick={onCardClick}
      style={{
        background: '#fff',
        border: `1px solid ${qty > 0 ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12,
        boxShadow: qty > 0 ? '0 0 0 1px var(--accent)' : 'none',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        cursor: 'pointer',
      }}
    >
      {/* Фото */}
      <div style={{ aspectRatio: '1 / 0.92', position: 'relative', background: 'var(--accent-light)', overflow: 'hidden' }}>
        {item.image_url && !imgError ? (
          // Обычный <img>, НЕ next/image: фото Proflowers (marketimg.proflowers.kz) шли через
          // наш сервер-оптимизатор — при 3000+ карточках CDN поставщика таймаутил
          // ("upstream image response timed out"), страница не открывалась. loading="lazy" —
          // браузер тянет только видимые, сервер эти фото вообще не трогает.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#A8A4AD',
            background: 'linear-gradient(150deg,#F1ECE8,#E6DED7)',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" />
            </svg>
          </div>
        )}

        {/* Плашка типа торгового дня + дата поставки — товар не на складе, приедет с поставкой */}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          background: 'rgba(33,26,30,0.82)', color: '#fff',
          fontSize: 10.5, fontWeight: 600, letterSpacing: '0.01em',
          padding: '3px 9px', borderRadius: 'var(--radius-btn)', backdropFilter: 'blur(4px)',
        }}>
          {dayLabel}{deliveryDate ? ` · поставка ${deliveryDate}` : ''}
        </span>

        {/* Остаток — «N шт в наличии», для коробочных «N кор. в наличии» */}
        <span style={{
          position: 'absolute', bottom: 8, left: 8,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(33,26,30,0.8)', color: '#fff',
          fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10.5, fontWeight: 500,
          padding: '3px 9px 3px 8px', borderRadius: 'var(--radius-btn)', backdropFilter: 'blur(4px)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#5ED39A', boxShadow: '0 0 0 2px rgba(94,211,154,0.25)', flexShrink: 0 }} />
          {item.is_box_only
            ? `${Math.floor(item.count_left / (item.box_multiplicity || 1))} кор. в наличии`
            : `${item.count_left} шт в наличии`}
        </span>
      </div>

      {/* Тело */}
      <div style={{ padding: '13px 14px 14px', display: 'flex', flexDirection: 'column', flex: 1, gap: 2 }}>
        <div style={{
          fontFamily: 'var(--font-golos)', fontSize: 13.5, fontWeight: 600,
          lineHeight: 1.32, color: 'var(--text)', minHeight: 36,
        }}>
          {item.name}
        </div>

        {/* Цвет — отдельная строка кружков, как в GridCard (у pf-оффера всегда один цвет) */}
        {swatch && (
          <div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <div title={colorLabel(item.color_name!)} style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              boxShadow: '0 0 0 1px var(--border) inset',
              background: swatch,
              border: `1px solid ${isLightSwatch(item.color_name!) ? '#D0D0D0' : 'rgba(0,0,0,0.1)'}`,
            }} />
          </div>
        )}

        {(item.characteristics || item.country) && (
          <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-mid)' }}>
            {[item.characteristics, item.country].filter(Boolean).join(' · ')}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-serif), serif', fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em' }}>
              {price.toLocaleString('ru-RU')} ₸
              {' '}<span style={{ fontFamily: 'var(--font-golos)', fontSize: 11, fontWeight: 500, color: 'var(--text-mid)' }}>
                / {item.is_box_only ? 'кор.' : 'шт'}
              </span>
            </span>
          </div>
          {(item.is_box_only || item.multiplicity > 1) && (
            <div style={{ fontSize: 10, color: 'var(--text-mid)', marginTop: 2 }}>{label}</div>
          )}

          {/* Степпер: шаг = 1 ступень (короб или кратность), max = maxSteps.
              stopPropagation — клик по степперу не должен открывать детальную панель. */}
          <div onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', alignItems: 'center',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)',
              overflow: 'hidden', marginTop: 8,
            }}>
              <button
                onClick={() => onSetQty(Math.max(0, qty - 1))}
                disabled={qty === 0}
                style={{
                  width: 42, height: 40, border: 'none',
                  background: 'var(--bg2)', color: 'var(--accent)',
                  fontSize: 18, fontWeight: 700, cursor: qty === 0 ? 'default' : 'pointer',
                  opacity: qty === 0 ? 0.35 : 1,
                }}
              >−</button>
              <span style={{
                flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700,
                padding: '6px 0', fontFamily: 'var(--font-jetbrains, monospace)',
                borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
              }}>
                {qty}
              </span>
              <button
                onClick={() => onSetQty(Math.min(max, qty + 1))}
                disabled={qty >= max}
                style={{
                  width: 42, height: 40, border: 'none',
                  background: 'var(--bg2)', color: 'var(--accent)',
                  fontSize: 18, fontWeight: 700, cursor: qty >= max ? 'default' : 'pointer',
                  opacity: qty >= max ? 0.35 : 1,
                }}
              >+</button>
            </div>
            {max === 0 && (
              <div style={{ marginTop: 6, fontSize: 10.5, color: '#C62828' }}>
                {item.is_box_only ? 'Меньше короба не осталось' : 'Нет в наличии'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
