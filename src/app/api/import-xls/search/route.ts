export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function sanitizeSearchValue(value: string): string {
  return value.replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

function rankProduct(p: any, rawQuery: string): number {
  const q = rawQuery.toLowerCase()
  const fields = [p.name, p.display_name, p.code_1c, p.supplier_ref]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map(v => v.toLowerCase())

  if (String(p.id) === rawQuery) return 0
  if (fields.some(v => v === q)) return 1
  if (fields.some(v => v.startsWith(q))) return 2
  return 3
}

export async function GET(req: NextRequest) {
  const rawQ = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const q = sanitizeSearchValue(rawQ)
  const isNumeric = /^\d+$/.test(q)
  if (!q || (!isNumeric && q.length < 2)) return NextResponse.json([])

  const supabase = await createClient()
  const orParts = [
    `name.ilike.%${q}%`,
    `display_name.ilike.%${q}%`,
    `code_1c.ilike.%${q}%`,
    `supplier_ref.ilike.%${q}%`,
  ]
  if (isNumeric) orParts.unshift(`id.eq.${q}`)

  const { data, error } = await supabase
    .from('products')
    .select('id, is_active, category, name, display_name, code_1c, supplier_ref, source, length_cm, subcategory, image_url, colors')
    .or(orParts.join(','))
    .order('name')
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (data ?? [])
    .sort((a: any, b: any) => rankProduct(a, q) - rankProduct(b, q) || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
    .slice(0, 25)

  return NextResponse.json(result)
}
