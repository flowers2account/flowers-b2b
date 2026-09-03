import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/api-auth'
import { normalizePhone } from '@/lib/phone'
import { verifyOrderAccessToken } from '@/lib/order-access-token'
import { unitForProduct } from '@/lib/category-tree'
import { generateSpecPdf, type SpecLine } from '@/lib/invoice/generate-spec-pdf'

export const dynamic = 'force-dynamic'

/** Доступ: гостевой токен заказа ИЛИ владелец (по телефону/auth_user_id) ИЛИ admin/manager. */
async function authorize(req: NextRequest, orderId: number): Promise<{ ok: true } | { ok: false; status: number }> {
  const guest = verifyOrderAccessToken(req.headers.get('x-order-access-token'), orderId)
  const sb = createAdminClient()
  if (guest) {
    const { data: order } = await sb.from('orders').select('client_id').eq('id', orderId).maybeSingle()
    if (order?.client_id === guest.clientId) return { ok: true }
  }

  const authed = await getAuthedUser(req)
  if (!authed) return { ok: false, status: 401 }

  const { data: prof } = await sb.from('profiles').select('role').eq('id', authed.userId).maybeSingle()
  if (['admin', 'manager'].includes((prof?.role as string) ?? '')) return { ok: true }

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
  const orderId = parseInt((await params).id, 10)
  if (!Number.isFinite(orderId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const auth = await authorize(req, orderId)
  if (!auth.ok) return NextResponse.json({ error: 'Нет доступа' }, { status: auth.status })

  const sb = createAdminClient()
  const { data: order } = await sb
    .from('orders')
    .select(`
      id, total, delivery_cost, delivery_city, created_at, client_id,
      order_items ( qty, qty_ordered, qty_actual, is_removed, price, color,
        product:products ( id, name, display_name, unit, subcategory ) )
    `)
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })

  const visible = (order.order_items ?? []).filter((i) => !i.is_removed)
  const lines: SpecLine[] = visible.map((i) => {
    const qty = i.qty_actual ?? i.qty_ordered ?? i.qty ?? 0
    const p = Array.isArray(i.product) ? i.product[0] : i.product
    return {
      name: (p?.display_name || p?.name || '').trim() || `Товар #${p?.id ?? ''}`,
      qty: Number(qty) || 0,
      price: Number(i.price) || 0,
      unit: p ? unitForProduct(p) : 'шт',
      color: i.color ?? null,
    }
  }).filter((l) => l.qty > 0)

  const goodsSum = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const total = Number(order.total ?? goodsSum)
  const delivery = Number(order.delivery_cost ?? 0)
  // Скидка = вычет на проверенных полях (как на странице заказа): товары − (итог − доставка).
  const discount = Math.max(0, goodsSum - (total - delivery))

  let buyer: { name?: string | null; companyName?: string | null; bin?: string | null } | null = null
  if (order.client_id) {
    const { data: client } = await sb
      .from('clients').select('name, company_name, bin').eq('id', order.client_id).maybeSingle()
    if (client) buyer = { name: client.name, companyName: client.company_name, bin: client.bin }
  }

  const pdf = await generateSpecPdf({
    orderNumber: order.id,
    date: order.created_at ?? new Date(),
    buyer,
    lines,
    discount,
    delivery,
    total,
  })

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="nakladnaya-${order.id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
