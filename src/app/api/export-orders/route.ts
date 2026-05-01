export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, created_at, total,
      client:client_id(name, phone),
      order_items(qty, price, product:product_id(name))
    `)
    .eq('status', 'delivered')
    .gte('created_at', new Date(from).toISOString())
    .lte('created_at', new Date(to + 'T23:59:59').toISOString())
    .order('created_at')

  const rows: any[] = []
  for (const order of orders ?? []) {
    const client = (order.client as any)
    const clientName = client?.name ?? '—'
    const clientPhone = client?.phone ?? '—'
    const date = new Date(order.created_at).toLocaleDateString('ru-RU', { timeZone: 'Asia/Oral' })
    for (const item of (order.order_items as any[]) ?? []) {
      rows.push({
        'Дата': date,
        'Заказ №': order.id,
        'Клиент': clientName,
        'Телефон': clientPhone,
        'Товар': item.product?.name ?? '—',
        'Кол-во': item.qty,
        'Цена': item.price,
        'Сумма': item.qty * item.price,
      })
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Заказы')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="orders-${from}-${to}.xlsx"`,
    }
  })
}
