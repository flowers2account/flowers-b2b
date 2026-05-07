import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select(`id, name, variety_name, length_str, length_cm, category, subcategory, variety_type, color, colors, floral_role, stem_durability, season, tags, origin, description, pot_size, pack_size, image_url, images, previous_price, stock:stock_available (price, qty, qty_reserved, is_available, reserved_qty, available_qty)`)
    .eq('is_active', true)
    .order('variety_name')
    .order('length_cm')
  return NextResponse.json(data ?? [])
}
