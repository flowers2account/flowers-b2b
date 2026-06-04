'use client'
import { useState, useRef } from 'react'
import { useCart } from '@/lib/cart-store'
import { useAuthStore } from '@/lib/auth-store'
import SwipeToDelete from './SwipeToDelete'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import AuthModal from './AuthModal'

function formatPrice(p: number) {
  return p.toLocaleString('ru-RU') + ' ₸'
}

declare global {
  interface Window {
    halyk?: {
      showPaymentWidget: (config: object, cb: (result: unknown) => void) => void
    }
  }
}

type PayStep = 'idle' | 'creating' | 'paying' | 'polling' | 'success' | 'failed'

export default function CartSidebar() {
  const { items, remove, update, clear, total } = useCart()
  const { phone } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [stockError, setStockError] = useState('')
  const [showAuth, setShowAuth] = useState(false)

  // Payment state
  const [payStep, setPayStep] = useState<PayStep>('idle')
  const [orderId, setOrderId] = useState<number | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [payResult, setPayResult] = useState<{ cardMask?: string; amount?: number } | null>(null)
  const [payError, setPayError] = useState('')
  const epayLoaded = useRef(false)

  const count = items.reduce((s, i) => s + i.qty, 0)

  function loadEpayScript(): Promise<void> {
    if (epayLoaded.current || window.halyk) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = process.env.NEXT_PUBLIC_EPAY_JS_URL!
      s.onload = () => { epayLoaded.current = true; resolve() }
      s.onerror = () => reject(new Error('Не удалось загрузить платёжный скрипт'))
      document.body.appendChild(s)
    })
  }

  async function pollStatus(invoice: string): Promise<{ status: string; cardMask?: string; amount?: number }> {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch(`/api/payments/status?invoice=${invoice}`)
      if (res.ok) {
        const d = await res.json()
        if (d.status === 'success' || d.status === 'failed') return d
      }
    }
    return { status: 'failed' }
  }

  async function submitOrder() {
    if (!phone) { setShowAuth(true); return }
    setLoading(true)
    setStockError('')
    setPayError('')
    setPayStep('creating')

    try {
      // 1. Create order
      const checkRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name })),
          phone,
        }),
      })
      if (!checkRes.ok) {
        const d = await checkRes.json()
        setStockError(d.error ?? 'Ошибка при оформлении заказа')
        setPayStep('idle')
        setLoading(false)
        return
      }
      const { order_id } = await checkRes.json()
      setOrderId(order_id)

      // 2. Init payment
      const initRes = await fetch('/api/payments/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order_id }),
      })
      if (!initRes.ok) {
        const d = await initRes.json()
        setPayError(d.error ?? 'Ошибка инициализации оплаты')
        setPayStep('failed')
        setLoading(false)
        return
      }
      const widgetConfig = await initRes.json()
      setInvoiceId(widgetConfig.invoiceId)
      setPayStep('paying')

      // 3. Load epay script once
      await loadEpayScript()

      if (!window.halyk) throw new Error('halyk widget не загружен')

      // 4. Show widget
      await new Promise<void>(resolve => {
        window.halyk!.showPaymentWidget(widgetConfig, () => resolve())
      })

      // 5. Poll status
      setPayStep('polling')
      const result = await pollStatus(widgetConfig.invoiceId)

      if (result.status === 'success') {
        setPayResult({ cardMask: result.cardMask, amount: result.amount })
        setPayStep('success')
        clear()
      } else {
        setPayStep('failed')
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Неизвестная ошибка')
      setPayStep('failed')
    } finally {
      setLoading(false)
    }
  }

  async function retryPayment() {
    if (!orderId) return
    setPayError('')
    setPayStep('paying')

    try {
      const initRes = await fetch('/api/payments/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      if (!initRes.ok) {
        const d = await initRes.json()
        setPayError(d.error ?? 'Ошибка инициализации оплаты')
        setPayStep('failed')
        return
      }
      const widgetConfig = await initRes.json()
      setInvoiceId(widgetConfig.invoiceId)

      await loadEpayScript()
      if (!window.halyk) throw new Error('halyk widget не загружен')

      await new Promise<void>(resolve => {
        window.halyk!.showPaymentWidget(widgetConfig, () => resolve())
      })

      setPayStep('polling')
      const result = await pollStatus(widgetConfig.invoiceId)
      if (result.status === 'success') {
        setPayResult({ cardMask: result.cardMask, amount: result.amount })
        setPayStep('success')
        clear()
      } else {
        setPayStep('failed')
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Неизвестная ошибка')
      setPayStep('failed')
    }
  }

  function reset() {
    setPayStep('idle')
    setOrderId(null)
    setInvoiceId(null)
    setPayResult(null)
    setPayError('')
  }

  return (
    <>
      <div className="p-4 h-full overflow-y-auto">
        <div className="border rounded-xl bg-white shadow-sm p-4">
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            🛒 Корзина
            {count > 0 && (
              <span className="bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {count}
              </span>
            )}
          </h2>

          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Корзина пуста</p>
          ) : (
            <>
              <div className="space-y-3">
                {items.map(item => (
                  <SwipeToDelete key={item.id} onDelete={() => remove(item.id)}>
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-muted-foreground text-xs">{formatPrice(item.price)} × шт</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                          onClick={() => update(item.id, item.qty - 1)}>−</Button>
                        <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                        <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                          onClick={() => update(item.id, Math.min(item.qty + 1, item.available))}>+</Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400"
                          onClick={() => remove(item.id)}>×</Button>
                      </div>
                    </div>
                    <p className="text-right text-sm font-bold text-green-800 mt-1">
                      {formatPrice(item.price * item.qty)}
                    </p>
                    <Separator className="mt-2" />
                  </div>
                  </SwipeToDelete>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex justify-between font-bold text-base">
                  <span>Итого:</span>
                  <span className="text-green-800">{formatPrice(total())}</span>
                </div>
                {stockError && <p className="text-red-500 text-xs">{stockError}</p>}

                {/* Payment status indicator */}
                {(payStep === 'creating' || payStep === 'paying' || payStep === 'polling') && (
                  <div className="text-center text-sm text-muted-foreground py-2 space-y-1">
                    <div className="animate-spin inline-block w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full" />
                    <p>{payStep === 'creating' ? 'Создаём заказ...' : payStep === 'paying' ? 'Ожидаем оплату...' : 'Проверяем оплату...'}</p>
                  </div>
                )}

                {payStep === 'idle' && (
                  <Button
                    className="w-full bg-green-700 hover:bg-green-800"
                    onClick={submitOrder}
                    disabled={loading}
                  >
                    💳 Оформить и оплатить
                  </Button>
                )}

                {payStep !== 'idle' && payStep !== 'creating' && payStep !== 'paying' && payStep !== 'polling' && (
                  <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={reset}>
                    ← Вернуться к корзине
                  </Button>
                )}

                {payStep === 'idle' && (
                  <Button variant="ghost" className="w-full text-red-400 text-sm" onClick={clear}>
                    Очистить корзину
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}

      {/* Успешная оплата */}
      <Dialog open={payStep === 'success'} onOpenChange={() => reset()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>🎉 Заказ оформлен и оплачен!</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Заказ №{orderId} создан. Менеджер получил уведомление и свяжется с вами.
          </p>
          {payResult?.cardMask && (
            <p className="text-sm font-medium">
              💳 Оплачено картой {payResult.cardMask}
              {payResult.amount ? ` · ${formatPrice(Number(payResult.amount))}` : ''}
            </p>
          )}
          <Button className="w-full bg-green-700 hover:bg-green-800 mt-2" onClick={reset}>
            Отлично!
          </Button>
        </DialogContent>
      </Dialog>

      {/* Неуспешная оплата */}
      <Dialog open={payStep === 'failed'} onOpenChange={() => reset()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>⚠️ Заказ №{orderId} создан, но не оплачен</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Товары зарезервированы на 30 минут. Вы можете повторить оплату прямо сейчас.
          </p>
          {payError && <p className="text-xs text-red-500">{payError}</p>}
          <Button
            className="w-full bg-green-700 hover:bg-green-800 mt-2"
            onClick={() => { setPayStep('idle'); retryPayment() }}
          >
            🔄 Повторить оплату
          </Button>
          <Button variant="outline" className="w-full mt-2" onClick={reset}>
            Закрыть
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
