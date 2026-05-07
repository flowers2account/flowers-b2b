import { createClient } from '@/lib/supabase/server'
import FilterPanel from '@/components/catalog/FilterPanel'
import ProductGrid from '@/components/catalog/ProductGrid'
import DetailPanel from '@/components/catalog/DetailPanel'
import CatalogLayout from '@/components/catalog/CatalogLayout'

export const revalidate = 0

export default async function HomePage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select(`id, name, variety_name, length_str, length_cm, category, subcategory, variety_type, color, colors, floral_role, stem_durability, season, origin, description, pot_size, pack_size, image_url, images, previous_price, stock:stock_available (price, qty, qty_reserved, is_available, available_qty, reserved_qty)`)
    .eq('is_active', true)
    .order('variety_name')
    .order('length_cm')

  const list = products ?? []

  return (
    <CatalogLayout
      left={<FilterPanel products={list} />}
      center={<ProductGrid products={list} />}
      right={<DetailPanel />}
    />
  )
}
