'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/cart-store'
import Link from 'next/link'
import { COLORS } from '@/lib/colors'

const ORIGIN_MAP: Record<string, string> = {
  china: 'Китай', holland: 'Голландия', kenya: 'Кения',
  ecuador: 'Эквадор', colombia: 'Колумбия', russia: 'Россия',
}

type ProductData = {
  id: number
  name: string
  variety_name: string | null
  length_str: string | null
  length_cm: number | null
  image_url: string | null
  campaign_image_url: string | null
  category: string
  origin: string | null
  colors: string[] | null
  color: string | null
  pack_size: number
  stems_per_pack: number | null
  price: number
  available_qty: number
}

export default function ProductPage() {
  const params = useParams()
  const router = useRouter()
  const { items, add, update } = useCart()

  const [product, setProduct] = useState<ProductData | null>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [activePhoto, setActivePhoto] = useState(0)
  const [hovered, setHovered] = useState(false)

  const productId = Number(params.id)

  useEffect(() => {
    if (!productId) { router.replace('/'); return }

    const supabase = createClient()
    supabase
      .from('products')
      .select(`
        id, name, variety_name, length_str, length_cm,
        image_url, campaign_image_url, category, origin,
        colors, color, pack_size, stems_per_pack,
        stock:stock_available(price, available_qty)
      `)
      .eq('id', productId)
      .eq('is_active', true)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) { router.replace('/'); return }
        const s = Array.isArray(data.stock) ? data.stock[0] : data.stock
        const p: ProductData = {
          id: data.id,
          name: data.name,
          variety_name: data.variety_name,
          length_str: data.length_str,
          length_cm: data.length_cm,
          image_url: data.image_url,
          campaign_image_url: data.campaign_image_url,
          category: data.category,
          origin: data.origin,
          colors: data.colors,
          color: data.color,
          pack_size: data.pack_size || 1,
          stems_per_pack: data.stems_per_pack,
          price: s?.price ?? 0,
          available_qty: s?.available_qty ?? 0,
        }
        setProduct(p)
        setQuantity(p.pack_size)
        setLoading(false)
      })
  }, [productId])

  function handleAddToCart() {
    if (!product) return
    const existing = items.find(i => i.id === product.id)
    if (existing) {
      update(product.id, Math.min(existing.qty + quantity, product.available_qty))
    } else {
      add({
        id: product.id,
        name: (product.variety_name || product.name) + (product.length_str ? ` ${product.length_str}` : ''),
        price: product.price,
        available: product.available_qty,
        category: product.category,
        image_url: product.campaign_image_url || product.image_url,
      })
      update(product.id, quantity)
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const cartQty = items.find(i => i.id === productId)?.qty ?? 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: '#7a1c2e' }} />
      </div>
    )
  }

  if (!product) return null

  const displayName = product.variety_name || product.name
  const photos = [product.image_url, product.campaign_image_url].filter(Boolean) as string[]
  const hasSecondPhoto = photos.length > 1
  const showSecond = hasSecondPhoto && (hovered || activePhoto === 1)
  const colorKeys = product.colors?.length ? product.colors : product.color ? [product.color] : []
  const colorDefs = colorKeys.map(k => COLORS.find(c => c.key === k)).filter(Boolean) as typeof COLORS[number][]
  const originLabel = product.origin ? ORIGIN_MAP[product.origin.toLowerCase()] ?? product.origin : null

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Каталог
          </Link>
          {cartQty > 0 && (
            <Link href="/" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg text-white" style={{ backgroundColor: '#7a1c2e' }}>
              🛒 {cartQty} шт в корзине
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Фото */}
          <div
            className="aspect-square bg-pink-50 relative overflow-hidden"
            onMouseEnter={() => hasSecondPhoto && setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {photos[0] ? (
              <img
                src={photos[0]}
                alt={displayName}
                className="w-full h-full object-cover absolute inset-0"
                style={{ opacity: showSecond ? 0 : 1, transition: 'opacity 0.35s ease' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-8xl opacity-30">🌸</div>
            )}
            {hasSecondPhoto && (
              <img
                src={photos[1]}
                alt={displayName}
                className="w-full h-full object-cover absolute inset-0"
                style={{ opacity: showSecond ? 1 : 0, transition: 'opacity 0.35s ease' }}
              />
            )}
            {/* Точки-переключатели */}
            {hasSecondPhoto && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 z-10">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setActivePhoto(i); setHovered(false) }}
                    style={{
                      width: 7, height: 7, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                      background: i === activePhoto ? '#fff' : 'rgba(255,255,255,0.45)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Инфо */}
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{displayName}</h1>

            {/* Meta */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 mb-4">
              {originLabel && <span>{originLabel}</span>}
              {product.length_cm && <span>{product.length_cm} см</span>}
              {colorDefs.length > 0 && (
                <div className="flex items-center gap-1">
                  {colorDefs.map(c => (
                    <div
                      key={c.key}
                      title={c.label}
                      style={{
                        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                        background: ('gradient' in c ? c.gradient : c.bg) as string,
                        border: `1px solid ${'border' in c ? c.border : '#E0E0E0'}`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Цена */}
            <div className="mb-5">
              <span className="text-4xl font-bold" style={{ color: '#7a1c2e' }}>
                {product.price.toLocaleString('ru-RU')} ₸
              </span>
              <span className="text-gray-400 text-sm ml-1">/ шт</span>
            </div>

            {/* Остаток */}
            <div className="flex items-center gap-4 text-sm mb-5">
              <span className="text-green-600 font-medium">✓ В наличии: {product.available_qty} шт</span>
              {product.pack_size > 1 && <span className="text-gray-400">Кратность: {product.pack_size} шт</span>}
              {!!product.stems_per_pack && <span className="text-gray-400">В пачке: {product.stems_per_pack} стебл.</span>}
            </div>

            {/* Количество */}
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={() => setQuantity(q => Math.max(product.pack_size, q - product.pack_size))}
                disabled={quantity <= product.pack_size}
                className="w-11 h-11 rounded-xl border border-gray-200 text-xl font-medium disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >−</button>
              <div className="flex-1 text-center">
                <div className="text-2xl font-bold text-gray-900">{quantity}</div>
                <div className="text-xs text-gray-400">шт · {(quantity * product.price).toLocaleString('ru-RU')} ₸</div>
              </div>
              <button
                onClick={() => setQuantity(q => Math.min(product.available_qty, q + product.pack_size))}
                disabled={quantity + product.pack_size > product.available_qty}
                className="w-11 h-11 rounded-xl border border-gray-200 text-xl font-medium disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >+</button>
            </div>

            {/* Кнопка */}
            <button
              onClick={handleAddToCart}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-base transition-opacity hover:opacity-90 active:opacity-80"
              style={{ backgroundColor: '#7a1c2e' }}
            >
              {added ? '✓ Добавлено в корзину' : `В корзину — ${(quantity * product.price).toLocaleString('ru-RU')} ₸`}
            </button>

            {cartQty > 0 && (
              <Link
                href="/"
                className="block text-center text-sm mt-3 font-medium hover:underline"
                style={{ color: '#7a1c2e' }}
              >
                В корзине {cartQty} шт → Перейти к оформлению
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
