export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface OzLine {
  oz_line_id: string
  stock_type?: string
  delivery_date?: string
  available_stems?: number | null
  purchase_eur?: number | null
  currency?: string | null
}

interface OzPreorderItem {
  oz_product_code: string
  name: string
  image_url?: string | null
  category?: string
  order_multiple_stems?: number | null
  packaging_unit_stems?: number | null
  vbn_unit_code?: string | null
  lines?: OzLine[]
  // enrichment fields — all optional, null = keep existing
  length_cm?:     number | null
  colors?:        string[] | null
  country_iso?:   string | null
  farm?:          string | null
  stems_per_pack?: number | null
  container_code?: string | null
  weight_gram?:   number | null
  quality_grade?: string | null
}

interface OzPreorderPayload {
  source: 'oz_preorder'
  campaign_id?: number | null
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

  const campaignId = body.campaign_id ?? null
  let created = 0
  let updated = 0
  let staging_rows = 0
  const errorLog: string[] = []

  for (const item of body.items) {
    if (!item.oz_product_code || !item.name) {
      errorLog.push(`Пропущена запись: нет oz_product_code или name`)
      continue
    }

    const category = item.category === 'pot' ? 'pot' : 'cut'

    // Upsert product card by oz_product_code
    const { data: existing } = await supabase
      .from('products')
      .select('id, image_url')
      .eq('oz_product_code', item.oz_product_code)
      .maybeSingle()

    let productId: number | null = null

    if (existing) {
      // Build update payload — only include fields with non-null incoming values.
      // image_url is only filled in if the existing row has none (preserve manual photos).
      const patch: Record<string, unknown> = { name: item.name }
      if (item.order_multiple_stems != null) patch.pack_size      = item.order_multiple_stems
      // stems_per_pack: accept both payload aliases
      const spp = item.stems_per_pack ?? item.packaging_unit_stems
      if (spp != null) patch.stems_per_pack = spp
      // container_code: accept both payload aliases
      const cc = item.container_code ?? item.vbn_unit_code
      if (cc != null) patch.container_code = cc
      if (!existing.image_url && item.image_url) patch.image_url = item.image_url
      // enrichment fields
      if (item.length_cm   != null) patch.length_cm   = item.length_cm
      if (item.colors      != null) patch.colors       = item.colors
      if (item.country_iso != null) patch.country_iso  = item.country_iso
      if (item.farm        != null) patch.farm         = item.farm
      if (item.weight_gram != null) patch.weight_gram  = item.weight_gram
      if (item.quality_grade != null) patch.quality_grade = item.quality_grade

      const { error } = await supabase
        .from('products')
        .update(patch)
        .eq('id', existing.id)

      if (error) {
        errorLog.push(`${item.name} [${item.oz_product_code}]: ${error.message}`)
        continue
      }
      productId = existing.id
      updated++
    } else {
      const { data: newProduct, error } = await supabase
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
          stems_per_pack:  item.stems_per_pack ?? item.packaging_unit_stems ?? null,
          container_code:  item.container_code ?? item.vbn_unit_code ?? null,
          image_url:       item.image_url ?? null,
          length_cm:       item.length_cm ?? null,
          colors:          item.colors ?? null,
          country_iso:     item.country_iso ?? null,
          farm:            item.farm ?? null,
          weight_gram:     item.weight_gram ?? null,
          quality_grade:   item.quality_grade ?? null,
        })
        .select('id')
        .single()

      if (error || !newProduct) {
        errorLog.push(`${item.name} [${item.oz_product_code}]: ${error?.message}`)
        continue
      }
      productId = newProduct.id
      created++
    }

    // Upsert staging rows — idempotent on (campaign_id, oz_product_code, oz_line_id, oz_stock_type, oz_delivery_date)
    if (campaignId && item.lines?.length) {
      for (const line of item.lines) {
        const { error } = await supabase
          .from('campaign_staging')
          .upsert({
            campaign_id:          campaignId,
            product_id:           productId,
            oz_product_code:      item.oz_product_code,
            oz_line_id:           line.oz_line_id,
            oz_stock_type:        line.stock_type ?? null,
            oz_delivery_date:     line.delivery_date ?? null,
            available_stems:      line.available_stems ?? null,
            order_multiple_stems: item.order_multiple_stems ?? null,
            packaging_unit_stems: item.packaging_unit_stems ?? null,
            purchase_eur:         line.purchase_eur ?? null,
            currency:             line.currency ?? null,
            name:                 item.name,
            image_url:            item.image_url ?? null,
            vbn_unit_code:        item.vbn_unit_code ?? null,
            is_selected:          true,
          }, {
            onConflict: 'campaign_id,oz_product_code,oz_line_id,oz_stock_type,oz_delivery_date',
          })

        if (error) {
          errorLog.push(`staging ${line.oz_line_id}: ${error.message}`)
        } else {
          staging_rows++
        }
      }
    }
  }

  return NextResponse.json({ created, updated, staging_rows, errors: errorLog.length, errorLog })
}
