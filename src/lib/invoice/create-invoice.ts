// Серверная оркестрация счёта по заказу: один заказ = один счёт (идемпотентно).
// Создаёт запись в invoices (номер из sequence, guid по умолчанию), считает qr_link,
// по запросу генерит PDF и кладёт в Storage (бакет invoices, приватный) → отдаёт
// подписанную ссылку на скачивание.
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInvoiceQrLink } from '@/lib/halyk-qr'
import { generateInvoicePdf, type InvoiceLine } from './generate-invoice-pdf'

const BUCKET = 'invoices'
const SIGNED_TTL = 60 * 60 // 1 час

export type InvoiceRow = {
  id: string
  invoice_number: number
  order_id: number | null
  client_id: string | null
  amount: number
  status: string
  pay_method: string | null
  qr_link: string | null
  guid: string
  pdf_url: string | null
  paid_at: string | null
  created_at: string
}

export type InvoiceResult =
  | { ok: true; invoice: InvoiceRow; downloadUrl: string | null }
  | { ok: false; reason: 'NOT_FOUND' | 'NO_CLIENT' | 'NO_BIN' | 'ERROR'; message: string }

const itemQty = (i: { qty: number; qty_ordered: number | null; qty_actual: number | null }) =>
  i.qty_actual ?? i.qty_ordered ?? i.qty

async function loadContext(orderId: number) {
  const sb = createAdminClient()
  const { data: order } = await sb
    .from('orders')
    .select(`id, total, client_id, delivery_cost,
      order_items ( qty, qty_ordered, qty_actual, is_removed, price, color,
        product:products ( id, name, display_name ) )`)
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return { sb, error: { reason: 'NOT_FOUND' as const, message: 'Заказ не найден' } }
  if (!order.client_id) return { sb, error: { reason: 'NO_CLIENT' as const, message: 'У заказа нет клиента' } }

  const { data: client } = await sb
    .from('clients')
    .select('id, company_name, bin, phone, auth_user_id')
    .eq('id', order.client_id)
    .maybeSingle()
  if (!client) return { sb, error: { reason: 'NO_CLIENT' as const, message: 'Клиент не найден' } }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visible = ((order.order_items as any[]) ?? []).filter((i) => !i.is_removed)
  const lines: InvoiceLine[] = visible.map((i) => ({
    name: ((i.product?.display_name || i.product?.name) ?? '—') + (i.color ? ` (${i.color})` : ''),
    qty: itemQty(i),
    price: Number(i.price),
  }))
  // Доставка — не order_items, а orders.delivery_cost (см. src/lib/order-total.ts).
  // Без этой строки Итого расходится с суммой позиций на стоимость доставки без объяснения.
  const deliveryCost = Number(order.delivery_cost ?? 0)
  if (deliveryCost > 0) {
    lines.push({ name: 'Доставка', qty: 1, price: deliveryCost })
  }
  const itemsSum = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const amount = Number(order.total ?? itemsSum)

  return { sb, order, client, lines, amount }
}

async function sign(sb: ReturnType<typeof createAdminClient>, path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL)
  return data?.signedUrl ?? null
}

export type MarkPaidResult =
  | { ok: true; invoice: InvoiceRow; alreadyPaid: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'ERROR'; message: string }

/**
 * Отметить счёт оплаченным (ручное подтверждение или ответ API OnlineDuken).
 * Идемпотентно: если уже paid — ничего не меняет, alreadyPaid=true.
 * Каскад: invoices(status=paid, paid_at, paid_source) + orders(payment_status=paid, paid_at).
 */
export async function markInvoicePaidByOrder(
  orderId: number,
  source: 'manual' | 'onlineduken_api' = 'manual',
): Promise<MarkPaidResult> {
  const sb = createAdminClient()
  const { data: invoice } = await sb.from('invoices').select('*').eq('order_id', orderId).maybeSingle()
  if (!invoice) return { ok: false, reason: 'NOT_FOUND', message: 'Счёт по заказу не найден' }
  if (invoice.status === 'paid') return { ok: true, invoice: invoice as InvoiceRow, alreadyPaid: true }

  const now = new Date().toISOString()
  // Гонка: обновляем только пока не paid — параллельные клики не задвоят.
  const { data: upd, error } = await sb
    .from('invoices')
    .update({ status: 'paid', paid_at: now, paid_source: source })
    .eq('id', invoice.id)
    .neq('status', 'paid')
    .select('*')
    .maybeSingle()
  if (error) return { ok: false, reason: 'ERROR', message: error.message }
  // Кто-то успел раньше — это всё равно успех (идемпотентность).
  const finalInvoice = (upd ?? invoice) as InvoiceRow

  // Связанный заказ → payment_status=paid (тоже идемпотентно).
  const { data: order } = await sb.from('orders').select('status, amo_lead_id').eq('id', orderId).maybeSingle()
  await sb.from('orders').update({ payment_status: 'paid', paid_at: now }).eq('id', orderId).neq('payment_status', 'paid')

  // Счёт-документ оплачен → заказ становится реальным: cart→pending (появляется в панели
  // оператора), а сделка amoCRM двигается «Счёт выставлен» → «Новый» (входит в воронку продаж).
  if (order?.status === 'cart') {
    await sb.from('orders').update({ status: 'pending' }).eq('id', orderId).eq('status', 'cart')
    if (order.amo_lead_id) {
      try {
        const { patchLeadStage, AMO_STATUS_NEW } = await import('@/lib/amo')
        await patchLeadStage(order.amo_lead_id as number, AMO_STATUS_NEW)
      } catch (e) {
        console.error('[invoice] amo stage move (Счёт выставлен→Новый) failed:', e instanceof Error ? e.message : e)
      }
    }
  }

  console.log(`[invoice] № ${finalInvoice.invoice_number} (order ${orderId}) → paid, source=${source}`)
  return { ok: true, invoice: finalInvoice, alreadyPaid: false }
}

/** Прочитать счёт заказа без создания. null-счёт, если его ещё нет. */
export async function getInvoiceForOrder(orderId: number): Promise<
  { ok: true; invoice: InvoiceRow | null; downloadUrl: string | null } | { ok: false; reason: 'ERROR'; message: string }
> {
  const sb = createAdminClient()
  const { data: invoice, error } = await sb.from('invoices').select('*').eq('order_id', orderId).maybeSingle()
  if (error) return { ok: false, reason: 'ERROR', message: error.message }
  if (!invoice) return { ok: true, invoice: null, downloadUrl: null }
  return { ok: true, invoice: invoice as InvoiceRow, downloadUrl: await sign(sb, invoice.pdf_url) }
}

/**
 * Получить-или-создать счёт заказа. withPdf=true → дополнительно генерит PDF (если ещё нет)
 * и кладёт в Storage. Возвращает счёт и подписанную ссылку на PDF (если он сгенерирован).
 */
export async function ensureInvoiceForOrder(
  orderId: number,
  opts: { withPdf?: boolean } = {},
): Promise<InvoiceResult> {
  const ctx = await loadContext(orderId)
  if ('error' in ctx && ctx.error) return { ok: false, ...ctx.error }
  const { sb, client, lines, amount } = ctx as Required<Awaited<ReturnType<typeof loadContext>>>

  // Реквизиты юр.лица обязательны: компания + БИН (12 цифр). Без них счёт/QR не строим.
  const bin = (client.bin ?? '').trim()
  const company = (client.company_name ?? '').trim()
  if (!company || !/^\d{12}$/.test(bin)) {
    return { ok: false, reason: 'NO_BIN', message: 'Не заполнены реквизиты организации (название + БИН 12 цифр)' }
  }

  // Идемпотентность: один заказ = один счёт.
  let { data: invoice } = await sb.from('invoices').select('*').eq('order_id', orderId).maybeSingle()
  if (!invoice) {
    const { data: created, error } = await sb
      .from('invoices')
      .insert({ order_id: orderId, client_id: client.id, amount, status: 'sent', pay_method: 'transfer' })
      .select('*')
      .single()
    if (error || !created) return { ok: false, reason: 'ERROR', message: error?.message || 'Не удалось создать счёт' }
    invoice = created
  } else if (invoice.status !== 'paid' && Number(invoice.amount) !== amount) {
    // Заказ изменился ПОСЛЕ выставления счёта (например добавили доставку) и счёт ещё
    // не оплачен — синкаем сумму на актуальную. Без этого invoices.amount застревает на
    // значении из момента создания счёта, а QR (amount зашит в саму ссылку) и PDF продолжают
    // показывать/требовать устаревшую сумму — расхождение с тем, что реально должен заказ.
    // pdf_url=null форсирует перегенерацию PDF ниже (тем же путём/файлом, upsert).
    const { data: synced } = await sb
      .from('invoices')
      .update({ amount, pdf_url: null })
      .eq('id', invoice.id)
      .select('*')
      .single()
    if (synced) invoice = synced
  }

  // QR-ссылка по реальным номеру/guid счёта.
  const qrLink = buildInvoiceQrLink({
    bin, guid: invoice.guid, amount: Number(invoice.amount), invoiceNumber: invoice.invoice_number,
  })

  const patch: Record<string, unknown> = {}
  if (invoice.qr_link !== qrLink) patch.qr_link = qrLink

  // PDF — по запросу и только если ещё не сгенерирован.
  if (opts.withPdf && !invoice.pdf_url) {
    const pdf = await generateInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      date: invoice.created_at,
      buyer: { companyName: client.company_name, bin },
      lines,
      qrLink,
      amount: Number(invoice.amount),
    })
    const path = `${invoice.invoice_number}.pdf`
    const up = await sb.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    if (up.error) return { ok: false, reason: 'ERROR', message: up.error.message }
    patch.pdf_url = path
  }

  if (Object.keys(patch).length) {
    const { data: upd } = await sb.from('invoices').update(patch).eq('id', invoice.id).select('*').single()
    if (upd) invoice = upd
  }

  return { ok: true, invoice: invoice as InvoiceRow, downloadUrl: await sign(sb, invoice.pdf_url) }
}
