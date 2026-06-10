'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import s from './success.module.css'

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'

function SuccessContent() {
  const params = useSearchParams()
  const invoice = params.get('invoice')
  const [status, setStatus] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<number | null>(null)
  const [cardMask, setCardMask] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(null)

  useEffect(() => {
    if (!invoice) return
    let tries = 0
    const poll = async () => {
      const res = await fetch(`/api/payments/status?invoice=${invoice}`)
      if (res.ok) {
        const d = await res.json()
        setStatus(d.status); setOrderId(d.orderId); setCardMask(d.cardMask); setAmount(d.amount ?? null)
        if (d.status === 'success' || d.status === 'failed' || tries > 15) return
      }
      tries++
      setTimeout(poll, 2000)
    }
    poll()
  }, [invoice])

  // ── проверяем / неуспех ──────────────────────────────────────────────
  if (status !== 'success') {
    const failed = status === 'failed'
    return (
      <div className={s.wrap}>
        {failed
          ? <div className={s.checkmark} style={{ background: '#FBE9E7', color: '#C0392B' }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </div>
          : <div className={s.spin} />}
        <div className={s.title}>{failed ? 'Оплата не прошла' : 'Проверяем оплату…'}</div>
        <div className={s.lead}>
          {failed
            ? <>Заказ {orderId ? `№${orderId} создан, но ` : ''}не оплачен. Товары зарезервированы — можно повторить оплату из корзины.</>
            : 'Обычно занимает несколько секунд. Не закрывайте страницу.'}
        </div>
        <div className={s.actions}>
          <Link href="/cabinet" className={`${s.btn} ${s.solid}`}>Мои заказы</Link>
          <Link href="/catalog" className={s.btn}>В каталог</Link>
        </div>
      </div>
    )
  }

  // ── успех ────────────────────────────────────────────────────────────
  return (
    <div className={s.wrap}>
      <div className={s.checkmark}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </div>
      <div className={s.title}>Заказ оплачен</div>
      <div className={s.lead}>Спасибо! Оплата прошла успешно. Мы уже начали собирать ваш заказ и сообщим в WhatsApp, когда он будет готов.</div>
      {orderId && (
        <div className={s.ordno}>
          Заказ № {orderId}
          <span className={s.paidChip}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            Оплачено
          </span>
        </div>
      )}

      <div className={s.card}>
        <div className={s.cardH}>Детали оплаты</div>
        <div className={s.cardB}>
          <div className={s.kv}>
            <span className={s.k}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
              Способ оплаты
            </span>
            <span className={s.v}>Картой онлайн{cardMask ? ` ${cardMask}` : ''}<span className={s.sub}>Halyk Bank · ePay</span></span>
          </div>
          {amount != null && (
            <div className={s.kv}>
              <span className={s.k}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                Оплачено
              </span>
              <span className={`${s.v} ${s.sum}`}>{fmt(Number(amount))}</span>
            </div>
          )}
        </div>
      </div>

      <div className={s.next}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
        <span><b>Что дальше:</b> заказ собирается в день оплаты. Как только он будет готов к выдаче, придёт уведомление в WhatsApp. Статус и детали — в личном кабинете.</span>
      </div>

      <div className={s.actions}>
        {orderId
          ? <Link href={`/order/${orderId}`} className={`${s.btn} ${s.solid}`}>Перейти к заказу<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
          : <Link href="/cabinet" className={`${s.btn} ${s.solid}`}>Мои заказы</Link>}
        <Link href="/catalog" className={s.btn}>Продолжить покупки</Link>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <main className={s.page}>
      <Suspense fallback={<div className={s.wrap}><div className={s.spin} /></div>}>
        <SuccessContent />
      </Suspense>
    </main>
  )
}
