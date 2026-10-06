'use client'

import { useMemo, useState } from 'react'
import type { PfCatalogItem } from '@/lib/pod-zakaz/types'
import { usePfCart } from '@/lib/pod-zakaz/pf-cart-store'
import { maxSteps } from '@/lib/pod-zakaz/format'
import { useIsMobile } from '@/lib/use-mobile'
import { useAuthStore } from '@/lib/auth-store'
import { authHeaders } from '@/lib/api-token'

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'

type Step = 'cart' | 'form' | 'success'
type StockProblem = { pfOfferId: number; name: string | null; available: number }

// Панель корзины «Под заказ» — визуально в духе detail-sheet из CatalogLayout (тот же приём:
// фиксированная панель + фон-оверлей, те же CSS-переменные), но своя, лёгкая: раздел не тянет
// весь трёхколоночный CatalogLayout (фильтры/detail-панель товара здесь не нужны — см. план).
//
// Оформление — модель «заявка менеджеру», не оплата и не автозаказ в Proflowers: форма
// пишет в /api/pod-zakaz/order, цену/остаток сервер пересчитывает сам из pf_catalog.
export default function PfCartPanel({ onClose, products }: { onClose: () => void; products: PfCatalogItem[] }) {
  const { items, setQty, remove, clear, total } = usePfCart()
  const isMobile = useIsMobile()
  const authPhone = useAuthStore(s => s.phone)
  const byOffer = useMemo(() => new Map(products.map(p => [p.pf_offer_id, p])), [products])

  const [step, setStep] = useState<Step>('cart')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState(authPhone ?? '')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [stockProblems, setStockProblems] = useState<StockProblem[]>([])
  const [orderTotal, setOrderTotal] = useState(0)

  const count = items.reduce((s, i) => s + i.qty, 0)
  const sum = total()

  function openForm() {
    if (!phone && authPhone) setPhone(authPhone)
    setFormError(null)
    setStockProblems([])
    setStep('form')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !phone.trim() || submitting) return
    setSubmitting(true)
    setFormError(null)
    setStockProblems([])
    try {
      const res = await fetch('/api/pod-zakaz/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          comment: comment.trim() || undefined,
          items: items.map(i => ({ pfOfferId: i.pfOfferId, qtySteps: i.qty })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.orderId) {
        setOrderTotal(data.total ?? sum)
        clear()
        setStep('success')
        return
      }
      if (res.status === 400 && data?.error === 'stock_changed' && Array.isArray(data.items)) {
        setStockProblems(data.items)
        setFormError('Кое-что изменилось в наличии — проверьте корзину.')
      } else {
        setFormError(data?.error || 'Не удалось отправить заявку. Попробуйте ещё раз.')
      }
    } catch {
      setFormError('Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
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
          <span style={{ fontFamily: 'var(--font-golos)', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            {step === 'form' && (
              <button
                onClick={() => setStep('cart')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', padding: 0, display: 'flex' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
            )}
            {step === 'cart' && <>Корзина «Под заказ» {count > 0 && <span style={{ color: 'var(--text-mid)', fontWeight: 400 }}>· {count}</span>}</>}
            {step === 'form' && 'Оформление заявки'}
            {step === 'success' && 'Заявка принята'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {step === 'success' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div style={{ fontFamily: 'var(--font-golos)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              Заявка принята
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-mid)', maxWidth: 280 }}>
              Менеджер свяжется с вами в ближайшее время, чтобы согласовать поставку.
              {orderTotal > 0 && <> Сумма заявки — {fmt(orderTotal)}.</>}
            </div>
            <button
              onClick={onClose}
              style={{
                marginTop: 14, width: '100%', maxWidth: 240, height: 42,
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Продолжить покупки
            </button>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
              Оставьте контакты — менеджер свяжется с вами и согласует поставку. Мы не отправляем
              запрос поставщику автоматически.
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-mid)' }}>Имя *</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required
                style={{ height: 40, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', fontSize: 13.5, fontFamily: 'inherit' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-mid)' }}>Телефон *</span>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                placeholder="+7 7XX XXX XX XX"
                style={{ height: 40, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', fontSize: 13.5, fontFamily: 'inherit' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-mid)' }}>Комментарий</span>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </label>

            {formError && (
              <div style={{ fontSize: 12, color: '#C62828', background: 'rgba(198,40,40,0.08)', borderRadius: 'var(--radius-btn)', padding: '8px 10px' }}>
                {formError}
                {stockProblems.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {stockProblems.map(p => {
                      const live = byOffer.get(p.pfOfferId)
                      return (
                        <li key={p.pfOfferId}>
                          {p.name ?? live?.name ?? `Позиция #${p.pfOfferId}`} — доступно {p.available}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--text-mid)' }}>Итого</span>
              <span style={{ fontWeight: 700 }}>{fmt(sum)}</span>
            </div>
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', height: 44, background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-btn)', fontSize: 14, fontWeight: 600,
                cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Отправляем…' : 'Отправить заявку'}
            </button>
          </form>
        )}

        {step === 'cart' && (
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
                          <span style={{ minWidth: 28, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '0 2px', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
                            {it.qty}
                            {it.isBoxOnly && <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text-mid)' }}>кор.</span>}
                          </span>
                          <button onClick={() => setQty(it, Math.min(max, it.qty + 1))} disabled={it.qty >= max} style={{ width: 26, height: 26, border: 'none', background: 'var(--bg2)', color: 'var(--accent)', fontWeight: 700, cursor: it.qty >= max ? 'default' : 'pointer', opacity: it.qty >= max ? 0.35 : 1 }}>+</button>
                        </div>
                        <button onClick={() => remove(it.pfOfferId)} style={{ background: 'none', border: 'none', color: 'var(--text-mid)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>убрать</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {it.isBoxOnly && live?.box_multiplicity ? (
                        <>
                          <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text-mid)' }}>
                            {it.qty} кор. ({it.qty * live.box_multiplicity} шт)
                          </div>
                          {fmt(it.stepPrice * it.qty)}
                        </>
                      ) : (
                        fmt(it.stepPrice * it.qty)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}

        {step === 'cart' && items.length > 0 && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 10 }}>
              <span style={{ color: 'var(--text-mid)' }}>Итого</span>
              <span style={{ fontWeight: 700 }}>{fmt(sum)}</span>
            </div>
            <button
              onClick={openForm}
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
