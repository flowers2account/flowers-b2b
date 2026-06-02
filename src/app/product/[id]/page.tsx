'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/cart-store'
import Link from 'next/link'
import { COLORS } from '@/lib/colors'
import { useIsMobile } from '@/lib/use-mobile'
import { COUNTRY_LABELS } from '@/lib/countries'

const SUBCAT_RU: Record<string, string> = {
  anthuriums: 'Антуриумы', orchids: 'Орхидеи', kalanchoe: 'Каланхоэ',
  spathiphyllum: 'Спатифиллум', hydrangeas_indoor: 'Гортензии', bromeliads: 'Бромелии',
  begonias: 'Бегонии', roses_indoor: 'Розы комнатные', dracaena: 'Драцена',
  hedera: 'Хедера', palms: 'Пальмы', calathea: 'Калатея',
  large_leaved: 'Крупнолистные', polyscias: 'Полисциас', flowering: 'Цветущие',
  succulents: 'Суккуленты', bulbs_indoor: 'Луковичные', helleborus: 'Геллеборус',
  climbing_plants: 'Вьющиеся', ficus: 'Фикус', chrysanthemums_pot: 'Хризантемы горш.',
  trees: 'Деревья', buxus: 'Буксус', aquatic: 'Водные', cacti: 'Кактусы',
  ferns: 'Папоротники', zamioculcas: 'Замиокулькас', green: 'Декоративно-лиственные',
  cyclamen: 'Цикламен', poinsettia: 'Пуансеттия', conifers: 'Хвойные',
  azalea_indoor: 'Азалея', lavender_plant: 'Лаванда', roses_outdoor: 'Розы садовые',
  heather: 'Вереск', rhododendrons: 'Рододендроны',
  roses: 'Розы', chrysanthemums: 'Хризантемы', tulips: 'Тюльпаны',
  lilies: 'Лилии', gerbera: 'Герберы', peonies: 'Пионы', hydrangeas: 'Гортензии',
  lisianthus: 'Лизиантус', alstroemeria: 'Альстромерия', carnations: 'Гвоздики',
  gypsophila: 'Гипсофила', ranunculus: 'Ранункулюс', anemones: 'Анемоны',
  baskets: 'Корзины', vases: 'Вазы', lanterns: 'Фонари',
  pots_accessories: 'Горшки', floristry_items: 'Аксессуары', compositions: 'Композиции',
}

const CATEGORY_RU: Record<string, string> = {
  cut: 'Срезанные', pot: 'Горшечные', accessories: 'Расходники',
}

const POT_COLOR_RU: Record<string, string> = {
  wit: 'белый', zwart: 'чёрный', rood: 'красный', groen: 'зелёный', geel: 'жёлтый',
  oranje: 'оранжевый', roze: 'розовый', paars: 'фиолетовый', blauw: 'синий',
  bruin: 'коричневый', zilver: 'серебряный', grijs: 'серый', antraciet: 'антрацит',
  terracotta: 'терракотовый', beige: 'бежевый', creme: 'кремовый', naturel: 'натуральный',
  transparant: 'прозрачный', bordeaux: 'бордовый', lichtgrijs: 'светло-серый',
  donkergroen: 'тёмно-зелёный', mosgroen: 'мшисто-зелёный', taupe: 'тауп', ecru: 'экрю',
}

const POT_MATERIAL_RU: Record<string, string> = {
  plastic: 'пластик', kunststof: 'пластик', terracotta: 'терракота',
  keramiek: 'керамика', 'keramiek gedecoreerd': 'керамика (декор)',
  metaal: 'металл', bamboe: 'бамбук', riet: 'ротанг', jute: 'джут', hout: 'дерево',
  'gerecyclede pot': 'переработанный пластик', gerecycleerd: 'переработанный пластик',
  recyclebaar: 'перерабатываемый', kokosvezel: 'кокосовое волокно', klei: 'глина',
}

const POT_FORM_RU: Record<string, string> = {
  sierpot: 'декоративный', bloempot: 'стандартный', kweekpot: 'технический',
  hangpot: 'подвесной', baliesbak: 'ящик', schaal: 'чаша',
}

const SUBSTRATE_RU: Record<string, string> = {
  potgrond: 'торфяной грунт', '100% veen vrij': 'без торфа', '70% veen vrij': '70% без торфа',
  '65% veen vrij': '65% без торфа', '50% veen vrij': 'экологичный субстрат',
  hydro: 'гидрогрунт', steenwol: 'минвата', kokos: 'кокосовый субстрат', lava: 'лавовый грунт',
}

type ProductData = {
  id: number; name: string; display_name: string | null; category: string
  subcategory: string | null; variety_type: string | null; length_cm: number | null
  pot_diameter: number | null; image_url: string | null; campaign_image_url: string | null
  extra_images: string[] | null; country_iso: string | null; farm: string | null
  colors: string[] | null; pack_size: number; stems_per_pack: number | null
  weight_gram: number | null; price: number; previous_price: number | null; qty: number
  is_active: boolean; description: string | null; short_description: string | null
  care_instructions: string | null; highlights: string[] | null; florist_usage: string[] | null
  pot_color: string | null; pot_material: string | null; pot_form: string | null
  substrate: string | null; quality_grade: string | null; min_plants_per_pot: number | null
  min_flowers_per_pot: number | null; variant: string | null
}

type RelatedProduct = {
  id: number; display_name: string | null; name: string; price: number; qty: number
  image_url: string | null; pot_diameter: number | null; length_cm: number | null
  colors: string[] | null; country_iso: string | null
}

function parseCare(text: string): { label: string; value: string }[] {
  return text.split('\n')
    .map(line => {
      const idx = line.indexOf(':')
      if (idx < 0) return null
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() }
    })
    .filter(Boolean) as { label: string; value: string }[]
}

const CARE_ICONS: Record<string, React.ReactNode> = {
  'Освещение': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>,
  'Полив': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.7s6 5.5 6 10.3a6 6 0 0 1-12 0C6 8.2 12 2.7 12 2.7Z"/></svg>,
  'Температура': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>,
  'Влажность': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.7s6 5.5 6 10.3a6 6 0 0 1-12 0C6 8.2 12 2.7 12 2.7Z"/></svg>,
  'Уход': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>,
}

const DefaultCareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>
  </svg>
)

export default function ProductPage() {
  const params = useParams()
  const router = useRouter()
  const { items, add, update, total } = useCart()
  const isMobile = useIsMobile()

  const [product, setProduct] = useState<ProductData | null>(null)
  const [loading, setLoading] = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [tab, setTab] = useState<'description' | 'specs' | 'care'>('description')
  const [related,    setRelated]    = useState<RelatedProduct[]>([])
  const [relLoading, setRelLoading] = useState(false)
  const [relCanLeft,  setRelCanLeft]  = useState(false)
  const [relCanRight, setRelCanRight] = useState(true)
  const relatedRef    = useRef<HTMLDivElement>(null)
  const relOffsetRef  = useRef(0)
  const relLoadingRef = useRef(false)
  const relHasMoreRef = useRef(true)
  const REL_PAGE = 8

  function updateRelArrows() {
    const el = relatedRef.current
    if (!el) return
    setRelCanLeft(el.scrollLeft > 8)
    setRelCanRight(relHasMoreRef.current || el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }
  async function loadMoreRelated() {
    if (!product?.subcategory || relLoadingRef.current || !relHasMoreRef.current) return
    relLoadingRef.current = true
    setRelLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('products')
      .select('id, name, display_name, price, qty, image_url, pot_diameter, length_cm, colors, country_iso')
      .eq('subcategory', product.subcategory)
      .eq('is_active', true)
      .neq('id', productId)
      .gt('qty', 0)
      .order('id')
      .range(relOffsetRef.current, relOffsetRef.current + REL_PAGE - 1)
    if (data && data.length > 0) {
      setRelated(prev => [...prev, ...(data as RelatedProduct[])])
      relOffsetRef.current += data.length
      if (data.length < REL_PAGE) { relHasMoreRef.current = false; updateRelArrows() }
    } else {
      relHasMoreRef.current = false
      updateRelArrows()
    }
    relLoadingRef.current = false
    setRelLoading(false)
  }
  function onRelatedScroll() {
    updateRelArrows()
    const el = relatedRef.current
    if (!el) return
    if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 300) loadMoreRelated()
  }
  function scrollRelated(dir: 'left' | 'right') {
    relatedRef.current?.scrollBy({ left: dir === 'right' ? 460 : -460, behavior: 'smooth' })
  }

  const productId = Number(params.id)

  useEffect(() => {
    if (!productId) { router.replace('/'); return }
    setRelated([]); relOffsetRef.current = 0; relLoadingRef.current = false; relHasMoreRef.current = true
    setRelCanLeft(false); setRelCanRight(true)
    const supabase = createClient()
    supabase
      .from('products')
      .select(`id, name, display_name, category, subcategory, variety_type,
               length_cm, pot_diameter, image_url, campaign_image_url, extra_images,
               country_iso, farm, colors, pack_size, stems_per_pack, weight_gram,
               price, previous_price, qty, is_active, description, short_description,
               care_instructions, highlights, florist_usage, pot_color, pot_material,
               pot_form, substrate, quality_grade, min_plants_per_pot, min_flowers_per_pot, variant`)
      .eq('id', productId)
      .eq('is_active', true)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) { router.replace('/'); return }
        setProduct(data as ProductData)
        setQuantity(data.pack_size || 1)
        setLoading(false)
        if (data.subcategory) {
          supabase
            .from('products')
            .select('id, name, display_name, price, qty, image_url, pot_diameter, length_cm, colors, country_iso')
            .eq('subcategory', data.subcategory)
            .eq('is_active', true)
            .neq('id', productId)
            .gt('qty', 0)
            .range(0, REL_PAGE - 1)
            .then(({ data: rel }: { data: any }) => {
              const items = (rel || []) as RelatedProduct[]
              setRelated(items)
              relOffsetRef.current = items.length
              if (items.length < REL_PAGE) relHasMoreRef.current = false
            })
        }
      })
  }, [productId])

  function handleAddToCart() {
    if (!product) return
    const nm = product.display_name || product.name
    const existing = items.find(i => i.id === product.id)
    if (existing) {
      update(product.id, Math.min(existing.qty + quantity, product.qty))
    } else {
      add({ id: product.id, name: nm, price: product.price, available: product.qty, category: product.category, image_url: product.image_url })
      update(product.id, quantity)
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const cartQty = items.find(i => i.id === productId)?.qty ?? 0
  const cartTotal = total()
  const cartCount = items.reduce((s, i) => s + i.qty, 0)

  if (loading) return (
    <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F2EF' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #f0e8ea', borderTopColor: '#8B3A5A', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (!product) return null

  const displayName = product.display_name || product.name
  const countryLabel = product.country_iso ? (COUNTRY_LABELS[product.country_iso] ?? product.country_iso) : null
  const subcategoryLabel = product.subcategory ? (SUBCAT_RU[product.subcategory] ?? product.subcategory) : null
  const categoryLabel = product.category ? (CATEGORY_RU[product.category] ?? product.category) : null

  const images: string[] = (() => {
    const imgs: string[] = []
    if (product.image_url) imgs.push(product.image_url)
    if (product.campaign_image_url && product.campaign_image_url !== product.image_url) imgs.push(product.campaign_image_url)
    for (const url of product.extra_images ?? []) { if (!imgs.includes(url)) imgs.push(url) }
    return imgs
  })()
  const mainPhoto = images[photoIdx] ?? null

  const colorDefs = (product.colors ?? []).map(k => COLORS.find(c => c.key === k)).filter(Boolean) as typeof COLORS[number][]
  const potColorVal = product.pot_color ? (POT_COLOR_RU[product.pot_color.toLowerCase()] ?? product.pot_color) : null
  const matVal = product.pot_material ? (POT_MATERIAL_RU[product.pot_material.toLowerCase()] ?? product.pot_material) : null
  const formVal = product.pot_form ? (POT_FORM_RU[product.pot_form.toLowerCase()] ?? product.pot_form) : null
  const substrVal = product.substrate ? (SUBSTRATE_RU[product.substrate.toLowerCase()] ?? product.substrate) : null
  const hasDiscount = product.previous_price && product.previous_price > product.price
  const careItems = product.care_instructions ? parseCare(product.care_instructions) : []
  const packPrice = product.price * product.pack_size
  const packCount = product.pack_size > 1 ? Math.floor(product.qty / product.pack_size) : product.qty
  const hasLatin = /[a-zA-Z]/.test(product.name) && product.name !== displayName
  const latinLine = [hasLatin ? product.name : null, product.variant].filter(Boolean).join(' · ')

  const specRows = [
    { label: 'Категория', value: subcategoryLabel },
    { label: product.category === 'cut' ? 'Длина стебля' : 'Высота', value: product.length_cm ? `${product.length_cm} см` : null },
    { label: 'Диаметр горшка', value: product.pot_diameter ? `${product.pot_diameter} см` : null },
    { label: 'Цвет', value: colorDefs.length > 0 ? colorDefs.map(c => c.label).join(', ') : null },
    { label: 'Страна', value: countryLabel },
    { label: 'Поставщик', value: product.farm },
    { label: 'Качество', value: product.quality_grade },
    { label: 'Кратность заказа', value: product.pack_size > 1 ? `${product.pack_size} шт` : null },
    { label: 'Стеблей в упаковке', value: product.stems_per_pack ? `${product.stems_per_pack} шт` : null },
    { label: 'Вес упаковки', value: product.weight_gram ? `${product.weight_gram} г` : null },
    { label: 'Растений в горшке', value: product.min_plants_per_pot ? `${product.min_plants_per_pot} шт` : null },
    { label: 'Цветков в горшке', value: product.min_flowers_per_pot ? `${product.min_flowers_per_pot} шт` : null },
    { label: 'Цвет горшка', value: potColorVal },
    { label: 'Материал горшка', value: matVal },
    { label: 'Тип горшка', value: formVal },
    { label: 'Субстрат', value: substrVal },
    { label: 'Вариант', value: product.variant },
  ].filter(r => r.value) as { label: string; value: string }[]

  const factCards = [
    product.length_cm ? { l: product.category === 'cut' ? 'Длина' : 'Высота', v: `${product.length_cm} см` } : null,
    product.pot_diameter ? { l: 'Горшок', v: `Ø ${product.pot_diameter} см` } : null,
    product.min_plants_per_pot ? { l: 'В горшке', v: `${product.min_plants_per_pot} раст.` } : null,
    !product.min_plants_per_pot && product.pack_size > 1 ? { l: 'Упаковка', v: `${product.pack_size} шт` } : null,
    product.stems_per_pack ? { l: 'Стеблей', v: `${product.stems_per_pack} шт` } : null,
    product.weight_gram ? { l: 'Вес', v: `${product.weight_gram} г` } : null,
  ].filter(Boolean) as { l: string; v: string }[]

  // ── token colours ──────────────────────────────────────────────────────────
  const C = {
    accent: '#8B3A5A', accentDeep: '#6E2A45', accentLight: '#F7EEF2',
    fern: '#3D6B50', fernLight: '#E8F0EA', fernDeep: '#2E5640',
    ink: '#1A1A1F', ink2: '#494950', ink3: '#7A7780', ink4: '#A8A4AD',
    bgPage: '#F6F2EF', bgCard: '#FFFFFF', bgSoft: '#F7F4F1',
    border: '#E6DFD9', borderSoft: '#EFEAE5',
    amber: '#B07D3B', amberLight: '#F6EDDE',
    green: '#5ED27A',
  }
  const sh = '0 1px 2px rgba(40,20,30,0.04),0 2px 6px rgba(40,20,30,0.04)'

  return (
    <div style={{ minHeight: '100vh', background: C.bgPage, fontFamily: 'var(--font-golos),system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1480, margin: '0 auto', padding: isMobile ? '12px 12px 48px' : '18px 24px 56px' }}>

        {/* ── breadcrumbs ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, fontSize: 12, color: C.ink3, flexWrap: 'wrap' }}>
          <button
            onClick={() => window.history.length > 1 ? router.back() : router.push('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.accent, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', marginRight: 2 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Назад
          </button>
          <span style={{ color: C.ink4 }}>/</span>
          <Link href="/" style={{ color: C.ink3, textDecoration: 'none' }}>Каталог</Link>
          {categoryLabel && <><span style={{ color: C.ink4 }}>/</span><span>{categoryLabel}</span></>}
          {subcategoryLabel && <><span style={{ color: C.ink4 }}>/</span><span>{subcategoryLabel}</span></>}
          <span style={{ color: C.ink4 }}>/</span>
          <span style={{ color: C.ink2, fontWeight: 500 }}>{displayName}</span>
        </div>

        {/* ── main 2-col ── */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-7 lg:items-start">

          {/* GALLERY */}
          <div className="mb-7 lg:mb-0 lg:sticky lg:top-[120px]" style={{ display: 'grid', gridTemplateColumns: images.length > 1 ? '74px 1fr' : '1fr', gap: 12 }}>
            {/* thumbs */}
            {images.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {images.slice(0, 6).map((url, i) => (
                  <div key={url} onClick={() => setPhotoIdx(i)} style={{ width: 74, height: 74, borderRadius: 8, overflow: 'hidden', border: `2px solid ${i === photoIdx ? C.accent : 'transparent'}`, cursor: 'pointer', background: C.bgCard, flexShrink: 0 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  </div>
                ))}
                {images.length > 6 && (
                  <div style={{ width: 74, height: 74, borderRadius: 8, background: 'rgba(26,26,31,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => setPhotoIdx(6)}>
                    +{images.length - 6}
                  </div>
                )}
              </div>
            )}

            {/* main image */}
            <div style={{ aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', background: C.bgCard, border: `1px solid ${C.borderSoft}`, position: 'relative', display: 'flex', alignItems: 'flex-end', boxShadow: sh }}>
              {mainPhoto
                ? <img src={mainPhoto} alt={displayName} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                : <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(135deg,transparent 0 18px,rgba(139,58,90,0.04) 18px 19px)` }} />
              }
              <span style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(26,26,31,0.78)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, backdropFilter: 'blur(8px)', display: 'inline-flex', alignItems: 'center', gap: 6, zIndex: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                {product.qty} шт
              </span>
              {images.length > 1 && (
                <span style={{ position: 'relative', zIndex: 2, fontFamily: 'monospace', fontSize: 11, color: 'rgba(139,58,90,0.45)', padding: 16, fontWeight: 500 }}>
                  {photoIdx + 1} / {images.length}
                </span>
              )}
            </div>

            {/* photo disclaimer for external URLs */}
            {product.extra_images && product.extra_images.length > 0 && (
              <div style={{ gridColumn: '1/-1', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.amber, padding: '8px 12px', background: C.amberLight, borderRadius: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Фото поставщика для справки — фактический вид партии может отличаться
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: INFO + TABS */}
          <div>

          {/* INFO */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>

            {/* tags row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {colorDefs.map(col => (
                <span key={col.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: C.bgSoft, color: C.ink2, border: `1px solid ${C.borderSoft}` }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: ('gradient' in col ? col.gradient : col.bg) as string, flexShrink: 0 }} />
                  {col.label}
                </span>
              ))}
              {countryLabel && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: C.bgSoft, color: C.ink2, border: `1px solid ${C.borderSoft}` }}>{countryLabel}</span>}
              {product.quality_grade && <span style={{ display: 'inline-flex', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: '#FFF6E0', color: '#9A6A00', border: '1px solid #F2D98A' }}>{product.quality_grade}</span>}
              {hasDiscount && <span style={{ display: 'inline-flex', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: '#FBECEC', color: '#B43838', border: '1px solid #FBCACA' }}>Акция</span>}
            </div>

            {/* name */}
            <h1 style={{ fontFamily: 'var(--font-playfair)', fontSize: isMobile ? 26 : 38, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.02em', color: C.ink, margin: 0 }}>
              {displayName}
            </h1>
            {latinLine && <div style={{ fontSize: 14, color: C.ink3, fontStyle: 'italic', marginTop: 6 }}>{latinLine}</div>}

            {/* price block */}
            <div style={{ marginTop: 22, padding: 20, background: C.bgCard, border: `1px solid ${C.borderSoft}`, borderRadius: 12, boxShadow: sh }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 38, fontWeight: 700, color: C.accent, letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {product.price.toLocaleString('ru-RU')} ₸
                  </span>
                  <span style={{ fontSize: 14, color: C.ink3 }}>/ шт</span>
                  {hasDiscount && <span style={{ fontSize: 16, color: C.ink4, textDecoration: 'line-through', marginLeft: 4 }}>{product.previous_price!.toLocaleString('ru-RU')} ₸</span>}
                </div>
                {product.pack_size > 1 && (
                  <div style={{ marginLeft: 'auto', textAlign: 'right', paddingLeft: 16, borderLeft: `1px solid ${C.borderSoft}` }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>{packPrice.toLocaleString('ru-RU')} ₸</div>
                    <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>за упаковку · {product.pack_size} шт</div>
                  </div>
                )}
              </div>

              {/* availability */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: C.fern, fontWeight: 500 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.fern, flexShrink: 0 }} />
                В наличии: {product.qty} шт{product.pack_size > 1 ? ` · ~${packCount} упак.` : ''}
              </div>

              {/* stepper + cart */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', height: 56, background: C.bgCard, flexShrink: 0 }}>
                  <button onClick={() => setQuantity(q => Math.max(product.pack_size, q - product.pack_size))} disabled={quantity <= product.pack_size}
                    style={{ width: 48, height: 56, border: 'none', background: C.bgCard, color: C.accent, fontSize: 22, fontWeight: 600, cursor: quantity <= product.pack_size ? 'default' : 'pointer', opacity: quantity <= product.pack_size ? 0.35 : 1 }}>−</button>
                  <div style={{ width: 72, textAlign: 'center', borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{quantity}</span>
                    <span style={{ fontSize: 10, color: C.ink3, marginTop: 3 }}>шт</span>
                  </div>
                  <button onClick={() => setQuantity(q => Math.min(product.qty, q + product.pack_size))} disabled={quantity + product.pack_size > product.qty}
                    style={{ width: 48, height: 56, border: 'none', background: C.bgCard, color: C.accent, fontSize: 22, fontWeight: 600, cursor: quantity + product.pack_size > product.qty ? 'default' : 'pointer', opacity: quantity + product.pack_size > product.qty ? 0.35 : 1 }}>+</button>
                </div>

                <button onClick={handleAddToCart} disabled={product.qty === 0}
                  style={{ flex: 1, height: 56, background: product.qty === 0 ? '#e8e8e8' : `linear-gradient(180deg,${C.accent},${C.accentDeep})`, color: product.qty === 0 ? '#aaa' : '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, letterSpacing: '-0.005em', cursor: product.qty === 0 ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: product.qty > 0 ? '0 4px 12px rgba(139,58,90,0.25),inset 0 1px 0 rgba(255,255,255,0.15)' : 'none', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => product.qty > 0 && ((e.currentTarget as HTMLButtonElement).style.opacity = '0.88')}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  {product.qty === 0 ? 'Нет в наличии' : added ? '✓ Добавлено' : `В корзину — ${(quantity * product.price).toLocaleString('ru-RU')} ₸`}
                </button>

                <button style={{ width: 56, height: 56, border: `1px solid ${C.border}`, background: C.bgCard, borderRadius: 8, color: C.ink3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                </button>
              </div>
            </div>

            {/* quick facts */}
            {factCards.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(factCards.length, 3)},1fr)`, gap: 10, marginTop: 18 }}>
                {factCards.map(f => (
                  <div key={f.l} style={{ background: C.bgCard, border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 6 }}>{f.l}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{f.v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* pack note */}
            {product.pack_size > 1 && (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: C.fernLight, borderRadius: 8, fontSize: 12, color: C.fernDeep, lineHeight: 1.5 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.fern} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                <span><strong>Кратность упаковки {product.pack_size} шт.</strong> При добавлении в корзину количество округляется до целой упаковки.</span>
              </div>
            )}

            {/* florist usage chips (cut flowers) */}
            {product.florist_usage && product.florist_usage.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {product.florist_usage.map((u, i) => (
                  <span key={i} style={{ padding: '5px 12px', borderRadius: 8, background: C.accentLight, border: `1px solid ${C.border}`, fontSize: 12, color: C.accent, fontWeight: 500 }}>{u}</span>
                ))}
              </div>
            )}

            {/* in-cart link */}
            {cartQty > 0 && (
              <Link href="/" style={{ display: 'block', textAlign: 'center', fontSize: 12, marginTop: 12, color: C.accent, textDecoration: 'none', fontWeight: 500 }}>
                В корзине {cartQty} шт → Перейти к оформлению
              </Link>
            )}
          </div>

        {/* ── TABS ── */}
        <div style={{ marginTop: 28, background: C.bgCard, border: `1px solid ${C.borderSoft}`, borderRadius: 12, boxShadow: sh, overflow: 'hidden' }}>
          {/* tab nav */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.borderSoft}`, padding: '0 8px' }}>
            {([
              { id: 'description', label: 'Описание' },
              { id: 'specs', label: `Характеристики${specRows.length > 0 ? ` (${specRows.length})` : ''}` },
              ...(careItems.length > 0 ? [{ id: 'care', label: 'Уход' }] : []),
            ] as { id: string; label: string }[]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                style={{ padding: '16px 20px', fontFamily: 'inherit', fontSize: 14, fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? C.accent : C.ink3, background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? C.accent : 'transparent'}`, cursor: 'pointer', marginBottom: -1 }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* description tab: description text + specs side by side */}
          {tab === 'description' && (
            <div style={{ padding: '24px 28px', display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 36 }}>
              <div>
                {product.short_description && (
                  <p style={{ fontSize: 15, color: C.ink, lineHeight: 1.7, marginBottom: 14, margin: '0 0 14px' }}>{product.short_description}</p>
                )}
                {product.description
                  ? <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{product.description}</p>
                  : <p style={{ fontSize: 14, color: C.ink3, lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>Описание будет добавлено в ближайшее время.</p>
                }
                {product.highlights && product.highlights.length > 0 && (
                  <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {product.highlights.map((h, i) => (
                      <span key={i} style={{ padding: '5px 12px', borderRadius: 8, background: C.bgSoft, border: `1px solid ${C.borderSoft}`, fontSize: 12, color: C.ink2, fontWeight: 500 }}>{h}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ borderLeft: isMobile ? 'none' : `1px solid ${C.borderSoft}`, paddingLeft: isMobile ? 0 : 36, marginTop: isMobile ? 24 : 0 }}>
                <h4 style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.ink3, fontWeight: 500, margin: '0 0 14px' }}>Характеристики</h4>
                {specRows.map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px dashed ${C.borderSoft}`, fontSize: 13 }}>
                    <span style={{ color: C.ink3 }}>{r.label}</span>
                    <span style={{ fontWeight: 600, color: C.ink }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* specs tab: full-width table */}
          {tab === 'specs' && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ maxWidth: 560 }}>
                {specRows.map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px dashed ${C.borderSoft}`, fontSize: 13 }}>
                    <span style={{ color: C.ink3 }}>{r.label}</span>
                    <span style={{ fontWeight: 600, color: C.ink }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* care tab */}
          {tab === 'care' && careItems.length > 0 && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
                {careItems.map((item, i) => (
                  <div key={i} style={{ background: C.bgSoft, borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.fern, marginBottom: 10, boxShadow: sh }}>
                      {CARE_ICONS[item.label] ?? <DefaultCareIcon />}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: C.ink3, lineHeight: 1.45 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* care strip below description tab */}
          {tab === 'description' && careItems.length > 0 && (
            <div style={{ padding: '0 28px 24px' }}>
              <h4 style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.ink3, fontWeight: 500, margin: '0 0 14px' }}>Уход</h4>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
                {careItems.slice(0, 4).map((item, i) => (
                  <div key={i} style={{ background: C.bgSoft, borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.fern, marginBottom: 10, boxShadow: sh }}>
                      {CARE_ICONS[item.label] ?? <DefaultCareIcon />}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: C.ink3, lineHeight: 1.45 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
          </div>{/* end right column */}
        </div>{/* end main 2-col */}

        {/* ── RELATED ── */}
        {related.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'var(--font-playfair)', fontSize: 22, fontWeight: 400, color: C.ink, letterSpacing: '-0.01em', margin: 0 }}>
                Похожие в «{subcategoryLabel ?? categoryLabel}»
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => scrollRelated('left')}
                  disabled={!relCanLeft}
                  style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${C.border}`, background: C.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: relCanLeft ? 'pointer' : 'default', opacity: relCanLeft ? 1 : 0.3, transition: 'opacity 0.15s', flexShrink: 0 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <button
                  onClick={() => scrollRelated('right')}
                  disabled={!relCanRight}
                  style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${C.border}`, background: C.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: relCanRight ? 'pointer' : 'default', opacity: relCanRight ? 1 : 0.3, transition: 'opacity 0.15s', flexShrink: 0 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
                <Link href="/" style={{ fontSize: 13, color: C.accent, textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
                  Все товары
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>
            <style>{`#related-scroll::-webkit-scrollbar{display:none}`}</style>
            <div
              id="related-scroll"
              ref={relatedRef}
              onScroll={onRelatedScroll}
              style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'], scrollSnapType: 'x mandatory', paddingBottom: 4 }}
            >
              {related.map(p => {
                const rName = p.display_name || p.name
                const rCountry = p.country_iso ? (COUNTRY_LABELS[p.country_iso] ?? p.country_iso) : null
                const rColors = (p.colors ?? []).map(k => COLORS.find(c => c.key === k)).filter(Boolean) as typeof COLORS[number][]
                const rMeta = [p.pot_diameter ? `Ø ${p.pot_diameter} см` : p.length_cm ? `${p.length_cm} см` : null, rColors[0]?.label, rCountry].filter(Boolean).join(' · ')
                return (
                  <Link key={p.id} href={`/product/${p.id}`} style={{ textDecoration: 'none', flexShrink: 0, width: isMobile ? 160 : 210, scrollSnapAlign: 'start' } as React.CSSProperties}>
                    <div style={{ background: C.bgCard, border: `1px solid ${C.borderSoft}`, borderRadius: 12, overflow: 'hidden', boxShadow: sh, display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div style={{ aspectRatio: '1/1', background: C.bgSoft, position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
                        {p.image_url
                          ? <img src={p.image_url} alt={rName} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                          : <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(135deg,transparent 0 12px,rgba(139,58,90,0.05) 12px 13px)` }} />
                        }
                        <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(26,26,31,0.78)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 4, zIndex: 2 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} />
                          {p.qty} шт
                        </span>
                      </div>
                      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ fontFamily: 'var(--font-playfair)', fontSize: 14, fontWeight: 400, lineHeight: 1.2, letterSpacing: '-0.005em', color: C.ink }}>
                          {rName.length > 32 ? rName.slice(0, 32) + '…' : rName}
                        </div>
                        {rMeta && <div style={{ fontSize: 11, color: C.ink3 }}>{rMeta}</div>}
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.accent, marginTop: 6, letterSpacing: '-0.01em' }}>
                          {p.price.toLocaleString('ru-RU')} ₸
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
              {relLoading && (
                <div style={{ flexShrink: 0, width: isMobile ? 160 : 210, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bgCard, border: `1px solid ${C.borderSoft}`, borderRadius: 12 }}>
                  <div className="animate-spin" style={{ width: 24, height: 24, borderRadius: '50%', borderWidth: 2, borderStyle: 'solid', borderColor: C.borderSoft, borderTopColor: C.accent }} />
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
