export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface OzPreorderItem {
  oz_product_code: string
  name: string
  image_url?: string | null
  category?: string
  order_multiple_stems?: number | null
  packaging_unit_stems?: number | null
  vbn_unit_code?: string | null
}

interface OzPreorderPayload {
  source: 'oz_preorder'
  items: OzPreorderItem[]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // Auth: script path (x-import-secret) OR browser session (admin/manager)
  const importSecret = process.env.OZ_IMPORT_SECRET
  const headerSecret = req.headers.get('x-import-secret')

  if (importSecret && headerSecret === importSecret) {
    // Trusted script path — bypass session check
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let body: OzPreorderPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  let created = 0
  let updated = 0
  const errorLog: string[] = []

  for (const item of body.items) {
    if (!item.oz_product_code || !item.name) {
      errorLog.push(`Пропущена запись: нет oz_product_code или name`)
      continue
    }

    const category = item.category === 'pot' ? 'pot' : 'cut'

    // Check if product exists by oz_product_code
    const { data: existing } = await supabase
      .from('products')
      .select('id, image_url')
      .eq('oz_product_code', item.oz_product_code)
      .maybeSingle()

    if (existing) {
      // UPDATE: refresh catalog data, never touch price/qty/is_active
      const { error } = await supabase
        .from('products')
        .update({
          name:           item.name,
          pack_size:      item.order_multiple_stems ?? undefined,
          stems_per_pack: item.packaging_unit_stems ?? undefined,
          container_code: item.vbn_unit_code ?? undefined,
          // image_url — only if currently empty
          ...(!existing.image_url && item.image_url ? { image_url: item.image_url } : {}),
        })
        .eq('id', existing.id)

      if (error) {
        errorLog.push(`${item.name} [${item.oz_product_code}]: ${error.message}`)
      } else {
        updated++
      }
    } else {
      // INSERT: inactive placeholder, qty=0; visible only through campaign_items
      const { error } = await supabase
        .from('products')
        .insert({
          oz_product_code: item.oz_product_code,
          name:            item.name,
          category,
          source:          'oz_preorder',
          is_active:       false,
          qty:             0,
          price:           0,
          pack_size:       item.order_multiple_stems ?? 1,
          stems_per_pack:  item.packaging_unit_stems ?? null,
          container_code:  item.vbn_unit_code ?? null,
          image_url:       item.image_url ?? null,
        })

      if (error) {
        errorLog.push(`${item.name} [${item.oz_product_code}]: ${error.message}`)
      } else {
        created++
      }
    }
  }

  return NextResponse.json({ created, updated, errors: errorLog.length, errorLog })
}
