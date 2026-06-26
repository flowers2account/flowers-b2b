import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/api-auth'
import { normalizePhone } from '@/lib/phone'
import { ensureInvoiceForOrder, getInvoiceForOrder } from '@/lib/invoice/create-invoice'

export const dynamic = 'force-dynamic'

const statusFor = (reason: string) =>
  reason === 'NO_BIN' ? 400 : reason === 'ERROR' ? 500 : 404

/** Доступ: владелец заказа (по телефону токена) ИЛИ admin/manager. */
async function authorize(req: NextRequest, orderId: number): Promise<{ ok: true } | { ok: false; status: number }> {
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
