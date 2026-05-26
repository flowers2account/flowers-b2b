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
      pack_size, image_url, campaign_image_url, colors, country_iso, farm,
      price, qty, is_active, arrival_date
    `)
    .order('name')
    .order('length_cm', { ascending: true, nullsFirst: false })
    .limit(500)

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch reserved quantities separately
  const ids = (data ?? []).map((p: any) => p.id)
  let reservedMap = new Map<number, number>()
  if (ids.length > 0) {
    const now = new Date().toISOString()
    const { data: resData } = await admin
      .from('reservations')
      .select('product_id, qty')
      .in('product_id', ids)
      .gt('expires_at', now)
    for (const r of resData ?? []) {
      reservedMap.set(r.product_id, (reservedMap.get(r.product_id) ?? 0) + r.qty)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  let products = (data ?? []).map((p: any) => {
    const qty_reserved = reservedMap.get(p.id) ?? 0
    const available_qty = Math.max(0, p.qty - qty_reserved)
    return {
      ...p,
      is_new: p.arrival_date === today,
      stock: {
        price: p.price ?? 0,
        qty: p.qty ?? 0,
        qty_reserved,
        available_qty,
        is_available: available_qty > 0,
      },
    }
  })

  if (inStock) {
    products = products.filter((p: any) => (p.qty ?? 0) > 0)
  }

  return NextResponse.json(products)
}
