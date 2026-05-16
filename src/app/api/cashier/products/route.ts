export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const { data: stockData, error: stockErr } = await supabase
    .from('stock_available')
    .select('product_id, price, available_qty')
    .gt('available_qty', 0)

  if (stockErr || !stockData?.length) return NextResponse.json([])

  const ids = stockData.map(s => s.product_id)

  const { data: productData } = await supabase
    .from('products')
    .select('id, name, pack_size, category, image_url, variety_name, length_str')
    .in('id', ids)
    .eq('is_active', true)
    .order('name')

  const stockMap = new Map(stockData.map(s => [s.product_id, s]))

  const result = (productData ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    pack_size: p.pack_size ?? 1,
    category: p.category ?? 'cut',
    image_url: p.image_url ?? null,
    variety_name: p.variety_name ?? null,
    length_str: p.length_str ?? null,
    price: (stockMap.get(p.id) as any)?.price ?? 0,
    available_qty: (stockMap.get(p.id) as any)?.available_qty ?? 0,
  }))

  return NextResponse.json(result)
}
