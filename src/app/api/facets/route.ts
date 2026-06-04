import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    category = 'cut', onlyAvailable = true,
    subcat = null, varietyType = null,
    subgroup = null, volumeRanges = [],
  } = body

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
    subgroup: string | null
    volume_l: number | null
  }

  const VOLUME_TEST: Record<string, (v: number) => boolean> = {
    'до5':   v => v <= 5,
    '5-15':  v => v > 5 && v <= 15,
    '15-40': v => v > 15 && v <= 40,
    '40+':   v => v > 40,
  }

  const PAGE = 900
  let products: RawProduct[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, colors, length_cm, country_iso, subcategory, variety_type, qty, farm, subgroup, volume_l')
      .eq('is_active', true)
      .eq('category', category)
      .in('source', ['uralsk_site', 'uralsk_1c'])
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    products = products.concat(data as RawProduct[])
    if (data.length < PAGE) break
    from += PAGE
  }

  // All available products in category
  let allBase = products.filter(p => !onlyAvailable || p.qty > 0)

  // Apply subgroup and volumeRanges to narrow detail facets
  if (subgroup) allBase = allBase.filter(p => p.subgroup === subgroup)
  if (volumeRanges.length > 0) {
    allBase = allBase.filter(p => {
      const v = Number(p.volume_l)
      return v > 0 && volumeRanges.some((id: string) => VOLUME_TEST[id]?.(v))
    })
  }

  // subcatCounts: counts without subgroup/volume so switching subcats always works
  const baseForSubcats = products.filter(p => !onlyAvailable || p.qty > 0)
  const subcatCounts: Record<string, number> = {}
  baseForSubcats.forEach(p => {
    if (p.subcategory) subcatCounts[p.subcategory] = (subcatCounts[p.subcategory] || 0) + 1
  })

  // vtCounts: scoped to selected subcat (with subgroup/volume applied)
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
