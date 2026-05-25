import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const searchQuery = request.nextUrl.searchParams.get('search')?.trim() || ''

  let query = supabase
    .from('products')
    .select(`
      id, name, display_name, length_cm, category, pack_size,
      colors, image_url, arrival_date, price, qty, country_iso,
      stock:stock_available(available_qty)
    `)
    .eq('is_active', true)
    .order('name')
    .order('length_cm')

  if (searchQuery) {
    const { data: expandedTerms } = await supabase
      .rpc('expand_search_query', { search_text: searchQuery })

    if (expandedTerms && expandedTerms.length > 0) {
      const searchConditions = expandedTerms
        .map((term: string) => `name.ilike.%${term}%`)
        .join(',')
      query = query.or(searchConditions)
    } else {
      query = query.ilike('name', `%${searchQuery}%`)
    }
  }

  const { data } = await query
  const today = new Date().toISOString().split('T')[0]
  const result = (data ?? []).map((p: any) => {
    const stockRow = Array.isArray(p.stock) ? p.stock[0] : p.stock
    const available_qty = stockRow?.available_qty ?? p.qty
    return {
      ...p,
      is_new: p.arrival_date === today,
      stock: {
        price: p.price,
        qty: p.qty,
        qty_reserved: Math.max(0, p.qty - available_qty),
        is_available: available_qty > 0,
        available_qty,
      },
    }
  })
  return NextResponse.json(result)
}
