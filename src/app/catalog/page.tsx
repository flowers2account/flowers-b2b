import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import FilterPanel from '@/components/catalog/FilterPanel'
import ProductGrid from '@/components/catalog/ProductGrid'
import DetailPanel from '@/components/catalog/DetailPanel'
import CatalogLayout from '@/components/catalog/CatalogLayout'
import { resolveCatalogSection, ogImageQuery, type CatalogParams } from '@/lib/catalog-meta'
import HeroBanner from '@/components/HeroBanner'
import { HERO, CATALOG_GRID_ANCHOR_ID } from '@/components/hero-banner-content'

export const dynamic = 'force-dynamic'

// Динамические OG/SEO-метатеги по активным фильтрам каталога (?category/&group/&leaves/&q).
// Любая ссылка на раздел разворачивается в мессенджерах: заголовок + описание + og:image.
// og:image — фото топового (по остатку/популярности) активного товара раздела из тех же
// позиций products, что показывает витрина; пусто → общий брендовый постер /og-default.png.
const OG_FALLBACK = '/og-default.png'

async function sectionOgImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pick: ReturnType<typeof resolveCatalogSection>['pick'],
): Promise<string> {
  try {
    let qb = supabase
      .from('products')
      .select('image_url, campaign_image_url')
      .eq('is_active', true)
      .in('source', ['uralsk_site', 'uralsk_1c'])
      .gt('qty', 0)
    if (pick.category) qb = qb.eq('category', pick.category)
    if (pick.subcats?.length) qb = qb.in('subcategory', pick.subcats)
    if (pick.q) {
      const safe = pick.q.replace(/[%,()]/g, ' ').trim()
      if (safe) qb = qb.or(`name.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    }
    // Порядок как на витрине — по убыванию остатка (популярность); берём первое с фото.
    const { data } = await qb.order('qty', { ascending: false }).limit(8)
    for (const r of data ?? []) {
      const u = (r as any).campaign_image_url || (r as any).image_url
      if (u && (u.startsWith('http') || u.startsWith('/'))) return u  // Next абсолютизирует относительные
    }
  } catch { /* ниже — фолбэк */ }
  return OG_FALLBACK
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
): Promise<Metadata> {
  const sp = await searchParams
  const pick = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v }
  const params: CatalogParams = {
    category: pick('category'), group: pick('group'),
    leaves: pick('leaves'), q: pick('q'), search: pick('search'),
  }
  const section = resolveCatalogSection(params)
  const fullTitle = `${section.title} · Цветы Уральска`
  const canonicalQs = ogImageQuery(params)
  const canonical = `/catalog${canonicalQs ? `?${canonicalQs}` : ''}`

  const supabase = await createClient()
  const ogImage = await sectionOgImage(supabase, section.pick)

  return {
    title: { absolute: fullTitle },
    description: section.description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: fullTitle,
      description: section.description,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: section.h1 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: section.description,
      images: [ogImage],
    },
  }
}

const SELECT_FIELDS = `id, name, display_name, length_cm, pot_diameter, pot_height, category, subcategory, variety_type, pack_size, stems_per_pack, weight_gram, colors, color_images, image_url, campaign_image_url, extra_images, arrival_date, price, previous_price, qty, country_iso, tags, farm, supplier, container_code, quality_grade, min_plants_per_pot, min_flowers_per_pot, pot_color, pot_material, pot_form, substrate, variant, description, subgroup, unit, price_per_m, price_per_m2, volume_l, short_description, source`

async function fetchAllProducts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const PAGE = 900
  let all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select(SELECT_FIELDS)
      .eq('is_active', true)
      .in('source', ['uralsk_site', 'uralsk_1c'])
      .gt('qty', 0)
      .order('name')
      .order('length_cm')
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

export default async function CatalogPage() {
  const supabase = await createClient()
  const data = await fetchAllProducts(supabase)

  const today = new Date().toISOString().split('T')[0]
  const list = data.map((p: any) => ({
    ...p,
    variety_name: null,
    length_str: null,
    is_new: p.arrival_date === today,
    stock: {
      price: p.price ?? 0,
      qty: p.qty ?? 0,
      qty_reserved: 0,
      is_available: (p.qty ?? 0) > 0,
      available_qty: p.qty ?? 0,
    },
  }))

  return (
    <CatalogLayout
      left={<FilterPanel products={list} />}
      center={
        <>
          {/* Промо-баннер над тулбаром/сеткой (в потоке, скроллится); CTA — к сетке товаров */}
          <div style={{ padding: '14px 16px 0' }}>
            <HeroBanner
              variant="catalog"
              eyebrow={HERO.eyebrow}
              title={HERO.title}
              titleAccent={HERO.titleAccent}
              subtitle={HERO.subtitleCatalog}
              cta={HERO.ctaCatalog}
            />
          </div>
          {/* Якорь для скролла CTA: сюда прыгает «Смотреть наличие» */}
          <div id={CATALOG_GRID_ANCHOR_ID} style={{ height: '100%' }}>
            <ProductGrid products={list} />
          </div>
        </>
      }
      right={<DetailPanel />}
    />
  )
}
