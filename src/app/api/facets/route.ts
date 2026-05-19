import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const admin = createAdminClient()

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    category = 'cut',
    subcat = '',
    varietyType = '',
    onlyAvailable = true,
  } = body

  const [{ data: products }, { data: stockData }] = await Promise.all([
    admin
      .from('products')
      .select('id, subcategory, variety_type, colors, color')
      .eq('is_active', true)
      .eq('category', category),
    admin
      .from('stock_available')
      .select('product_id, available_qty'),
  ])

  const availableIds = new Set(
    (stockData ?? [])
      .filter((s: { product_id: number; available_qty: number }) => s.available_qty > 0)
      .map((s: { product_id: number }) => s.product_id)
  )

  type RawProduct = {
    id: number
    subcategory: string | null
    variety_type: string | null
    colors: string[] | null
    color: string | null
  }

  const base = (products as RawProduct[] ?? []).filter(
    p => !onlyAvailable || availableIds.has(p.id)
  )

  // subcatCounts: ignore subcat/varietyType filters so all subcats stay visible
  const subcatCounts: Record<string, number> = {}
  base.forEach(p => {
    if (p.subcategory) subcatCounts[p.subcategory] = (subcatCounts[p.subcategory] || 0) + 1
  })

  // vtCounts: within selected subcat only
  const vtCounts: Record<string, number> = {}
  base
    .filter(p => p.subcategory === subcat)
    .forEach(p => {
      if (p.variety_type) vtCounts[p.variety_type] = (vtCounts[p.variety_type] || 0) + 1
    })

  // colorCounts: filtered by subcat + varietyType (but NOT by colors — standard faceting)
  const colorBase = base.filter(p =>
    (!subcat || p.subcategory === subcat) &&
    (!varietyType || p.variety_type === varietyType)
  )
  const colorCounts: Record<string, number> = {}
  colorBase.forEach(p => {
    const cols = p.colors?.length ? p.colors : (p.color ? [p.color] : [])
    cols.forEach(c => { colorCounts[c] = (colorCounts[c] || 0) + 1 })
  })

  return NextResponse.json({ subcatCounts, vtCounts, colorCounts })
}
