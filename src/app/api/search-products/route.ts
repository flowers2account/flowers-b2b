export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json([])

  const { data, error } = await supabase
    .from('stock_available')
    .select('product_id, price, available_qty')
    .gt('available_qty', 0)

  if (error || !data) return NextResponse.json([])

  const productIds = data.map(d => d.product_id)

  const { data: products } = await supabase
    .from('products')
    .select('id, name, pack_size')
    .in('id', productIds)
    .ilike('name', `%${q}%`)
    .eq('is_active', true)
    .limit(15)

  const stockMap = new Map(data.map(d => [d.product_id, d]))

  const result = (products ?? []).map(p => ({
    id: p.id,
    name: p.name,
    pack_size: p.pack_size ?? 1,
    price: stockMap.get(p.id)?.price ?? 0,
    available_qty: stockMap.get(p.id)?.available_qty ?? 0,
  }))

  return NextResponse.json(result)
}
