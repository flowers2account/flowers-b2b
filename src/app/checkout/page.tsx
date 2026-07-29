'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart-store'
import { useAuthStore } from '@/lib/auth-store'
import { useOrderCheckout } from '@/hooks/useOrderCheckout'
import { company } from '@/config/company'
import DeliveryTermsModal from '@/components/DeliveryTermsModal'
import { CITY_OPTIONS } from '@/lib/cities'
import s from './checkout.module.css'

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'
type Method = 'pickup' | 'delivery'

const PH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" />
  </svg>
)

export default function CheckoutPage() {
  const router = useRouter()
  const { items, total, clear } = useCart()
  const { phone, init } = useAuthStore()

  const [method, setMethod] = useState<Method>('pickup')
  const [city, setCity] = useState<string>('Уральск')
  const [date, setDate] = useState('')
  const [address, setAddress] = useState('')
  const [comment, setComment] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [showDelivery, setShowDelivery] = useState(false)
  // Способ оплаты: карта (ePay) или по счёту/QR для юр.лиц
  const [payMethod, setPayMethod] = useState<'card' | 'invoice'>('card')
  // Стоимость доставки по городу (app_settings.city_delivery_fee, fallback 2000).
  // Только для отображения — авторитетный расчёт суммы на сервере (/api/checkout).
  const [deliveryFee, setDeliveryFee] = useState(2000)

  // Префилл телефона получателя из профиля
  useEffect(() => { if (phone) setRecipientPhone(prev => prev || phone) }, [phone])
  useEffect(() => {
    fetch('/api/settings/delivery-fee')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && Number.isFinite(d.fee)) setDeliveryFee(d.fee) })
      .catch(() => {})
  }, [])

  useEffect(() => { init().catch(() => {}) }, [init])

  const sum = total()
  const isUralsk = method === 'pickup' || (method === 'delivery' && city === 'Уральск')
  const discount = Math.round(sum * (isUralsk ? 0.01 : 0))
  // Доставка: по городу (Уральск) — фикс; межгород — «по согласованию» (в сумму не входит);
  // самовывоз — 0.
  const isCityDelivery = method === 'delivery' && city === 'Уральск'
  const deliveryAmount = isCityDelivery ? deliveryFee : 0
  const toPay = sum - discount + deliveryAmount

  const checkout = useOrderCheckout({
    items,
    phone: recipientPhone.trim() || phone,
    onAuthRequired: () => setFormError('Укажите телефон получателя'),
    onSuccess: () => clear(),
    extra: () => ({
      name: recipientName.trim() || undefined,
      payment_method: payMethod,
      delivery: method === 'pickup'
        ? { method: 'pickup' }
        : { method: 'delivery', city, date: date.trim(), address: address.trim(), comment: comment.trim() },
      recipient: { name: recipientName.trim(), phone: recipientPhone.trim(), email: email.trim() },
    }),
    // «По счёту»: ePay пропускаем, ведём на /order/[id] — там QR-блок для юр.лиц
    skipPayment: () => payMethod === 'invoice',
    onCreated: (orderId) => router.push(`/order/${orderId}`),
  })

  function validate(): string {
    if (!recipientName.trim()) return 'Укажите имя и фамилию получателя'
    if (!recipientPhone.trim()) return 'Укажите телефон получателя'
    if (method === 'delivery' && !address.trim()) return 'Укажите адрес доставки'
    return ''
  }

  function handlePay() {
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError('')
    checkout.submitOrder()
  }

  // ── Терминальные состояния ────────────────────────────────────────────────
  if (checkout.step === 'success') {
    return (
      <main className={s.page}><div className={s.shell}>
        <div className={s.state}>
          <div className={s.stateIc}>🎉</div>
          <div className={s.stateH}>Заказ оформлен и оплачен!</div>
          <p className={s.stateP}>
            Заказ №{checkout.orderId} создан. Менеджер получил уведомление и свяжется с вами.
            {checkout.payInfo?.cardMask && <><br />💳 {checkout.payInfo.cardMask}
              {checkout.payInfo.amount ? ` · ${fmt(Number(checkout.payInfo.amount))}` : ''}</>}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/cabinet" className={s.stateBtn}>Мои заказы</Link>
            <Link href="/catalog" className={`${s.stateBtn} ${s.ghost}`}>В каталог</Link>
          </div>
        </div>
      </div></main>
    )
  }
  if (checkout.step === 'timeout') {
    return (
      <main className={s.page}><div className={s.shell}>
        <div className={s.state}>
          <div className={s.stateIc}>⏳</div>
          <div className={s.stateH}>Оплата обрабатывается</div>
          <p className={s.stateP}>Заказ №{checkout.orderId} создан. Статус платежа появится в личном кабинете через 1–3 минуты.</p>
          <Link href="/cabinet" className={s.stateBtn}>Перейти в кабинет</Link>
        </div>
      </div></main>
    )
  }
  if (checkout.step === 'failed') {
    return (
      <main className={s.page}><div className={s.shell}>
        <div className={s.state}>
          <div className={s.stateIc}>⚠️</div>
          <div className={s.stateH}>Заказ №{checkout.orderId} не оплачен</div>
          <p className={s.stateP}>Товары зарезервированы на 30 минут. Можно повторить оплату прямо сейчас.</p>
          {checkout.payError && <p className={s.err}>{checkout.payError}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={checkout.retryPayment} disabled={checkout.busy} className={s.stateBtn}>🔄 Повторить оплату</button>
            <button onClick={checkout.reset} className={`${s.stateBtn} ${s.ghost}`}>Закрыть</button>
          </div>
        </div>
      </div></main>
    )
  }

  // ── Пустая корзина ────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <main className={s.page}><div className={s.shell}>
        <div className={s.state}>
          <div className={s.stateIc}>🛒</div>
          <div className={s.stateH}>Корзина пуста</div>
          <p className={s.stateP}>Добавьте товары из каталога, чтобы оформить заказ.</p>
          <Link href="/catalog" className={s.stateBtn}>Перейти в каталог</Link>
        </div>
      </div></main>
    )
  }

  const count = items.reduce((c, i) => c + i.qty, 0)

  return (
    <main className={s.page}>
      <div className={s.shell}>
        {/* PAGE HEAD */}
        <div className={s.phead}>
          <nav className={s.crumbs}>
            <a onClick={() => router.push('/catalog')}>Каталог</a>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            <span className={s.cur}>Оформление</span>
          </nav>
          <h1>Оформление заказа</h1>
        </div>

        <div className={s.body}>
          {/* LEFT */}
          <div className={s.left}>
            {/* 1. Получение */}
            <div className={s.sect}>
              <div className={s.sectH}><span className={s.nn}>1</span><h3>Способ получения</h3></div>
              <div className={s.sectB}>
                <div className={s.choice}>
                  <button type="button" className={`${s.opt} ${method === 'pickup' ? s.on : ''}`} onClick={() => setMethod('pickup')}>
                    <span className={s.radio} />
                    <div className={s.optTi}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM9 13h6" /></svg>
                      Самовывоз
                    </div>
                    <div className={s.optDs}>Склад в Уральске, {company.address.replace('Западно-Казахстанская область, ', '')}. В день заказа после подтверждения.</div>
                    <div className={s.optPr}>Бесплатно</div>
                  </button>
                  <button type="button" className={`${s.opt} ${method === 'delivery' ? s.on : ''}`} onClick={() => setMethod('delivery')}>
                    <span className={s.radio} />
                    <div className={s.optTi}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                      Доставка
                    </div>
                    <div className={s.optDs}>По Уральску — {fmt(deliveryFee)}. В Актобе и Атырау — по согласованию.</div>
                    <div className={s.optPr}>{fmt(deliveryFee)} (см.{' '}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowDelivery(true) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setShowDelivery(true) } }}
                        style={{ color: '#8B3A5A', textDecoration: 'underline', cursor: 'pointer' }}
                      >условия</span>)</div>
                  </button>
                </div>

                {method === 'pickup' ? (
                  <div className={s.fields}>
                    <div className={s.banner}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      <span>Заказ соберём в день оплаты. Сообщим в WhatsApp, когда будет готов к выдаче. Часы склада: {company.hours}.</span>
                    </div>
                  </div>
                ) : (
                  <div className={s.fields}>
                    <div className={s.frow}>
                      <div className={s.field}>
                        <label>Город</label>
                        <select value={city} onChange={e => setCity(e.target.value)}>
                          {CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className={s.field}>
                        <label>Дата доставки (желаемая)</label>
                        <input type="text" placeholder="например, 12 июня" value={date} onChange={e => setDate(e.target.value)} />
                      </div>
                    </div>
                    <div className={`${s.field} ${s.full}`}>
                      <label>Адрес доставки</label>
                      <input type="text" placeholder="улица, дом, офис / магазин" value={address} onChange={e => setAddress(e.target.value)} />
                    </div>
                    <div className={`${s.field} ${s.full}`}>
                      <label>Комментарий курьеру</label>
                      <textarea placeholder="ориентир, время приёмки, контактное лицо" value={comment} onChange={e => setComment(e.target.value)} />
                    </div>
                    <div className={s.banner}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                      <span>{city === 'Уральск'
                        ? 'Уральск: доставка в день заказа или на следующий день. При заказе через сайт — скидка 1%.'
                        : `${city}: бесплатная доставка раз в неделю при заказе от 50 000 ₸. Иначе — по согласованию с менеджером.`}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Получатель */}
            <div className={s.sect}>
              <div className={s.sectH}><span className={s.nn}>2</span><h3>Получатель</h3></div>
              <div className={s.sectB}>
                <div className={s.frow}>
                  <div className={s.field}>
                    <label>Имя и фамилия</label>
                    <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Имя Фамилия" />
                  </div>
                  <div className={s.field}>
                    <label>Телефон</label>
                    <input value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} placeholder="+7 ___ ___ __ __" />
                  </div>
                </div>
                <div className={`${s.field} ${s.full}`} style={{ marginBottom: 0 }}>
                  <label>E-mail для документов и чека</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.kz" />
                </div>
              </div>
            </div>

            {/* 3. Оплата */}
            <div className={s.sect}>
              <div className={s.sectH}><span className={s.nn}>3</span><h3>Оплата</h3></div>
              <div className={s.sectB}>
                <div className={`${s.payOpt} ${payMethod === 'card' ? s.on : ''}`}
                  onClick={() => setPayMethod('card')} role="radio" aria-checked={payMethod === 'card'}>
                  <span className={s.payRadio} />
                  <div className={s.payBody}>
                    <div className={s.payTt}>Картой онлайн</div>
                    <div className={s.payDd}>Оплата на защищённой странице банка (3-D Secure). Комиссии для покупателя нет.</div>
                    <div className={s.payLogos}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/payment-logos/visa.svg" alt="Visa" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/payment-logos/mastercard.svg" alt="Mastercard" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/payment-logos/unionpay.svg" alt="UnionPay" />
                    </div>
                    <div className={s.halyk}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>
                      Платёжный шлюз <b>Halyk Bank · ePay</b>
                    </div>
                  </div>
                </div>
                <div className={`${s.payOpt} ${payMethod === 'invoice' ? s.on : ''}`}
                  onClick={() => setPayMethod('invoice')} role="radio" aria-checked={payMethod === 'invoice'}>
                  <span className={s.payRadio} />
                  <div className={s.payBody}>
                    <div className={s.payTt}>По счёту (для организаций)</div>
                    <div className={s.payDd}>Оплата по счёту с полным пакетом документов. Работаем с ИП, ТОО и другими организациями.<br />Для клиентов Halyk Bank — оплата по QR без комиссии через OnlineBank (QR-код покажем в заказе).</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SUMMARY */}
          <div className={s.summary}>
            <h2>Ваш заказ</h2>
            <div className={s.mini}>
              {items.map(it => (
                <div key={`${it.id}__${it.color ?? ''}`} className={s.miniRow}>
                  <span className={s.miniTh}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {it.image_url ? <img src={it.image_url} alt="" /> : PH_ICON}
                  </span>
                  <span className={s.miniNm}>{it.name}{it.color ? ` (${it.color})` : ''}</span>
                  <span className={s.miniQ}>{it.qty}×{fmt(it.price)}</span>
                </div>
              ))}
            </div>
            <div className={s.sline}><span>Товаров</span><span className={s.v}>{count} шт</span></div>
            <div className={s.sline}><span>Сумма</span><span className={s.v}>{fmt(sum)}</span></div>
            {discount > 0 && (
              <div className={`${s.sline} ${s.disc}`}><span>Скидка 1% (Уральск)</span><span className={s.v}>−{fmt(discount)}</span></div>
            )}
            <div className={s.sline}>
              <span>Доставка</span>
              <span className={s.free}>{method === 'pickup'
                ? 'Самовывоз'
                : (isCityDelivery ? fmt(deliveryFee) : 'по согласованию')}</span>
            </div>
            <div className={s.sdiv} />
            <div className={s.total}><span className={s.k}>К оплате</span><span className={s.tv}>{fmt(toPay)}</span></div>

            <button className={s.payBtn} onClick={handlePay} disabled={checkout.busy}>
              {checkout.busy
                ? (checkout.step === 'creating' ? 'Создаём заказ…' : 'Ожидаем оплату…')
                : <>{payMethod === 'invoice' ? 'Оформить заказ' : 'Оплатить заказ'}
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </>}
            </button>

            {formError && <div className={s.err}>{formError}</div>}
            {checkout.stockError && <div className={s.err}>{checkout.stockError}</div>}

            <div className={s.note}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <span>Нажимая «Оплатить», вы перейдёте на защищённую оплату Halyk Bank (ePay). Данные карты вводятся на стороне банка.</span>
            </div>
          </div>
        </div>
      </div>

      <DeliveryTermsModal open={showDelivery} onClose={() => setShowDelivery(false)} />
    </main>
  )
}
