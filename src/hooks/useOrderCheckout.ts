'use client'
import { useState, useRef, useCallback } from 'react'
import { COLORS } from '@/lib/colors'

declare global {
  interface Window {
    halyk?: { showPaymentWidget: (config: object, cb: (result: unknown) => void) => void }
  }
}

export type CheckoutStep =
  | 'idle' | 'creating' | 'paying' | 'polling' | 'success' | 'failed' | 'timeout'

export interface PaymentInfo {
  cardMask?: string
  amount?: number
}

interface CartItem {
  id: number
  qty: number
  price: number
  name: string
  available: number
  colorQtys?: Record<string, number> | null
}

// "Жёлтый × 2, Белый × 4, Зелёный × 6" — комментарий с разбивкой по цветам для заказа
function buildColorNote(colorQtys: Record<string, number>): string {
  return Object.entries(colorQtys)
    .filter(([, n]) => n > 0)
    .map(([slug, n]) => {
      const col = COLORS.find(c => c.key === slug)
      return `${col?.label ?? slug} × ${n}`
    })
    .join(', ')
}

interface Options {
  items: CartItem[]
  phone: string | null
  onAuthRequired: () => void   // показать модалку входа
  onSuccess: () => void        // очистить корзину (или другое действие)
  /** Доп. поля в тело /api/checkout (доставка, получатель, способ оплаты) — для страницы чекаута */
  extra?: () => Record<string, unknown>
}

const epayLoaded = { current: false }  // модульный синглтон — один скрипт на всю сессию

function loadEpayScript(): Promise<void> {
  if (epayLoaded.current || window.halyk) {
    epayLoaded.current = true
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = process.env.NEXT_PUBLIC_EPAY_JS_URL!
    s.onload  = () => { epayLoaded.current = true; resolve() }
    s.onerror = () => reject(new Error('Не удалось загрузить платёжный скрипт'))
    document.body.appendChild(s)
  })
}

interface PollResult { status: string; cardMask?: string; amount?: number; reason?: string; timedOut?: boolean }
async function pollStatus(invoice: string): Promise<PollResult> {
  // Постлинк может приходить с задержкой 1–3 мин — ждём до 120с
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      const res = await fetch(`/api/payments/status?invoice=${invoice}`)
      if (res.ok) {
        const d = await res.json()
        // Только терминальные статусы — 'created'/'processing' продолжаем ждать
        if (d.status === 'success' || d.status === 'failed') return d
      }
    } catch { /* сеть — попробуем снова */ }
  }
  // Таймаут — не "отказ", платёж может ещё обрабатываться
  return { status: 'timeout', timedOut: true }
}

async function runPaymentStep(orderId: number): Promise<{
  ok: boolean
  invoiceId?: string
  result?: PollResult
  error?: string
}> {
  // Init
  const initRes = await fetch('/api/payments/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  })
  if (!initRes.ok) {
    const d = await initRes.json().catch(() => ({}))
    return { ok: false, error: d.error ?? `Ошибка инициализации (${initRes.status})` }
  }
  const widgetConfig = await initRes.json()

  // Load script
  await loadEpayScript()
  if (!window.halyk) return { ok: false, error: 'halyk widget не загружен' }

  // Show widget — resolve when user closes it (success or cancel)
  await new Promise<void>(resolve => {
    window.halyk!.showPaymentWidget(widgetConfig, () => resolve())
  })

  // Poll
  const result = await pollStatus(widgetConfig.invoiceId)
  // timeout — не ошибка, передаём как есть
  return { ok: true, invoiceId: widgetConfig.invoiceId, result }
}

export function useOrderCheckout({ items, phone, onAuthRequired, onSuccess, extra }: Options) {
  const [step,       setStep]       = useState<CheckoutStep>('idle')
  const [orderId,    setOrderId]    = useState<number | null>(null)
  const [invoiceId,  setInvoiceId]  = useState<string | null>(null)
  const [payInfo,    setPayInfo]    = useState<PaymentInfo | null>(null)
  const [payError,   setPayError]   = useState('')
  const [stockError, setStockError] = useState('')
  const inFlight = useRef(false)

  const busy = step === 'creating' || step === 'paying' || step === 'polling'
  const isTerminal = step === 'success' || step === 'failed' || step === 'timeout'

  const reset = useCallback(() => {
    setStep('idle')
    setOrderId(null)
    setInvoiceId(null)
    setPayInfo(null)
    setPayError('')
    setStockError('')
    inFlight.current = false
  }, [])

  const submitOrder = useCallback(async () => {
    if (!phone) { onAuthRequired(); return }
    if (inFlight.current) return
    inFlight.current = true
    setStockError('')
    setPayError('')
    setStep('creating')

    try {
      // 1. Создать заказ
      const checkRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            id: i.id, qty: i.qty, price: i.price, name: i.name,
            ...(i.colorQtys ? { color: buildColorNote(i.colorQtys) } : {}),
          })),
          phone,
          ...(extra?.() ?? {}),
        }),
      })
      if (!checkRes.ok) {
        const d = await checkRes.json().catch(() => ({}))
        setStockError(d.error ?? 'Ошибка при оформлении заказа')
        setStep('idle')
        inFlight.current = false
        return
      }
      const { order_id } = await checkRes.json()
      setOrderId(order_id)
      setStep('paying')

      // 2. Платёжный шаг
      const pay = await runPaymentStep(order_id)
      if (!pay.ok) {
        setPayError(pay.error ?? 'Ошибка оплаты')
        setStep('failed')
        inFlight.current = false
        return
      }
      if (pay.invoiceId) setInvoiceId(pay.invoiceId)

      if (pay.result?.status === 'success') {
        setPayInfo({ cardMask: pay.result.cardMask, amount: pay.result.amount })
        setStep('success')
        onSuccess()
      } else if (pay.result?.timedOut) {
        setStep('timeout')
      } else {
        setPayError(pay.result?.status === 'failed' ? (pay.result as any).reason ?? '' : '')
        setStep('failed')
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Неизвестная ошибка')
      setStep('failed')
    }
    inFlight.current = false
  }, [items, phone, onAuthRequired, onSuccess, extra])

  const retryPayment = useCallback(async () => {
    if (!orderId || inFlight.current) return
    inFlight.current = true
    setPayError('')
    setStep('paying')

    try {
      const pay = await runPaymentStep(orderId)
      if (!pay.ok) {
        setPayError(pay.error ?? 'Ошибка оплаты')
        setStep('failed')
        inFlight.current = false
        return
      }
      if (pay.invoiceId) setInvoiceId(pay.invoiceId)

      if (pay.result?.status === 'success') {
        setPayInfo({ cardMask: pay.result.cardMask, amount: pay.result.amount })
        setStep('success')
        onSuccess()
      } else if (pay.result?.timedOut) {
        setStep('timeout')
      } else {
        setPayError(pay.result?.status === 'failed' ? (pay.result as any).reason ?? '' : '')
        setStep('failed')
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Неизвестная ошибка')
      setStep('failed')
    }
    inFlight.current = false
  }, [orderId, onSuccess])

  return {
    step, busy, isTerminal,
    orderId, invoiceId, payInfo,
    payError, stockError,
    submitOrder, retryPayment, reset,
  }
}
