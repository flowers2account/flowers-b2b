export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json([])

  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select('id, name, display_name, length_cm, subcategory, image_url, colors')
    .or(`name.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order('name')
    .limit(25)

  return NextResponse.json(data ?? [])
}
