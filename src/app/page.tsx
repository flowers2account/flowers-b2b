import { createClient } from '@/lib/supabase/server'
import PriceTable from '@/components/catalog/PriceTable'
import CartSidebar from '@/components/catalog/CartSidebar'
import FilterSidebar from '@/components/catalog/FilterSidebar'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select(`id, name, variety_name, length_str, length_cm, category, is_active, pack_size, image_url, previous_price, stock:stock_available (price, qty, qty_reserved, is_available, available_qty, reserved_qty)`)
    .eq('is_active', true)
    .order('variety_name')
    .order('length_cm')

  return (
    <main className="max-w-7xl mx-auto px-4 py-4">
      <div className="flex gap-6 items-start">

        {/* Левый сайдбар — фильтры */}
        <aside className="w-52 flex-shrink-0">
          <FilterSidebar products={products ?? []} />
        </aside>

        {/* Каталог */}
        <div className="flex-1 min-w-0">
          <PriceTable products={products ?? []} />
        </div>

        {/* Правый сайдбар — корзина */}
        <CartSidebar />
      </div>
    </main>
  )
}
