import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { category = 'cut', onlyAvailable = true, subcat = null, varietyType = null } = body

  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('id, colors, length_cm, country_iso, subcategory, variety_type, qty')
    .eq('is_active', true)
    .eq('category', category)

  type RawProduct = {
    id: number
    colors: string[] | null
    length_cm: number | null
    country_iso: string | null
    subcategory: string | null
    variety_type: string | null
    qty: number
  }

  // All available products in category
  const allBase = (products as RawProduct[] ?? []).filter(
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

  return NextResponse.json({
    subcatCounts,
    vtCounts,
    colorCounts,
    lengthCounts,
    originCounts,
    seasonCounts: {},
  })
}
