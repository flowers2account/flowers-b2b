import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const admin = createAdminClient()

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    category = 'cut',
    onlyAvailable = true,
  } = body

  const [{ data: products }, { data: stockData }] = await Promise.all([
    admin
      .from('products')
      .select('id, colors, length_cm, country_iso')
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
    colors: string[] | null
    length_cm: number | null
    country_iso: string | null
  }

  const base = (products as RawProduct[] ?? []).filter(
    p => !onlyAvailable || availableIds.has(p.id)
  )

  const colorCounts: Record<string, number> = {}
  base.forEach(p => {
    (p.colors ?? []).forEach(c => { colorCounts[c] = (colorCounts[c] || 0) + 1 })
  })

  const lengthCounts: Record<number, number> = {}
  base.forEach(p => {
    if (p.length_cm) lengthCounts[p.length_cm] = (lengthCounts[p.length_cm] || 0) + 1
  })

  const countryCounts: Record<string, number> = {}
  base.forEach(p => {
    if (p.country_iso) countryCounts[p.country_iso] = (countryCounts[p.country_iso] || 0) + 1
  })

  return NextResponse.json({
    subcatCounts: {},
    vtCounts: {},
    colorCounts,
    lengthCounts,
    originCounts: countryCounts,
    seasonCounts: {},
    countryCounts,
  })
}
