import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { category = 'cut', onlyAvailable = true, subcat = null, varietyType = null } = body

  const supabase = await createClient()

  type RawProduct = {
    id: number
    colors: string[] | null
    length_cm: number | null
    country_iso: string | null
    subcategory: string | null
    variety_type: string | null
    qty: number
    farm: string | null
  }

  const PAGE = 900
  let products: RawProduct[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, colors, length_cm, country_iso, subcategory, variety_type, qty, farm')
      .eq('is_active', true)
      .eq('category', category)
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    products = products.concat(data as RawProduct[])
    if (data.length < PAGE) break
    from += PAGE
  }

  // All available products in category
  const allBase = products.filter(
    p => !onlyAvailable || p.qty > 0
  )

  // subcatCounts: never filtered by subcat so user can always switch categories
  const subcatCounts: Record<string, number> = {}
  allBase.forEach(p => {
    if (p.subcategory) subcatCounts[p.subcategory] = (subcatCounts[p.subcategory] || 0) + 1
  })

  // vtCounts: scoped to selected subcat
  const subcatBase = subcat ? allBase.filter(p => p.subcategory === subcat) : allBase
  const vtCounts: Record<string, number> = {}
  subcatBase.forEach(p => {
    if (p.variety_type) vtCounts[p.variety_type] = (vtCounts[p.variety_type] || 0) + 1
  })

  // color/length/origin: scoped to both subcat and varietyType selections
  const detailBase = varietyType ? subcatBase.filter(p => p.variety_type === varietyType) : subcatBase

  const colorCounts: Record<string, number> = {}
  detailBase.forEach(p => {
    (p.colors ?? []).forEach(c => { colorCounts[c] = (colorCounts[c] || 0) + 1 })
  })

  const lengthCounts: Record<number, number> = {}
  detailBase.forEach(p => {
    if (p.length_cm) lengthCounts[p.length_cm] = (lengthCounts[p.length_cm] || 0) + 1
  })

  const originCounts: Record<string, number> = {}
  detailBase.forEach(p => {
    if (p.country_iso) originCounts[p.country_iso] = (originCounts[p.country_iso] || 0) + 1
  })

  const farmCounts: Record<string, number> = {}
  detailBase.forEach(p => {
    if (p.farm) farmCounts[p.farm] = (farmCounts[p.farm] || 0) + 1
  })

  return NextResponse.json({
    subcatCounts,
    vtCounts,
    colorCounts,
    lengthCounts,
    originCounts,
    seasonCounts: {},
    farmCounts,
  })
}
