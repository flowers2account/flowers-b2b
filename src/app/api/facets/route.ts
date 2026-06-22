import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { leafForSubcat, subcatInLeaves, slugsForGroup } from '@/lib/category-tree'
import { normalizeColor, isNonColor } from '@/lib/colors'

export const dynamic = 'force-dynamic'

// Диапазоны объёма для аксессуаров/горшков (метки = id). Держать в синхроне с
// filter-store ACC_VOLUME_RANGES и ProductGrid accVolumeRange().
function accVolumeRange(v: number): string | null {
  if (!v || v <= 0) return null
  if (v < 1)  return 'до 1л'
  if (v < 3)  return '1-3л'
  if (v < 6)  return '3-6л'
  if (v < 12) return '6-12л'
  return '12+л'
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    category = 'cut', onlyAvailable = true,
    subcat = null, varietyType = null,
    subgroup = null, volumeRanges = [],
    // accessories-фасеты (И-логика, кросс-фасетный пересчёт)
    selectedLeaves = [], group = null,
    suppliers = [], materials = [], potColors = [], volumes = [],
  } = body

  const supabase = await createClient()

  type RawProduct = {
    id: number
    colors: string[] | null
    length_cm: number | null
    country_iso: string | null
    subcategory: string | null
    variety_type: string | null
    qty: number
    farm: string | null
    subgroup: string | null
    volume_l: number | null
    supplier: string | null
    pot_material: string | null
    pot_color: string | null
  }

  const VOLUME_TEST: Record<string, (v: number) => boolean> = {
    'до5':   v => v <= 5,
    '5-15':  v => v > 5 && v <= 15,
    '15-40': v => v > 15 && v <= 40,
    '40+':   v => v > 40,
  }

  const PAGE = 900
  let products: RawProduct[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, colors, length_cm, country_iso, subcategory, variety_type, qty, farm, subgroup, volume_l, supplier, pot_material, pot_color')
      .eq('is_active', true)
      .eq('category', category)
      .in('source', ['uralsk_site', 'uralsk_1c'])
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    products = products.concat(data as RawProduct[])
    if (data.length < PAGE) break
    from += PAGE
  }

  // All available products in category
  let allBase = products.filter(p => !onlyAvailable || p.qty > 0)

  // Apply subgroup and volumeRanges to narrow detail facets
  if (subgroup) allBase = allBase.filter(p => p.subgroup === subgroup)
  if (volumeRanges.length > 0) {
    allBase = allBase.filter(p => {
      const v = Number(p.volume_l)
      return v > 0 && volumeRanges.some((id: string) => VOLUME_TEST[id]?.(v))
    })
  }

  // subcatCounts: counts without subgroup/volume so switching subcats always works.
  // accessories — счётчики по ЛИСТУ (leaf.slug, агрегируя members); cut/pot — по сырому subcat.
  const baseForSubcats = products.filter(p => !onlyAvailable || p.qty > 0)
  const subcatCounts: Record<string, number> = {}
  baseForSubcats.forEach(p => {
    if (!p.subcategory) return
    const key = category === 'accessories'
      ? leafForSubcat(p.subcategory)?.slug
      : p.subcategory
    if (key) subcatCounts[key] = (subcatCounts[key] || 0) + 1
  })

  // vtCounts: scoped to selected subcat (with subgroup/volume applied)
  const subcatBase = subcat ? allBase.filter(p => p.subcategory === subcat) : allBase
  const vtCounts: Record<string, number> = {}
  subcatBase.forEach(p => {
    if (p.variety_type) vtCounts[p.variety_type] = (vtCounts[p.variety_type] || 0) + 1
  })

  // color/length/origin: scoped to both subcat and varietyType selections
  const detailBase = varietyType ? subcatBase.filter(p => p.variety_type === varietyType) : subcatBase

  const colorCounts: Record<string, number> = {}
  detailBase.forEach(p => {
    (p.colors ?? []).forEach(c => { colorCounts[c] = (colorCounts[c] || 0) + 1 })
  })

  const lengthCounts: Record<number, number> = {}
  detailBase.forEach(p => {
    if (p.length_cm) lengthCounts[p.length_cm] = (lengthCounts[p.length_cm] || 0) + 1
  })

  const originCounts: Record<string, number> = {}
  detailBase.forEach(p => {
    if (p.country_iso) originCounts[p.country_iso] = (originCounts[p.country_iso] || 0) + 1
  })

  const farmCounts: Record<string, number> = {}
  detailBase.forEach(p => {
    if (p.farm) farmCounts[p.farm] = (farmCounts[p.farm] || 0) + 1
  })

  // ── Accessories-фасеты: Производитель / Материал / Цвет горшка / Объём ────────
  // И-логика с кросс-фасетным пересчётом: счётчик каждого фасета считается на базе,
  // где применены ОСТАЛЬНЫЕ три фасета (+ скоуп по выбранным листьям). Пустое поле
  // просто не попадает в свой фасет, но участвует в остальных.
  let supplierCounts: Record<string, number> = {}
  let materialCounts: Record<string, number> = {}
  let potColorCounts: Record<string, number> = {}
  let volumeCounts: Record<string, number> = {}

  if (category === 'accessories') {
    const effLeaves: string[] = selectedLeaves.length > 0
      ? selectedLeaves
      : (group && group !== 'all' ? slugsForGroup(group) : [])

    let accBase = products.filter(p => !onlyAvailable || p.qty > 0)
    if (effLeaves.length > 0) accBase = accBase.filter(p => subcatInLeaves(p.subcategory, effLeaves))

    const mSupplier = (p: RawProduct) => suppliers.length === 0 || (!!p.supplier && suppliers.includes(p.supplier))
    const mMaterial = (p: RawProduct) => materials.length === 0 || (!!p.pot_material && materials.includes(p.pot_material))
    // Цвет горшка группируем по нормализованному имени: «antraciet» = «Антрацит», и т.п.
    const mColor    = (p: RawProduct) => potColors.length === 0 || (!!p.pot_color && potColors.includes(normalizeColor(p.pot_color)))
    const mVolume   = (p: RawProduct) => {
      if (volumes.length === 0) return true
      const r = accVolumeRange(Number(p.volume_l))
      return !!r && volumes.includes(r)
    }

    accBase.forEach(p => {
      if (p.supplier && mMaterial(p) && mColor(p) && mVolume(p))
        supplierCounts[p.supplier] = (supplierCounts[p.supplier] || 0) + 1
      if (p.pot_material && mSupplier(p) && mColor(p) && mVolume(p))
        materialCounts[p.pot_material] = (materialCounts[p.pot_material] || 0) + 1
      if (p.pot_color && !isNonColor(p.pot_color) && mSupplier(p) && mMaterial(p) && mVolume(p)) {
        const k = normalizeColor(p.pot_color)
        potColorCounts[k] = (potColorCounts[k] || 0) + 1
      }
      if (mSupplier(p) && mMaterial(p) && mColor(p)) {
        const r = accVolumeRange(Number(p.volume_l))
        if (r) volumeCounts[r] = (volumeCounts[r] || 0) + 1
      }
    })
  }

  return NextResponse.json({
    subcatCounts,
    vtCounts,
    colorCounts,
    lengthCounts,
    originCounts,
    seasonCounts: {},
    farmCounts,
    supplierCounts,
    materialCounts,
    potColorCounts,
    volumeCounts,
  })
}
