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
      id, name, display_name, length_cm, category, subcategory, variety_type, pack_size, stems_per_pack, weight_gram,
      colors, color_images, image_url, campaign_image_url, extra_images, arrival_date, price, previous_price, qty, country_iso, tags, farm,
      pot_diameter, container_code, quality_grade, min_plants_per_pot, min_flowers_per_pot,
      pot_color, pot_material, pot_form, substrate, variant, description,
      subgroup, unit, price_per_m, price_per_m2, volume_l, short_description, source
    `)
    .eq('is_active', true)
    .in('source', ['uralsk_site', 'uralsk_1c'])
    .order('name')
    .order('length_cm')

  if (!catalogMode) {
    query = query.gt('qty', 0)
  }

  query = query.limit(5000)

  if (searchQuery) {
    const { data: expandedTerms } = await supabase
      .rpc('expand_search_query', { search_text: searchQuery })

    if (expandedTerms && expandedTerms.length > 0) {
      const searchConditions = expandedTerms
        .flatMap((term: string) => {
          const c = [`name.ilike.%${term}%`]
          // subcategory.eq — только для slug-подобных токенов (канон-slug подкатегорий),
          // чтобы не сломать PostgREST or() кириллицей/пробелами и точно матчить лист
          if (/^[a-z0-9_]+$/.test(term)) c.push(`subcategory.eq.${term}`)
          return c
        })
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
