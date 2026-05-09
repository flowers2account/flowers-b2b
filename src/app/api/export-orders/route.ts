export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = req.nextUrl

  // Defaults: last 30 days
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const defaultFrom = new Date(now.getTime() - 29 * 86_400_000).toISOString().split('T')[0]

  const from = searchParams.get('from') || defaultFrom
  const to   = searchParams.get('to')   || todayStr
  const statusParam = searchParams.get('status') // comma-separated, e.g. "delivered,confirmed"

  const statuses = statusParam
    ? statusParam.split(',').map(s => s.trim()).filter(Boolean)
    : ['delivered']

  let query = supabase
    .from('orders')
    .select(`
      id, status, created_at, total,
      client:client_id(name, phone),
      order_items(qty, price, product:product_id(name))
    `)
    .gte('created_at', new Date(from).toISOString())
    .lte('created_at', new Date(to + 'T23:59:59').toISOString())
    .order('created_at')

  if (statuses.length === 1) {
    query = query.eq('status', statuses[0])
  } else {
    query = query.in('status', statuses)
  }

  const { data: orders } = await query

  const rows: any[] = []
  for (const order of orders ?? []) {
    const client = (order.client as any)
    const clientName = client?.name ?? '—'
    const clientPhone = client?.phone ?? '—'
    const date = new Date(order.created_at).toLocaleDateString('ru-RU', { timeZone: 'Asia/Oral' })
    for (const item of (order.order_items as any[]) ?? []) {
      rows.push({
        'Дата':     date,
        'Заказ №':  order.id,
        'Статус':   (order as any).status ?? '—',
        'Клиент':   clientName,
        'Телефон':  clientPhone,
        'Товар':    item.product?.name ?? '—',
        'Кол-во':   item.qty,
        'Цена':     item.price,
        'Сумма':    item.qty * item.price,
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
