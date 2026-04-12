import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select(`id, name, variety_name, length_str, length_cm, category, is_active, pack_size, stock (price, qty, qty_reserved, is_available)`)
    .eq('is_active', true)
    .order('variety_name')
    .order('length_cm')
  return NextResponse.json(data ?? [])
}
