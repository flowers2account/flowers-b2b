// Задел под API OnlineDuken: опрос статуса оплат по счетам (Шаг 4 «Получение статуса
// по оплатам заказов», файл oplaty). Включается, КОГДА появится Bearer-токен банка.
// Без DUKEN_API_TOKEN — ранний выход, ничего не делает и не падает.
import { createAdminClient } from '@/lib/supabase/admin'
import { markInvoicePaidByOrder } from './create-invoice'

const BASE = {
  test: 'https://b2b.test.onlinebank.kz',
  prod: 'https://b2b.onlinebank.kz',
} as const

const PATH = '/api/distributor-integration-service/orders/payments'

export type DukenPollResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  checked?: number
  paid?: number
  failed?: number
  errors?: number
}

type Logger = (msg: string) => void

// Возможные значения paymentStatus в ответе банка.
type DukenPaymentStatus = 'NEW' | 'IN_PROGRESS' | 'PAID' | 'FAILED'
type DukenPaymentEntry = { invoiceId?: string; paymentStatus?: DukenPaymentStatus }

/**
 * Опросить OnlineDuken по неоплаченным счетам и пометить оплаченные.
 * - Нет DUKEN_API_TOKEN → ранний выход (skipped), без ошибок.
 * - Берём счета status='sent' с guid (по умолчанию только pay_method='qr' — QR-оплаты;
 *   onlyQr=false опрашивает все sent).
 * - По заказу может быть несколько оплат: одна PAID, остальные FAILED — берём ИМЕННО PAID.
 */
export async function pollDukenPayments(
  opts: { onlyQr?: boolean; log?: Logger } = {},
): Promise<DukenPollResult> {
  const log: Logger = opts.log ?? ((m) => console.log(`[duken-poll] ${m}`))
  const token = process.env.DUKEN_API_TOKEN

  // Ранний выход — токена банка ещё нет. Когда появится в env — функция заработает без правок кода.
  if (!token) {
    log('DUKEN_API_TOKEN не настроен — опрос пропущен (ждём токен банка)')
    return { ok: false, skipped: true, reason: 'NO_TOKEN' }
  }

  const env = process.env.DUKEN_API_ENV === 'prod' ? 'prod' : 'test'
  const base = BASE[env]
  const sb = createAdminClient()

  // Кандидаты: счета в статусе sent с guid (invoiceId для API).
  let q = sb.from('invoices').select('id, guid, order_id, invoice_number, pay_method')
    .eq('status', 'sent').not('guid', 'is', null)
  if (opts.onlyQr !== false) q = q.eq('pay_method', 'qr')
  const { data: invoices, error } = await q
  if (error) { log(`ошибка выборки счетов: ${error.message}`); return { ok: false, reason: 'DB_ERROR' } }
  if (!invoices?.length) { log('нет счетов в статусе sent для опроса'); return { ok: true, checked: 0, paid: 0 } }

  const invoiceIds = invoices.map((i) => i.guid)

  let content: DukenPaymentEntry[] = []
  try {
    const r = await fetch(`${base}${PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // Фильтр по invoiceId неоплаченных счетов (имена полей — по документации банка;
      // при появлении токена сверить с реальным контрактом Шага 4).
      body: JSON.stringify({ invoiceId: invoiceIds, paymentStatus: 'PAID' }),
    })
    if (!r.ok) { log(`банк ответил ${r.status}`); return { ok: false, reason: `HTTP_${r.status}` } }
    const data = await r.json()
    content = (data?.content ?? []) as DukenPaymentEntry[]
  } catch (e) {
    log(`сеть/банк недоступен: ${(e as Error).message}`)
    return { ok: false, reason: 'FETCH_ERROR' }
  }

  let paid = 0, failed = 0, errors = 0
  for (const inv of invoices) {
    const entries = content.filter((c) => c.invoiceId === inv.guid)
    if (!entries.length) continue
    // Несколько оплат на заказ → берём ровно PAID (остальные FAILED игнорируем).
    if (entries.some((e) => e.paymentStatus === 'PAID')) {
      const res = await markInvoicePaidByOrder(inv.order_id!, 'onlineduken_api')
      if (res.ok) { paid++; log(`№ ${inv.invoice_number} → PAID (api)`) }
      else { errors++; log(`№ ${inv.invoice_number}: не удалось отметить — ${res.message}`) }
    } else if (entries.every((e) => e.paymentStatus === 'FAILED')) {
      failed++
      log(`№ ${inv.invoice_number}: оплаты FAILED — статус счёта не трогаем`)
    }
    // NEW / IN_PROGRESS — оставляем sent до следующего опроса.
  }

  log(`готово: проверено ${invoices.length}, оплачено ${paid}, failed ${failed}, ошибок ${errors}`)
  return { ok: true, checked: invoices.length, paid, failed, errors }
}
