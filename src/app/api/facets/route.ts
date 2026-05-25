import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const admin = createAdminClient()

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { category = 'cut', onlyAvailable = true } = body

  const { data: products } = await admin
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

  const base = (products as RawProduct[] ?? []).filter(
    p => !onlyAvailable || p.qty > 0
  )

  const colorCounts: Record<string, number> = {}
  base.forEach(p => {
    (p.colors ?? []).forEach(c => { colorCounts[c] = (colorCounts[c] || 0) + 1 })
  })

  const lengthCounts: Record<number, number> = {}
  base.forEach(p => {
    if (p.length_cm) lengthCounts[p.length_cm] = (lengthCounts[p.length_cm] || 0) + 1
  })

  const originCounts: Record<string, number> = {}
  base.forEach(p => {
    if (p.country_iso) originCounts[p.country_iso] = (originCounts[p.country_iso] || 0) + 1
  })

  const subcatCounts: Record<string, number> = {}
  base.forEach(p => {
    if (p.subcategory) subcatCounts[p.subcategory] = (subcatCounts[p.subcategory] || 0) + 1
  })

  const vtCounts: Record<string, number> = {}
  base.forEach(p => {
    if (p.variety_type) vtCounts[p.variety_type] = (vtCounts[p.variety_type] || 0) + 1
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
