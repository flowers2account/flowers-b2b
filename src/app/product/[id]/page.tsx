'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/cart-store'
import Link from 'next/link'
import { COLORS } from '@/lib/colors'

const COUNTRY_LABELS: Record<string, string> = {
  EC: 'Эквадор', KE: 'Кения', NL: 'Голландия', CN: 'Китай',
  CO: 'Колумбия', RU: 'Россия', ET: 'Эфиопия', EG: 'Египет', IL: 'Израиль', DK: 'Дания',
}

const POT_COLOR_RU: Record<string, string> = {
  wit: 'белый', zwart: 'чёрный', rood: 'красный', groen: 'зелёный',
  geel: 'жёлтый', oranje: 'оранжевый', roze: 'розовый', paars: 'фиолетовый',
  blauw: 'синий', bruin: 'коричневый', zilver: 'серебряный', grijs: 'серый',
  antraciet: 'антрацит', terracotta: 'терракотовый', beige: 'бежевый',
  creme: 'кремовый', naturel: 'натуральный', transparant: 'прозрачный',
  bordeaux: 'бордовый', lichtgrijs: 'светло-серый', donkergroen: 'тёмно-зелёный',
  mosgroen: 'мшисто-зелёный', taupe: 'тауп', ecru: 'экрю',
}

const POT_MATERIAL_RU: Record<string, string> = {
  plastic: 'пластик', kunststof: 'пластик', terracotta: 'терракота',
  keramiek: 'керамика', 'keramiek gedecoreerd': 'керамика (декор)',
  metaal: 'металл', bamboe: 'бамбук', riet: 'ротанг', jute: 'джут',
  hout: 'дерево', 'gerecyclede pot': 'переработанный пластик',
  gerecycleerd: 'переработанный пластик', recyclebaar: 'перерабатываемый',
  kokosvezel: 'кокосовое волокно', klei: 'глина',
}

const POT_FORM_RU: Record<string, string> = {
  sierpot: 'декоративный', bloempot: 'стандартный', kweekpot: 'технический',
  hangpot: 'подвесной', baliesbak: 'ящик', schaal: 'чаша',
}

const SUBSTRATE_RU: Record<string, string> = {
  potgrond: 'торфяной грунт', '100% veen vrij': 'без торфа',
  '70% veen vrij': '70% без торфа', '65% veen vrij': '65% без торфа',
  '60% veen vrij': '60% без торфа', '55% veen vrij': '55% без торфа',
  '50% veen vrij': 'Экологичный субстрат (50% без торфа)',
  hydro: 'гидрогрунт', steenwol: 'минвата', kokos: 'кокосовый субстрат',
  kokosmengsel: 'кокосовый микс', aarde: 'земля', lava: 'лавовый грунт',
}

type ProductData = {
  id: number
  name: string
  display_name: string | null
  category: string
  subcategory: string | null
  length_cm: number | null
  pot_diameter: number | null
  image_url: string | null
  campaign_image_url: string | null
  extra_images: string[] | null
  country_iso: string | null
  farm: string | null
  colors: string[] | null
  pack_size: number
  stems_per_pack: number | null
  weight_gram: number | null
  price: number
  previous_price: number | null
  qty: number
  is_active: boolean
  description: string | null
  care_instructions: string | null
  pot_color: string | null
  pot_material: string | null
  pot_form: string | null
  substrate: string | null
  quality_grade: string | null
  min_plants_per_pot: number | null
  min_flowers_per_pot: number | null
  variant: string | null
}

function CharRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '8px 0',
      borderBottom: '1px solid #f0f0f0', alignItems: 'flex-start',
    }}>
      <span style={{ minWidth: 160, fontSize: 13, color: '#888', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

export default function ProductPage() {
  const params = useParams()
  const router = useRouter()
  const { items, add, update, total } = useCart()

  const [product, setProduct] = useState<ProductData | null>(null)
  const [loading, setLoading] = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const productId = Number(params.id)

  useEffect(() => {
    if (!productId) { router.replace('/'); return }

    const supabase = createClient()
    supabase
      .from('products')
      .select(`id, name, display_name, category, subcategory, length_cm, pot_diameter,
               image_url, campaign_image_url, extra_images, country_iso, farm, colors, pack_size,
               stems_per_pack, weight_gram, price, previous_price, qty, is_active,
               description, care_instructions, pot_color, pot_material, pot_form,
               substrate, quality_grade, min_plants_per_pot, min_flowers_per_pot, variant`)
      .eq('id', productId)
      .eq('is_active', true)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) { router.replace('/'); return }
        setProduct(data)
        setQuantity(data.pack_size || 1)
        setLoading(false)
      })
  }, [productId])

  function handleAddToCart() {
    if (!product) return
    const displayName = (product.display_name || product.name) +
      (product.length_cm ? ` ${product.length_cm}см` : '')
    const existing = items.find(i => i.id === product.id)
    if (existing) {
      update(product.id, Math.min(existing.qty + quantity, product.qty))
    } else {
      add({
        id: product.id,
        name: displayName,
        price: product.price,
        available: product.qty,
        category: product.category,
        image_url: product.image_url,
      })
      update(product.id, quantity)
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const cartQty = items.find(i => i.id === productId)?.qty ?? 0
  const cartTotal = total()
  const cartCount = items.reduce((s, i) => s + i.qty, 0)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafaf8' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #f0e8ea', borderTopColor: '#7a1c2e', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!product) return null

  const displayName = product.display_name || product.name
  const countryLabel = product.country_iso ? (COUNTRY_LABELS[product.country_iso] ?? product.country_iso) : null

  const images: string[] = (() => {
    const imgs: string[] = []
    if (product.image_url) imgs.push(product.image_url)
    if (product.campaign_image_url && product.campaign_image_url !== product.image_url)
      imgs.push(product.campaign_image_url)
    for (const url of product.extra_images ?? []) {
      if (!imgs.includes(url)) imgs.push(url)
    }
    return imgs
  })()
  const mainPhoto = images[photoIdx] ?? null

  const colorDefs = (product.colors ?? [])
    .map(k => COLORS.find(c => c.key === k))
    .filter(Boolean) as typeof COLORS[number][]

  const potColorVal    = product.pot_color    ? (POT_COLOR_RU[product.pot_color.toLowerCase()]    ?? product.pot_color)    : null
  const matVal         = product.pot_material ? (POT_MATERIAL_RU[product.pot_material.toLowerCase()] ?? product.pot_material) : null
  const formVal        = product.pot_form     ? (POT_FORM_RU[product.pot_form.toLowerCase()]      ?? product.pot_form)     : null
  const substrVal      = product.substrate    ? (SUBSTRATE_RU[product.substrate.toLowerCase()]    ?? product.substrate)    : null

  const hasDiscount = product.previous_price && product.previous_price > product.price

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf8', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #efe8eb',
        padding: '10px 16px',
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: '#7a1c2e', textDecoration: 'none', fontWeight: 500,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Каталог
          </Link>
          {cartCount > 0 && (
            <Link href="/" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', fontSize: 12, fontWeight: 600,
              borderRadius: 20, color: '#7a1c2e',
              background: '#f7eef2', border: '1px solid #e8d0d8',
              textDecoration: 'none',
            }}>
              🛒 {cartCount} шт · {cartTotal.toLocaleString('ru-RU')} ₸
            </Link>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px 48px' }}>

        {/* Main card */}
        <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.06)', marginBottom: 16 }}>

          {/* Gallery */}
          <div
            style={{ position: 'relative', background: '#f5f0f2', cursor: images.length > 1 ? 'pointer' : 'default' }}
            onClick={() => images.length > 1 && setPhotoIdx(i => (i + 1) % images.length)}
          >
            {mainPhoto ? (
              <img
                src={mainPhoto}
                alt={displayName}
                style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{ width: '100%', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, opacity: 0.2 }}>
                🌸
              </div>
            )}

            {images.length > 1 && (
              <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
                {images.map((_, i) => (
                  <div
                    key={i}
                    onClick={e => { e.stopPropagation(); setPhotoIdx(i) }}
                    style={{
                      width: i === photoIdx ? 20 : 7, height: 7, borderRadius: 4,
                      background: '#fff', opacity: i === photoIdx ? 1 : 0.5,
                      transition: 'width 0.2s, opacity 0.2s', cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ padding: '20px 20px 24px' }}>

            {/* Name */}
            <h1 style={{
              fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 400,
              lineHeight: 1.3, color: '#1a1a1a', margin: '0 0 8px',
            }}>
              {displayName}
            </h1>

            {/* Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {countryLabel && (
                <span style={{
                  fontSize: 11, color: '#5B7BA0', background: 'rgba(91,123,160,0.1)',
                  borderRadius: 6, padding: '3px 10px', fontWeight: 600,
                }}>
                  {countryLabel}
                </span>
              )}
              {product.farm && (
                <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic', padding: '3px 0' }}>
                  {product.farm}
                </span>
              )}
              {colorDefs.length > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {colorDefs.map(col => (
                    <span
                      key={col.key}
                      title={col.label}
                      style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: ('gradient' in col ? col.gradient : col.bg) as string,
                        border: '1px solid rgba(0,0,0,0.12)', display: 'inline-block',
                      }}
                    />
                  ))}
                  {colorDefs.length === 1 && (
                    <span style={{ fontSize: 11, color: '#888' }}>{colorDefs[0].label}</span>
                  )}
                </span>
              )}
            </div>

            {/* Price */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#7a1c2e', lineHeight: 1 }}>
                {product.price.toLocaleString('ru-RU')} ₸
              </span>
              <span style={{ fontSize: 13, color: '#aaa' }}>/ шт</span>
              {hasDiscount && (
                <span style={{ fontSize: 14, color: '#aaa', textDecoration: 'line-through' }}>
                  {product.previous_price!.toLocaleString('ru-RU')} ₸
                </span>
              )}
            </div>

            {/* Stock + pack */}
            <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 18, flexWrap: 'wrap' }}>
              <span style={{ color: product.qty > 0 ? '#388E3C' : '#E53935', fontWeight: 600 }}>
                {product.qty > 0 ? `В наличии: ${product.qty} шт` : 'Нет в наличии'}
              </span>
              {product.pack_size > 1 && (
                <span style={{ color: '#888' }}>Кратность: {product.pack_size} шт</span>
              )}
              {!!product.stems_per_pack && (
                <span style={{ color: '#888' }}>В пачке: {product.stems_per_pack} стебл.</span>
              )}
            </div>

            {/* Stepper + Cart */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid #e8d0d8', borderRadius: 12, overflow: 'hidden',
              }}>
                <button
                  onClick={() => setQuantity(q => Math.max(product.pack_size, q - product.pack_size))}
                  disabled={quantity <= product.pack_size}
                  style={{
                    width: 40, height: 40, border: 'none', background: '#fdf5f7',
                    color: '#7a1c2e', fontSize: 18, fontWeight: 700,
                    cursor: quantity <= product.pack_size ? 'default' : 'pointer',
                    opacity: quantity <= product.pack_size ? 0.35 : 1,
                  }}
                >−</button>
                <div style={{ padding: '0 16px', textAlign: 'center', borderLeft: '1px solid #f0e8ea', borderRight: '1px solid #f0e8ea' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>{quantity}</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>{(quantity * product.price).toLocaleString('ru-RU')} ₸</div>
                </div>
                <button
                  onClick={() => setQuantity(q => Math.min(product.qty, q + product.pack_size))}
                  disabled={quantity + product.pack_size > product.qty}
                  style={{
                    width: 40, height: 40, border: 'none', background: '#fdf5f7',
                    color: '#7a1c2e', fontSize: 18, fontWeight: 700,
                    cursor: quantity + product.pack_size > product.qty ? 'default' : 'pointer',
                    opacity: quantity + product.pack_size > product.qty ? 0.35 : 1,
                  }}
                >+</button>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={product.qty === 0}
                style={{
                  flex: 1, minWidth: 180, height: 40,
                  background: product.qty === 0 ? '#e8e8e8' : '#7a1c2e',
                  color: product.qty === 0 ? '#aaa' : '#fff',
                  border: 'none', borderRadius: 12,
                  fontSize: 14, fontWeight: 600, cursor: product.qty === 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => product.qty > 0 && ((e.currentTarget as HTMLButtonElement).style.opacity = '0.88')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
              >
                {product.qty === 0 ? 'Нет в наличии' : added ? '✓ Добавлено' : `В корзину — ${(quantity * product.price).toLocaleString('ru-RU')} ₸`}
              </button>
            </div>

            {cartQty > 0 && (
              <Link
                href="/"
                style={{
                  display: 'block', textAlign: 'center', fontSize: 12,
                  marginTop: 10, color: '#7a1c2e', textDecoration: 'none', fontWeight: 500,
                }}
              >
                В корзине {cartQty} шт → Перейти к оформлению
              </Link>
            )}
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px 20px 24px', boxShadow: '0 2px 20px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <p style={{
              fontSize: 14, lineHeight: 1.7, color: '#333',
              margin: 0, whiteSpace: 'pre-wrap',
            }}>
              {product.description}
            </p>
          </div>
        )}

        {/* Characteristics */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '20px 20px 8px', boxShadow: '0 2px 20px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 400, color: '#1a1a1a', margin: '0 0 12px' }}>
            Характеристики
          </h2>
          <CharRow label="Категория" value={product.subcategory?.replace(/_/g, ' ')} />
          {product.length_cm && <CharRow label="Высота" value={`${product.length_cm} см`} />}
          {product.pot_diameter && <CharRow label="Диаметр горшка" value={`${product.pot_diameter} см`} />}
          {colorDefs.length > 0 && (
            <CharRow label="Цвет" value={colorDefs.map(c => c.label).join(', ')} />
          )}
          <CharRow label="Страна" value={countryLabel} />
          <CharRow label="Поставщик / ферма" value={product.farm} />
          {product.pack_size > 1 && <CharRow label="Кратность заказа" value={`${product.pack_size} шт`} />}
          {product.stems_per_pack && <CharRow label="Стеблей в упаковке" value={`${product.stems_per_pack} шт`} />}
          {product.weight_gram && <CharRow label="Вес упаковки" value={`${product.weight_gram} г`} />}
          <CharRow label="Качество" value={product.quality_grade} />
          {product.min_plants_per_pot && <CharRow label="Растений в горшке" value={`${product.min_plants_per_pot} шт`} />}
          {product.min_flowers_per_pot && <CharRow label="Цветков в горшке" value={`${product.min_flowers_per_pot} шт`} />}
          <CharRow label="Цвет горшка" value={potColorVal} />
          <CharRow label="Материал горшка" value={matVal} />
          <CharRow label="Тип горшка" value={formVal} />
          <CharRow label="Субстрат" value={substrVal} />
          {product.variant && <CharRow label="Вариант" value={product.variant} />}
        </div>

        {/* Care instructions */}
        {product.care_instructions && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px 20px 24px', boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 400, color: '#1a1a1a', margin: '0 0 12px' }}>
              Уход
            </h2>
            <p style={{
              fontSize: 14, lineHeight: 1.7, color: '#333',
              margin: 0, whiteSpace: 'pre-wrap',
            }}>
              {product.care_instructions}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
