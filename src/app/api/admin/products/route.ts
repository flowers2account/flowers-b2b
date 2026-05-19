import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const admin = createAdminClient()

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const inStock = searchParams.get('inStock') === 'true'

  // Build query — show ALL products including is_active=false (for photo management)
  let query = admin
    .from('products')
    .select(`
      id, name, variety_name, length_str, length_cm, category,
      subcategory, pack_size, stems_per_pack, image_url, campaign_image_url,
      colors, color, origin, is_active, arrival_date,
      stock:stock(price, qty, qty_reserved, is_available)
    `)
    .order('variety_name', { ascending: true, nullsFirst: false })
    .order('name')
    .order('length_cm', { ascending: true, nullsFirst: false })
    .limit(500)

  if (inStock) {
    // Filter to only products with qty > 0 — applied via stock join
    // Supabase doesn't support filter on joined table directly, so we filter after fetch
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,variety_name.ilike.%${search}%,origin.ilike.%${search}%,length_str.ilike.%${search}%`
    )
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date().toISOString().split('T')[0]
  let products = (data ?? []).map((p: any) => {
    const s = Array.isArray(p.stock) ? p.stock[0] : p.stock
    return {
      ...p,
      stock: s ?? null,
      is_new: p.arrival_date === today,
    }
  })

  if (inStock) {
    products = products.filter((p: any) => (p.stock?.qty ?? 0) > 0)
  }

  return NextResponse.json(products)
}
