'use client'

import { useMemo } from 'react'
import toast from 'react-hot-toast'
import type { PfCatalogItem } from '@/lib/pod-zakaz/types'
import { usePfCart } from '@/lib/pod-zakaz/pf-cart-store'
import { maxSteps } from '@/lib/pod-zakaz/format'
import { useIsMobile } from '@/lib/use-mobile'

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'

// Панель корзины «Под заказ» — визуально в духе detail-sheet из CatalogLayout (тот же приём:
// фиксированная панель + фон-оверлей, те же CSS-переменные), но своя, лёгкая: раздел не тянет
// весь трёхколоночный CatalogLayout (фильтры/detail-панель товара здесь не нужны — см. план).
export default function PfCartPanel({ onClose, products }: { onClose: () => void; products: PfCatalogItem[] }) {
  const { items, setQty, remove, clear, total } = usePfCart()
  const isMobile = useIsMobile()
  const byOffer = useMemo(() => new Map(products.map(p => [p.pf_offer_id, p])), [products])

  const count = items.reduce((s, i) => s + i.qty, 0)
  const sum = total()

  function handleCheckout() {
    // TODO: точка интеграции оформления (заявка в amoCRM/Telegram либо оплата) — обсудить
    // отдельно с владельцем. Отправка в Proflowers НЕ предусмотрена — это отдельная система.
    toast('Оформление скоро подключим — пока можно уточнить по WhatsApp/телефону из шапки сайта.')
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }} />
      <div style={{
        position: 'fixed', zIndex: 100,
        background: '#fff', display: 'flex', flexDirection: 'column',
        ...(isMobile
          ? { top: 104, left: 0, right: 0, bottom: 0, borderRadius: '16px 16px 0 0' }
          : { top: 0, bottom: 0, right: 0, width: 420, boxShadow: '-8px 0 24px rgba(0,0,0,0.12)' }),
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-golos)', fontWeight: 600, fontSize: 15 }}>
            Корзина «Под заказ» {count > 0 && <span style={{ color: 'var(--text-mid)', fontWeight: 400 }}>· {count}</span>}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-mid)', paddingTop: 48, fontSize: 13 }}>
              Пока пусто — добавьте товары из витрины.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map(it => {
                const live = byOffer.get(it.pfOfferId)
                const max = live ? maxSteps(live) : it.qty
                return (
                  <div key={it.pfOfferId} style={{
                    display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 10,
                    alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-light, var(--border))',
                  }}>
                    <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-card)', background: 'var(--accent-light)', overflow: 'hidden', flexShrink: 0 }}>
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : null}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, color: 'var(--text)' }}>{it.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 2 }}>
                        {fmt(it.stepPrice)} · {it.stepLabel}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', overflow: 'hidden' }}>
                          <button onClick={() => setQty(it, it.qty - 1)} style={{ width: 26, height: 26, border: 'none', background: 'var(--bg2)', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>−</button>
                          <span style={{ width: 28, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>{it.qty}</span>
                          <button onClick={() => setQty(it, Math.min(max, it.qty + 1))} disabled={it.qty >= max} style={{ width: 26, height: 26, border: 'none', background: 'var(--bg2)', color: 'var(--accent)', fontWeight: 700, cursor: it.qty >= max ? 'default' : 'pointer', opacity: it.qty >= max ? 0.35 : 1 }}>+</button>
                        </div>
                        <button onClick={() => remove(it.pfOfferId)} style={{ background: 'none', border: 'none', color: 'var(--text-mid)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>убрать</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                      {fmt(it.stepPrice * it.qty)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 10 }}>
              <span style={{ color: 'var(--text-mid)' }}>Итого</span>
              <span style={{ fontWeight: 700 }}>{fmt(sum)}</span>
            </div>
            <button
              onClick={handleCheckout}
              style={{
                width: '100%', height: 44, background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-btn)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Оформить заявку
            </button>
            <button
              onClick={clear}
              style={{
                width: '100%', marginTop: 8, background: 'none', border: 'none',
                color: 'var(--text-mid)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Очистить корзину
            </button>
          </div>
        )}
      </div>
    </>
  )
}
