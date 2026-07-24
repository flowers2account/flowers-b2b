import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

let _admin: ReturnType<typeof createAdminClient> | null = null
const getAdmin = () => (_admin ??= createAdminClient())

export async function GET(req: NextRequest) {
  const admin = getAdmin()
  const { searchParams } = new URL(req.url)
  const search      = searchParams.get('search')?.trim() ?? ''
  const inStock     = searchParams.get('inStock') === 'true'
  const category    = searchParams.get('category')?.trim() ?? ''
  const subcategory = searchParams.get('subcategory')?.trim() ?? ''

  let query = admin
    .from('products')
    .select(`
      id, name, display_name, length_cm, category, subcategory,
      pack_size, stems_per_pack, image_url, campaign_image_url, colors, color_images, country_iso, farm,
      price, previous_price, qty, site_qty, is_active, arrival_date
    `)
    .order('name')
    .order('length_cm', { ascending: true, nullsFirst: false })
    .limit(600)

  if (search)      query = query.ilike('name', `%${search}%`)
  if (category)    query = query.eq('category', category)
  if (subcategory) query = query.eq('subcategory', subcategory)
  if (inStock)     query = query.or('qty.gt.0,site_qty.gt.0')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  const products = (data ?? []).map((p: any) => {
    const stockQty = Math.max(Number(p.qty) || 0, Number(p.site_qty) || 0)
    const qty_reserved = reservedMap.get(p.id) ?? 0
    const available_qty = Math.max(0, stockQty - qty_reserved)
    return {
      ...p,
      qty: stockQty,
      is_new: p.arrival_date === today,
      stock: {
        price: p.price ?? 0,
        qty: stockQty,
        qty_reserved,
        available_qty,
        is_available: available_qty > 0,
      },
    }
  })

  return NextResponse.json(products)
}
