import { createClient } from '@/lib/supabase/server'
import FilterPanel from '@/components/catalog/FilterPanel'
import ProductGrid from '@/components/catalog/ProductGrid'
import DetailPanel from '@/components/catalog/DetailPanel'
import CatalogLayout from '@/components/catalog/CatalogLayout'

export const revalidate = 0

export default async function HomePage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select(`id, name, display_name, length_cm, pot_diameter, category, subcategory, variety_type, pack_size, stems_per_pack, weight_gram, colors, image_url, campaign_image_url, arrival_date, price, previous_price, qty, country_iso, tags, farm`)
    .eq('is_active', true)
    .gt('qty', 0)
    .order('name')
    .order('length_cm')

  const today = new Date().toISOString().split('T')[0]
  const list = (data ?? []).map((p: any) => ({
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
    <CatalogLayout
      left={<FilterPanel products={list} />}
      center={<ProductGrid products={list} />}
      right={<DetailPanel />}
    />
  )
}
