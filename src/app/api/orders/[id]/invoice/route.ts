import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/api-auth'
import { normalizePhone } from '@/lib/phone'
import { ensureInvoiceForOrder, getInvoiceForOrder, markInvoicePaidByOrder } from '@/lib/invoice/create-invoice'
import { verifyOrderAccessToken } from '@/lib/order-access-token'

export const dynamic = 'force-dynamic'

/** Только сотрудник (admin/manager). */
async function requireStaff(req: NextRequest): Promise<boolean> {
  const authed = await getAuthedUser(req)
  if (!authed) return false
  const sb = createAdminClient()
  const { data: prof } = await sb.from('profiles').select('role').eq('id', authed.userId).maybeSingle()
  return ['admin', 'manager'].includes((prof?.role as string) ?? '')
}

const statusFor = (reason: string) =>
  reason === 'NO_BIN' ? 400 : reason === 'ERROR' ? 500 : 404

/** Доступ: владелец заказа (по телефону токена) ИЛИ admin/manager. */
async function authorize(req: NextRequest, orderId: number): Promise<{ ok: true } | { ok: false; status: number }> {
  const guestToken = req.headers.get('x-order-access-token')
  const guest = verifyOrderAccessToken(guestToken, orderId)
  if (guest) {
    const sb = createAdminClient()
    const { data: order } = await sb.from('orders').select('client_id').eq('id', orderId).maybeSingle()
    if (order?.client_id === guest.clientId) return { ok: true }
  }

  const authed = await getAuthedUser(req)
  if (!authed) return { ok: false, status: 401 }

  const sb = createAdminClient()
  const { data: prof } = await sb.from('profiles').select('role').eq('id', authed.userId).maybeSingle()
  if (['admin', 'manager'].includes((prof?.role as string) ?? '')) return { ok: true }

  // Не сотрудник → должен быть владельцем заказа
  const { data: order } = await sb.from('orders').select('client_id').eq('id', orderId).maybeSingle()
  if (!order?.client_id) return { ok: false, status: 404 }
  const { data: client } = await sb
    .from('clients').select('phone, auth_user_id').eq('id', order.client_id).maybeSingle()
  const owns =
    client?.auth_user_id === authed.userId ||
    (!!authed.phone && client?.phone === normalizePhone(authed.phone))
  return owns ? { ok: true } : { ok: false, status: 403 }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orderId = parseInt((await params).id)
  if (!Number.isFinite(orderId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const auth = await authorize(req, orderId)
  if (!auth.ok) return NextResponse.json({ error: 'Нет доступа' }, { status: auth.status })

  const res = await getInvoiceForOrder(orderId)
  if (!res.ok) return NextResponse.json(res, { status: 500 })
  return NextResponse.json(res)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orderId = parseInt((await params).id)
  if (!Number.isFinite(orderId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const auth = await authorize(req, orderId)
  if (!auth.ok) return NextResponse.json({ error: 'Нет доступа' }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const withPdf = body?.withPdf !== false // по умолчанию формируем PDF (кнопка «Сформировать счёт»)

  const res = await ensureInvoiceForOrder(orderId, { withPdf })
  if (!res.ok) return NextResponse.json(res, { status: statusFor(res.reason) })
  return NextResponse.json(res)
}

// Ручное подтверждение оплаты счёта (для переводов по реквизитам — API банка их не видит).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orderId = parseInt((await params).id)
  if (!Number.isFinite(orderId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Только для сотрудников' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  if (body?.action !== 'mark-paid') return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })

  const res = await markInvoicePaidByOrder(orderId, 'manual')
  if (!res.ok) return NextResponse.json(res, { status: res.reason === 'NOT_FOUND' ? 404 : 500 })
  return NextResponse.json(res)
}
