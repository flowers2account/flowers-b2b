'use client'

import { useState } from 'react'
import type { PfCatalogItem } from '@/lib/pod-zakaz/types'
import { usePfDetail } from '@/lib/pod-zakaz/pf-detail-store'
import { usePfCart } from '@/lib/pod-zakaz/pf-cart-store'
import { stepPrice, unitPrice, stepLabel, maxSteps, tradingDayBadge } from '@/lib/pod-zakaz/format'
import { colorSwatch, colorLabel, isLightSwatch } from '@/lib/colors'

// Вёрстка по образцу StateDetail из src/components/catalog/DetailPanel.tsx (галерея/Row/степпер),
// но StateCart оттуда НЕ тащим — у pod-zakaz корзина уже отдельная выезжающая панель
// (PfCartPanel), не третье состояние этого стора. Товар резолвится по pf_offer_id из уже
// загруженного products[] (без нового запроса), стор pf-detail-store изолирован от
// detail-store.ts основного каталога (тот ключуется по products.id).
//
// У Proflowers цвет — одиночное поле на оффер (разные цвета = разные pf_offer_id), поэтому
// пикера цвета нет, только инфо-строка. Связку «тот же товар в других цветах» (соседние
// офферы) на этом этапе не делаем — надёжного ключа для связи нет (только совпадение имени),
// усложнять не будем; возможное улучшение на будущее, если Proflowers даст общий product-id.

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14,
      padding: '8px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-mid)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{children}</span>
    </div>
  )
}

function Stepper({ qty, max, isBoxOnly, onDec, onInc }: { qty: number; max: number; isBoxOnly?: boolean; onDec: () => void; onInc: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)',
      overflow: 'hidden', width: isBoxOnly ? 132 : 108,
    }}>
      <button
        onClick={onDec} disabled={qty === 0}
        style={{
          width: 32, height: 32, border: 'none', background: 'var(--bg2)', color: 'var(--accent)',
          fontSize: 15, fontWeight: 700, cursor: qty === 0 ? 'default' : 'pointer', opacity: qty === 0 ? 0.35 : 1,
        }}
      >−</button>
      <span style={{
        flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700,
        borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', lineHeight: '32px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4,
      }}>
        {qty}
        {isBoxOnly && <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-mid)' }}>кор.</span>}
      </span>
      <button
        onClick={onInc} disabled={qty >= max}
        style={{
          width: 32, height: 32, border: 'none', background: 'var(--bg2)', color: 'var(--accent)',
          fontSize: 15, fontWeight: 700, cursor: qty >= max ? 'default' : 'pointer', opacity: qty >= max ? 0.35 : 1,
        }}
      >+</button>
    </div>
  )
}

function StateEmpty() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: 32, gap: 14, color: 'var(--text-mid)',
    }}>
      <div style={{ fontSize: 56, opacity: 0.18, lineHeight: 1 }}>🌸</div>
      <p style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.6, maxWidth: 200, margin: 0 }}>
        Нажмите на карточку товара, чтобы увидеть подробности
      </p>
    </div>
  )
}

function StateDetail({ item, onClose, onOpenCart }: { item: PfCatalogItem; onClose: () => void; onOpenCart: () => void }) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const { items, setQty } = usePfCart()
  const cartItem = items.find(i => i.pfOfferId === item.pf_offer_id)
  const qty = cartItem?.qty ?? 0
  const max = maxSteps(item)
  const price = stepPrice(item)
  const label = stepLabel(item)
  const swatch = item.color_name ? colorSwatch(item.color_name) : null

  const photos = item.photos?.length ? item.photos : (item.image_url ? [item.image_url] : [])
  const mainPhoto = photos[photoIdx] ?? null

  function commitQty(next: number) {
    setQty({
      pfOfferId: item.pf_offer_id,
      name: item.name,
      imageUrl: item.image_url,
      colorName: item.color_name,
      isBoxOnly: item.is_box_only,
      stepLabel: label,
      stepPrice: price,
    }, next)
  }

  function handleAddToCart() {
    if (qty === 0) {
      commitQty(1)
      return
    }
    onOpenCart()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', fontSize: 20, lineHeight: 1, padding: 4 }}
        >×</button>
      </div>

      {/* Gallery */}
      <div style={{ flexShrink: 0, padding: '0 12px' }}>
        <div style={{ aspectRatio: '1/1', background: 'var(--bg2)', overflow: 'hidden', position: 'relative', borderRadius: 12 }}>
          {mainPhoto ? (
            // Обычный <img>, НЕ next/image — см. комментарий в PfProductCard.tsx (сервер
            // захлёбывался, оптимизируя чужие фото Proflowers через свой прокси).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mainPhoto}
              alt={item.name}
              loading="lazy"
              decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#A8A4AD', background: 'linear-gradient(150deg,#F1ECE8,#E6DED7)',
            }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" />
              </svg>
            </div>
          )}
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
              {photos.map((_, i) => (
                <div
                  key={i}
                  onClick={() => setPhotoIdx(i)}
                  style={{
                    width: i === photoIdx ? 16 : 6, height: 6, borderRadius: 3, background: '#fff',
                    opacity: i === photoIdx ? 0.95 : 0.45, cursor: 'pointer', transition: 'width 0.15s, opacity 0.15s',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 12px 16px' }}>
        <div style={{
          fontFamily: 'var(--font-golos)', fontSize: 14, fontWeight: 600, lineHeight: 1.35,
          color: 'var(--text)', marginBottom: 8,
        }}>
          {item.name}
        </div>

        {/* Плашка торгового дня — как на фото карточки в сетке */}
        <div style={{ marginBottom: 10 }}>
          <span style={{
            display: 'inline-block', background: 'var(--text)', color: '#fff',
            fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-btn)',
          }}>
            {tradingDayBadge(item)}
          </span>
        </div>

        <div style={{ marginBottom: 12 }}>
          {swatch && (
            <Row label="Цвет">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 14, height: 14, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                  background: swatch, border: `1px solid ${isLightSwatch(item.color_name!) ? '#D0D0D0' : 'rgba(0,0,0,0.15)'}`,
                }} />
                {colorLabel(item.color_name!)}
              </span>
            </Row>
          )}

          {item.characteristics && <Row label="Характеристики">{item.characteristics}</Row>}
          {item.country && <Row label="Страна">{item.country}</Row>}
          {item.nomenclature_name && <Row label="Категория">{item.nomenclature_name}</Row>}

          {item.is_box_only ? (
            <>
              <Row label="Цена за шт">{unitPrice(item).toLocaleString('ru-RU')} ₸</Row>
              <Row label="В коробке">{item.box_multiplicity} шт</Row>
              <Row label="Цена короба">
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  {price.toLocaleString('ru-RU')} ₸
                </span>
              </Row>
            </>
          ) : (
            <Row label="Цена">
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {price.toLocaleString('ru-RU')} ₸ / шт
              </span>
            </Row>
          )}

          <Row label="Наличие">
            {item.is_box_only
              ? `${Math.floor(item.count_left / (item.box_multiplicity || 1))} кор.`
              : `${item.count_left} шт`}
          </Row>
        </div>

        {/* Stepper + Cart */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Stepper
            qty={qty} max={max} isBoxOnly={item.is_box_only}
            onDec={() => commitQty(Math.max(0, qty - 1))} onInc={() => commitQty(Math.min(max, qty + 1))}
          />
          <button
            onClick={handleAddToCart}
            disabled={max === 0}
            style={{
              flex: 1, height: 36,
              background: max === 0 ? 'var(--bg2)' : 'var(--accent)',
              color: max === 0 ? 'var(--text-mid)' : '#fff',
              border: 'none', borderRadius: 'var(--radius-btn)',
              fontSize: 12, fontWeight: 600, cursor: max === 0 ? 'default' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {max === 0
              ? (item.is_box_only ? 'Меньше короба не осталось' : 'Нет в наличии')
              : qty === 0
                ? '+ В корзину'
                : item.is_box_only
                  ? `${qty} кор. (${qty * (item.box_multiplicity || 0)} шт) → ${(price * qty).toLocaleString('ru-RU')} ₸`
                  : `В корзину → ${(price * qty).toLocaleString('ru-RU')} ₸`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PfDetailPanel({ products, onOpenCart }: { products: PfCatalogItem[]; onOpenCart: () => void }) {
  const { pfOfferId, close } = usePfDetail()
  const item = pfOfferId != null ? products.find(p => p.pf_offer_id === pfOfferId) ?? null : null

  if (item) return <StateDetail key={item.pf_offer_id} item={item} onClose={close} onOpenCart={onOpenCart} />
  return <StateEmpty />
}
