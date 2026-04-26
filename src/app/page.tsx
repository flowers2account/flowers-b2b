import { createClient } from '@/lib/supabase/server'
import PriceTable from '@/components/catalog/PriceTable'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select(`id, name, variety_name, length_str, length_cm, category, is_active, pack_size, image_url, stock (price, qty, qty_reserved, is_available)`)
    .eq('is_active', true)
    .order('variety_name')
    .order('length_cm')
  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <PriceTable products={products ?? []} />
    </main>
  )
}
// deploy trigger
