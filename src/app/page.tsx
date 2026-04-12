import { createClient } from '@/lib/supabase/server'
import PriceTable from '@/components/catalog/PriceTable'

export default async function HomePage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, category, length_cm, pot_diameter,
      stock (price, qty, qty_reserved, is_available)
    `)
    .eq('is_active', true)
    .eq('stock.is_available', true)
    .order('name')

  return <PriceTable products={products ?? []} />
}
