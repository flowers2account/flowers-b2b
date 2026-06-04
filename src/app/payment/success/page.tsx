'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function SuccessContent() {
  const params = useSearchParams()
  const invoice = params.get('invoice')
  const [status, setStatus] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<number | null>(null)
  const [cardMask, setCardMask] = useState<string | null>(null)

  useEffect(() => {
    if (!invoice) return
    let tries = 0
    const poll = async () => {
      const res = await fetch(`/api/payments/status?invoice=${invoice}`)
      if (res.ok) {
        const d = await res.json()
        setStatus(d.status); setOrderId(d.orderId); setCardMask(d.cardMask)
        if (d.status === 'success' || d.status === 'failed' || tries > 15) return
      }
      tries++
      setTimeout(poll, 2000)
    }
    poll()
  }, [invoice])

  return (
    <div style={{ textAlign: 'center' }}>
      {status === 'success' ? (
        <>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Оплата прошла успешно</h1>
          {orderId && <p style={{ color: '#6b7280', marginBottom: 8 }}>Заказ №{orderId}</p>}
          {cardMask && <p style={{ color: '#6b7280', marginBottom: 16 }}>Оплачено картой {cardMask}</p>}
        </>
      ) : status === 'failed' ? (
        <>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Оплата не прошла</h1>
          <p style={{ color: '#6b7280', marginBottom: 16 }}>Заказ {orderId ? `№${orderId} создан, но` : ''} не оплачен.</p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Проверяем оплату…</h1>
          <p style={{ color: '#6b7280' }}>Подождите несколько секунд</p>
        </>
      )}
      <Link href="/cabinet" style={{
        display: 'inline-block', marginTop: 20,
        padding: '10px 24px', background: '#8B3A5A', color: '#fff',
        borderRadius: 8, textDecoration: 'none', fontWeight: 600,
      }}>Мои заказы</Link>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <Suspense fallback={<p style={{ textAlign: 'center' }}>Загрузка…</p>}>
          <SuccessContent />
        </Suspense>
      </div>
    </div>
  )
}
