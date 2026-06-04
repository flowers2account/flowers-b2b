import { createClient } from '@/lib/supabase/server'
import FilterPanel from '@/components/catalog/FilterPanel'
import ProductGrid from '@/components/catalog/ProductGrid'
import DetailPanel from '@/components/catalog/DetailPanel'
import CatalogLayout from '@/components/catalog/CatalogLayout'
import CtxBar from '@/components/catalog/CtxBar'

export const dynamic = 'force-dynamic'

const SELECT_FIELDS = `id, name, display_name, length_cm, pot_diameter, category, subcategory, variety_type, pack_size, stems_per_pack, weight_gram, colors, image_url, campaign_image_url, extra_images, arrival_date, price, previous_price, qty, country_iso, tags, farm, container_code, quality_grade, min_plants_per_pot, min_flowers_per_pot, pot_color, pot_material, pot_form, substrate, variant, description, subgroup, unit, price_per_m, price_per_m2, volume_l, short_description, source`

async function fetchAllProducts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const PAGE = 900
  let all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select(SELECT_FIELDS)
      .eq('is_active', true)
      .in('source', ['uralsk_site', 'uralsk_1c'])
      .gt('qty', 0)
      .order('name')
      .order('length_cm')
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

export default async function HomePage() {
  const supabase = await createClient()
  const data = await fetchAllProducts(supabase)

  const today = new Date().toISOString().split('T')[0]
  const list = data.map((p: any) => ({
    ...p,
    variety_name: null,
    length_str: null,
    is_new: p.arrival_date === today,
    stock: {
      price: p.price ?? 0,
      qty: p.qty ?? 0,
      qty_reserved: 0,
      is_available: (p.qty ?? 0) > 0,
      available_qty: p.qty ?? 0,
    },
  }))

  return (
    <>
      <CtxBar />
      <CatalogLayout
        left={<FilterPanel products={list} />}
        center={<ProductGrid products={list} />}
        right={<DetailPanel />}
      />
    </>
  )
}
