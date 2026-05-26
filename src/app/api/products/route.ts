import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const searchQuery = request.nextUrl.searchParams.get('search')?.trim() || ''

  const catalogMode = request.nextUrl.searchParams.get('catalog') === '1'

  let query = supabase
    .from('products')
    .select(`
      id, name, display_name, length_cm, category, pack_size,
      colors, image_url, campaign_image_url, arrival_date, price, previous_price, qty, country_iso, tags
    `)
    .eq('is_active', true)
    .order('name')
    .order('length_cm')

  if (!catalogMode) {
    query = query.gt('qty', 0)
  }

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
  const result = (data ?? []).map((p: any) => ({
    ...p,
    is_new: p.arrival_date === today,
    stock: {
      price: p.price,
      qty: p.qty,
      qty_reserved: 0,
      is_available: p.qty > 0,
      available_qty: p.qty,
    },
  }))
  return NextResponse.json(result)
}
