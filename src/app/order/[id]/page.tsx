'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/auth-store'
import { useCart } from '@/lib/cart-store'
import { authHeaders } from '@/lib/api-token'
import { company } from '@/config/company'
import PaymentFork from '@/components/PaymentFork'
import s from './order.module.css'

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'

type OrderItem = {
  id: string
  qty: number
  qty_ordered: number | null
  qty_actual: number | null
  is_removed: boolean
  price: number
  color: string | null
  product: { id: number; name: string; display_name?: string | null; image_url?: string | null } | null
}
type Order = {
  id: string
  status: string
  payment_status: string | null
  total: number | null
  notes: string | null
  payment_method: string | null
  created_at: string
  paid_at: string | null
  assembled_at: string | null
  order_items: OrderItem[]
}

const STATUS: Record<string, { label: string; cls?: string }> = {
  pending: { label: 'В обработке' }, reserved: { label: 'В обработке' },
  confirmed: { label: 'Подтверждён' }, assembling: { label: 'Собирается' },
  assembled: { label: 'Готов к выдаче' }, delivered: { label: 'Выдан', cls: 'done' },
  cancelled: { label: 'Отменён', cls: 'cancelled' },
}

function dt(v: string | null | undefined) {
  if (!v) return ''
  return new Date(v).toLocaleString('ru-RU', { timeZone: 'Asia/Oral', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export default function OrderPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isAuthed, phone, init } = useAuthStore()
  const { add, update } = useCart()
  const [order, setOrder] = useState<Order | null>(null)
  const [client, setClient] = useState<{ company_name: string | null; bin: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!isAuthed || !phone) { router.push('/'); return }
    ;(async () => {
      const headers = await authHeaders()  // владелец резолвится из токена на сервере
      try {
        const r = await fetch('/api/cabinet', { headers })
        const data = await r.json()
        const found = (data.orders ?? []).find((o: Order) => String(o.id) === String(params.id))
        setOrder(found ?? null)
        setClient(data.client ? { company_name: data.client.company_name, bin: data.client.bin ?? null } : null)
      } catch { setOrder(null) }
      finally { setLoading(false) }
    })()
  }, [isAuthed, phone, params.id, router])

  if (!isAuthed) return null

  if (loading) {
    return <main className={s.page}><div className={s.shell}><div className={s.state}><div className={s.stateP}>Загрузка…</div></div></div></main>
  }
  if (!order) {
    return (
      <main className={s.page}><div className={s.shell}><div className={s.state}>
        <div className={s.stateH}>Заказ не найден</div>
        <p className={s.stateP}>Возможно, он оформлен на другой номер.</p>
        <Link href="/cabinet" className={s.stateBtn}>Мои заказы</Link>
      </div></div></main>
    )
  }

  const visible = order.order_items.filter(i => !i.is_removed)
  const itemQty = (i: OrderItem) => i.qty_actual ?? i.qty_ordered ?? i.qty
  const itemsSum = visible.reduce((acc, i) => acc + itemQty(i) * i.price, 0)
  const totalPaid = Number(order.total ?? itemsSum)
  const discount = Math.max(0, itemsSum - totalPaid)
  const count = visible.reduce((acc, i) => acc + itemQty(i), 0)
  // «Оплачен» загорается ТОЛЬКО при фактической оплате — независимо от способа.
  // Для «По счёту»/QR (invoice) подтверждение ручное → пока unpaid стадия не активна.
  const isPaid = order.payment_status === 'paid' || !!order.paid_at
  const st = STATUS[order.status] ?? { label: order.status }

  // Таймлайн
  const steps = [
    { key: 'created', label: 'Оформлен', time: dt(order.created_at), done: true },
    { key: 'paid', label: 'Оплачен', time: dt(order.paid_at), done: isPaid },
    { key: 'ready', label: 'Готов', time: dt(order.assembled_at), done: ['assembled', 'delivered'].includes(order.status) },
    { key: 'done', label: 'Выдан', time: '', done: order.status === 'delivered' },
  ]
  const cancelled = order.status === 'cancelled'
  const curIdx = cancelled ? -1 : steps.findIndex(x => !x.done)

  function repeat() {
    for (const i of visible) {
      if (!i.product) continue
      const q = itemQty(i)
      add({ id: i.product.id, name: i.product.display_name || i.product.name, price: i.price, available: Math.max(q, 1), category: 'accessories' })
      update(i.product.id, q)
    }
    router.push('/cart')
  }

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.phead}>
          <nav className={s.crumbs}>
            <a onClick={() => router.push('/cabinet')}>Личный кабинет</a>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            <span className={s.cur}>Заказ № {order.id}</span>
          </nav>
          <div className={s.oTitle}>
            <h1>Заказ № {order.id}</h1>
            <span className={s.date}>от {dt(order.created_at)}</span>
            <span className={`${s.st} ${st.cls ? s[st.cls] : ''}`}><span className={s.d} />{st.label}</span>
          </div>
        </div>

        {/* TIMELINE */}
        {!cancelled && (
          <div className={s.timeline}>
            {steps.map((step, idx) => {
              // «Оплачен» никогда не подсвечивается как «текущая» (амбер): либо оплачено (✓),
              // либо ждём оплату — серый todo. Иначе unpaid-заказ выглядел «на стадии оплаты».
              const isCur = idx === curIdx && step.key !== 'paid'
              const cls = step.done ? s.done : isCur ? s.cur : s.todo
              return (
                <div key={step.key} className={`${s.step} ${cls}`}>
                  <span className={s.dot}>{step.done ? '✓' : isCur ? '•' : idx + 1}</span>
                  <span className={s.lb}>{step.label}</span>
                  {step.time && <span className={s.tm}>{step.time}</span>}
                </div>
              )
            })}
          </div>
        )}

        <div className={s.body}>
          {/* ITEMS */}
          <div className={s.items}>
            <div className={s.blockH}>Состав заказа</div>
            {order.order_items.map(i => (
              <div key={i.id} className={`${s.irow} ${i.is_removed ? s.removed : ''}`}>
                <span className={s.thumb}>
                  {i.product?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.product.image_url} alt={(i.product?.display_name || i.product?.name) ?? ''} />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" /></svg>
                  )}
                </span>
                <div>
                  <div className={s.nm}>
                    {(i.product?.display_name || i.product?.name) ?? '—'}
                    {i.color && <span className={s.color}> — Цвет: {i.color}</span>}
                  </div>
                  <div className={s.calc}>{fmt(i.price)} × {itemQty(i)} шт{i.is_removed ? ' · снято' : ''}</div>
                </div>
                <div className={s.sum}>{i.is_removed ? '—' : fmt(itemQty(i) * i.price)}</div>
              </div>
            ))}
            <div className={s.repeat}>
              <button className={s.btn} onClick={repeat}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15" /></svg>
                Повторить заказ
              </button>
            </div>
          </div>

          {/* SIDE */}
          <div className={s.side}>
            <div className={s.box}>
              <h3>Итог</h3>
              <div className={s.sline}><span>Товаров</span><span className={s.v}>{count} шт</span></div>
              <div className={s.sline}><span>Сумма</span><span className={s.v}>{fmt(itemsSum)}</span></div>
              {discount > 0 && (
                <div className={`${s.sline} ${s.disc}`}><span>Скидка</span><span className={s.v}>−{fmt(discount)}</span></div>
              )}
              <div className={s.sdiv} />
              <div className={s.total}><span className={s.k}>{isPaid ? 'Итого оплачено' : 'К оплате'}</span><span className={s.tv}>{fmt(totalPaid)}</span></div>
              {isPaid && (
                <span className={s.paid}>✓ Оплачено{order.payment_method === 'card' ? ' картой' : order.payment_method === 'invoice' ? ' по счёту' : ''}</span>
              )}
            </div>

            {/* Развилка оплаты для юр. лиц: Halyk QR + счёт PDF — пока неоплачен и клиент юрлицо */}
            {!isPaid && client?.company_name && (
              <PaymentFork orderId={order.id} client={{ company_name: client.company_name, bin: client.bin }} />
            )}

            <div className={s.box}>
              <h3>Получение</h3>
              {order.notes ? (
                <div className={s.kv}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>
                  <div className="t"><span>{order.notes}</span></div>
                </div>
              ) : (
                <div className={s.kv}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>
                  <div className="t"><b>Самовывоз со склада</b><span>{company.address.replace('Западно-Казахстанская область, ', '')}{'\n'}{company.hours}</span></div>
                </div>
              )}
            </div>

            <div className={s.box}>
              <h3>Документы</h3>
              <div className={s.docs}>
                <div className={s.doc}>
                  <span className={s.ic}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg></span>
                  Накладная
                  <span className={s.soon}>по запросу</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
