'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart-store'
import { unitForProduct } from '@/lib/category-tree'
import s from './cart.module.css'

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'

const PH = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" />
  </svg>
)

export default function CartPage() {
  const router = useRouter()
  const { items, remove, update, clear, total } = useCart()

  const count = items.reduce((c, i) => c + i.qty, 0)
  const sum = total()
  const discount = Math.round(sum * 0.01)
  const toPay = sum - discount

  if (items.length === 0) {
    return (
      <main className={s.page}><div className={s.shell}>
        <div className={s.empty}>
          <div className={s.ic}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
          </div>
          <h2>Корзина пуста</h2>
          <p>Выберите товары в каталоге — упаковка, горшки, вазы, декор, сад. Большинство позиций есть на складе.</p>
          <Link href="/" className={s.go}>
            Перейти в каталог
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </div></main>
    )
  }

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.phead}>
          <nav className={s.crumbs}>
            <a onClick={() => router.push('/')}>Каталог</a>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            <span className={s.cur}>Корзина</span>
          </nav>
          <h1>Корзина <span className={s.n}>· {count} шт</span></h1>
        </div>

        <div className={s.body}>
          <div>
            <div className={s.items}>
              {items.map(it => (
                <div key={it.id} className={s.row}>
                  <div className={s.thumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {it.image_url ? <img src={it.image_url} alt="" /> : PH}
                  </div>
                  <div className={s.mid}>
                    <div className={s.nm} onClick={() => router.push(`/product/${it.id}`)}>{it.name}</div>
                    <div className={s.unit}>
                      Цена за {unitForProduct(it)}: <b>{fmt(it.price)}</b>
                      {it.available > 0 && <> · в наличии {it.available} {unitForProduct(it)}</>}
                    </div>
                  </div>
                  <div className={s.right}>
                    <div className={s.stepper}>
                      <button onClick={() => update(it.id, Math.max(1, it.qty - 1))} disabled={it.qty <= 1}>−</button>
                      <span className={s.q}>{it.qty}</span>
                      <button onClick={() => update(it.id, Math.min(it.available, it.qty + 1))} disabled={it.qty >= it.available}>+</button>
                    </div>
                    <div className={s.sum}>{fmt(it.price * it.qty)}</div>
                  </div>
                  <button className={s.rm} onClick={() => remove(it.id)} title="Удалить" aria-label="Удалить">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className={s.itemsFoot}>
              <Link href="/" className={s.link}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
                Продолжить покупки
              </Link>
              <button className={`${s.link} ${s.mut}`} onClick={clear}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                Очистить корзину
              </button>
            </div>
          </div>

          <div className={s.summary}>
            <h2>Ваш заказ</h2>
            <div className={s.sline}><span>Товаров</span><span className={s.v}>{count} шт</span></div>
            <div className={s.sline}><span>Сумма</span><span className={s.v}>{fmt(sum)}</span></div>
            <div className={`${s.sline} ${s.disc}`}><span>Скидка за заказ через сайт (Уральск), 1%</span><span className={s.v}>−{fmt(discount)}</span></div>
            <div className={s.sdiv} />
            <div className={s.total}><span className={s.k}>Итого</span><span className={s.tv}>{fmt(toPay)}</span></div>

            <Link href="/checkout" className={s.checkout}>
              Оформить заказ
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>

            <div className={s.note}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <span>Скидка и итоговая сумма уточняются на оформлении в зависимости от способа получения. Оплата картой онлайн или по счёту для юр. лиц.</span>
            </div>

            <div className={s.pay}>
              <div className={s.payLabel}>Принимаем к оплате</div>
              <div className={s.payRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/payment-logos/visa.svg" alt="Visa" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/payment-logos/mastercard.svg" alt="Mastercard" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/payment-logos/unionpay.svg" alt="UnionPay" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/payment-logos/mir.svg" alt="МИР" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
