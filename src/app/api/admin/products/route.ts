import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const admin = createAdminClient()

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const inStock = searchParams.get('inStock') === 'true'

  let query = admin
    .from('products')
    .select(`
      id, name, display_name, length_cm, category,
      pack_size, image_url, colors, country_iso,
      price, qty, is_active, arrival_date,
      stock:stock_available(qty, qty_reserved, available_qty, is_active)
    `)
    .order('name')
    .order('length_cm', { ascending: true, nullsFirst: false })
    .limit(500)

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date().toISOString().split('T')[0]
  let products = (data ?? []).map((p: any) => {
    const s = Array.isArray(p.stock) ? p.stock[0] : p.stock
    return {
      ...p,
      is_new: p.arrival_date === today,
      stock: {
        price: p.price ?? 0,
        qty: s?.qty ?? p.qty ?? 0,
        qty_reserved: s?.qty_reserved ?? 0,
        available_qty: s?.available_qty ?? p.qty ?? 0,
        is_available: (s?.available_qty ?? p.qty ?? 0) > 0,
      },
    }
  })

  if (inStock) {
    products = products.filter((p: any) => (p.qty ?? 0) > 0)
  }

  return NextResponse.json(products)
}
