'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/cart-store'
import Link from 'next/link'
import { COLORS } from '@/lib/colors'

const COUNTRY_LABELS: Record<string, string> = {
  EC: 'Эквадор', KE: 'Кения', NL: 'Голландия', CN: 'Китай',
  CO: 'Колумбия', RU: 'Россия', ET: 'Эфиопия', EG: 'Египет', IL: 'Израиль',
}

type ProductData = {
  id: number
  name: string
  display_name: string | null
  length_cm: number | null
  image_url: string | null
  country_iso: string | null
  colors: string[] | null
  pack_size: number
  stems_per_pack: number | null
  price: number
  qty: number
  category: string
}

export default function ProductPage() {
  const params = useParams()
  const router = useRouter()
  const { items, add, update } = useCart()

  const [product, setProduct] = useState<ProductData | null>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const productId = Number(params.id)

  useEffect(() => {
    if (!productId) { router.replace('/'); return }

    const supabase = createClient()
    supabase
      .from('products')
      .select('id, name, display_name, length_cm, image_url, country_iso, colors, pack_size, stems_per_pack, price, qty, category')
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: '#7a1c2e' }} />
      </div>
    )
  }

  if (!product) return null

  const displayName = product.display_name || product.name
  const countryLabel = product.country_iso ? (COUNTRY_LABELS[product.country_iso] ?? product.country_iso) : null
  const colorDefs = (product.colors ?? [])
    .map(k => COLORS.find(c => c.key === k))
    .filter(Boolean) as typeof COLORS[number][]

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
              В корзине {cartQty} шт
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Фото */}
          <div className="aspect-square bg-pink-50 relative overflow-hidden">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-8xl opacity-30">🌸</div>
            )}
          </div>

          {/* Инфо */}
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{displayName}</h1>

            {/* Meta */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 mb-4">
              {countryLabel && (
                <span style={{
                  fontSize: 11, color: '#5B7BA0', background: 'rgba(91,123,160,0.1)',
                  borderRadius: 4, padding: '2px 8px', fontWeight: 500,
                }}>
                  {countryLabel}
                </span>
              )}
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
              <span className="text-green-600 font-medium">В наличии: {product.qty} шт</span>
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
                onClick={() => setQuantity(q => Math.min(product.qty, q + product.pack_size))}
                disabled={quantity + product.pack_size > product.qty}
                className="w-11 h-11 rounded-xl border border-gray-200 text-xl font-medium disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >+</button>
            </div>

            {/* Кнопка */}
            <button
              onClick={handleAddToCart}
              disabled={product.qty === 0}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-base transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40"
              style={{ backgroundColor: '#7a1c2e' }}
            >
              {product.qty === 0
                ? 'Нет в наличии'
                : added
                ? 'Добавлено в корзину'
                : `В корзину — ${(quantity * product.price).toLocaleString('ru-RU')} ₸`}
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
