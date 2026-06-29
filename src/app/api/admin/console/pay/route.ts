import { NextRequest, NextResponse } from 'next/server'
import { getAuthedWithRole, sessionClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Ручное подтверждение оплаты оператором (путь юр/счёт и наличные).
// Авто-методы (epay/card/halyk_qr) подтверждаются постлинком — здесь их трогать
// не нужно, но запрета нет: эндпоинт идемпотентен.
export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const { order_id } = await req.json().catch(() => ({}))
  const id = Number(order_id)
  if (!id) return NextResponse.json({ error: 'order_id обязателен' }, { status: 400 })

  const sb = sessionClient(req)

  const { data: cur, error: readErr } = await sb
    .from('orders').select('id, payment_status').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!cur) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  if (cur.payment_status === 'paid') return NextResponse.json({ ok: true, payment_status: 'paid' })

  const { data, error } = await sb
    .from('orders')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, payment_status, paid_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, payment_status: data.payment_status, paid_at: data.paid_at })
}
