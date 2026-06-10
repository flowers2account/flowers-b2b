'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function FailContent() {
  const params = useSearchParams()
  const invoice = params.get('invoice')
  const [orderId, setOrderId] = useState<number | null>(null)

  useEffect(() => {
    if (!invoice) return
    fetch(`/api/payments/status?invoice=${invoice}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.orderId) setOrderId(d.orderId) })
  }, [invoice])

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Оплата не прошла</h1>
      {orderId && (
        <p style={{ color: '#6b7280', marginBottom: 8 }}>
          Заказ №{orderId} создан, но не оплачен.<br />
          Товары зарезервированы на 30 минут.
        </p>
      )}
      <p style={{ color: '#6b7280', marginBottom: 20 }}>Вернитесь в корзину и повторите оплату.</p>
      <Link href="/catalog" style={{
        display: 'inline-block',
        padding: '10px 24px', background: '#8B3A5A', color: '#fff',
        borderRadius: 8, textDecoration: 'none', fontWeight: 600,
      }}>Вернуться в каталог</Link>
    </div>
  )
}

export default function PaymentFailPage() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <Suspense fallback={<p style={{ textAlign: 'center' }}>Загрузка…</p>}>
          <FailContent />
        </Suspense>
      </div>
    </div>
  )
}
