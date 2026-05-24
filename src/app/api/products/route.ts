import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const searchQuery = request.nextUrl.searchParams.get('search')?.trim() || ''

  let query = supabase
    .from('products')
    .select(`id, name, display_name, variety_name, length_str, length_cm, category, subcategory, variety_type, color, colors, floral_role, stem_durability, season, tags, origin, description, pot_size, pack_size, image_url, campaign_image_url, images, previous_price, arrival_date, stock:stock_available (price, qty, qty_reserved, is_available, reserved_qty, available_qty)`)
    .eq('is_active', true)
    .order('variety_name')
    .order('length_cm')

  if (searchQuery) {
    const { data: expandedTerms } = await supabase
      .rpc('expand_search_query', { search_text: searchQuery })

    if (expandedTerms && expandedTerms.length > 0) {
      const searchConditions = expandedTerms.flatMap((term: string) => [
        `name.ilike.%${term}%`,
        `variety_name.ilike.%${term}%`,
        `variety_type.ilike.%${term}%`,
      ]).join(',')

      query = query.or(searchConditions)
    } else {
      query = query.or(
        `name.ilike.%${searchQuery}%,variety_name.ilike.%${searchQuery}%`
      )
    }
  }

  const { data } = await query
  const today = new Date().toISOString().split('T')[0]
  const result = (data ?? []).map((p: any) => ({
    ...p,
    is_new: p.arrival_date === today,
  }))
  return NextResponse.json(result)
}
