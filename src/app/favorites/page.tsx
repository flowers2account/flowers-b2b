'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useFavorites } from '@/lib/favorites-store'
import { useAuthStore } from '@/lib/auth-store'
import { useCart } from '@/lib/cart-store'
import { GridCard } from '@/components/catalog/ProductGrid'
import { type Product, getAvailable, getPrice } from '@/components/catalog/ProductCard'

const SELECT = `id, name, display_name, length_cm, pot_diameter, category, subcategory, variety_type, pack_size, stems_per_pack, weight_gram, colors, image_url, campaign_image_url, extra_images, arrival_date, price, previous_price, qty, country_iso, tags, farm, variant, unit, price_per_m, price_per_m2, short_description, is_active, source`

function mapStock(p: any): Product {
  const today = new Date().toISOString().slice(0, 10)
  const qty = p.qty ?? 0
  return {
    ...p,
    is_new: p.arrival_date === today,
    stock: { price: p.price ?? 0, qty, qty_reserved: 0, is_available: qty > 0, available_qty: qty },
  }
}

export default function FavoritesPage() {
  const ids = useFavorites(s => s.ids)
  const clientId = useFavorites(s => s.clientId)
  const setNeedAuth = useFavorites(s => s.setNeedAuth)
  const isAuthed = useAuthStore(s => s.isAuthed)
  const { items, add, update } = useCart()
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const list = [...ids]
    if (list.length === 0) { setProducts([]); setLoading(false); return }
    let alive = true
    createClient().from('products').select(SELECT).in('id', list).then(({ data }: { data: any[] | null }) => {
      if (!alive) return
      // порядок как в избранном (по id-набору) — сортировать не обязательно
      setProducts((data ?? []).map(mapStock))
      setLoading(false)
    })
    return () => { alive = false }
  }, [ids])

  const getQty = (id: number) => items.find(i => i.id === id)?.qty ?? 0
  const handleInc = (p: Product) => {
    const qty = getQty(p.id)
    const available = getAvailable(p.stock)
    const price = getPrice(p.stock)
    const packSize = p.stems_per_pack || p.pack_size || 1
    if (qty === 0) {
      add({ id: p.id, name: p.display_name || p.name, price, available, category: p.category, image_url: p.image_url, unit: (p as any).unit ?? null, subcategory: p.subcategory ?? null })
      update(p.id, packSize)
    } else {
      update(p.id, Math.min(qty + packSize, available))
    }
  }
  const handleDec = (p: Product) => update(p.id, Math.max(0, getQty(p.id) - (p.pack_size || 5)))

  const wrap: React.CSSProperties = { maxWidth: 1320, margin: '0 auto', padding: '28px 22px 64px' }
  const h1: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 28, letterSpacing: '-0.01em', marginBottom: 6 }

  // Гость
  if (!isAuthed || !clientId) {
    return (
      <main style={{ background: '#F7EEF2', minHeight: '60vh' }}>
        <div style={wrap}>
          <h1 style={h1}>Избранное</h1>
          <div style={{ marginTop: 24, padding: '40px 24px', background: '#fff', border: '1px solid var(--border)', borderRadius: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🤍</div>
            <p style={{ fontSize: 15, color: 'var(--text-mid)', marginBottom: 18 }}>Войдите по номеру телефона, чтобы сохранять избранное.</p>
            <button onClick={() => setNeedAuth(true)}
              style={{ height: 44, padding: '0 22px', borderRadius: 999, background: '#8B3A5A', color: '#fff', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Войти
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: '#F7EEF2', minHeight: '60vh' }}>
      <div style={wrap}>
        <h1 style={h1}>Избранное</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-mid)', marginBottom: 22 }}>{ids.size} {ids.size === 1 ? 'товар' : 'товаров'}</p>

        {ids.size === 0 ? (
          <div style={{ padding: '48px 24px', background: '#fff', border: '1px solid var(--border)', borderRadius: 16, textAlign: 'center', color: 'var(--text-mid)' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🤍</div>
            Пока ничего не отмечено
          </div>
        ) : loading ? (
          <div style={{ color: 'var(--text-mid)', padding: 24 }}>Загрузка…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {products.map(p => {
              const unavailable = getAvailable(p.stock) <= 0 || (p as any).is_active === false
              return (
                <div key={p.id} style={{ opacity: unavailable ? 0.55 : 1 }}>
                  <GridCard
                    product={p}
                    qty={getQty(p.id)}
                    isAuthed={isAuthed}
                    onDec={() => handleDec(p)}
                    onInc={() => handleInc(p)}
                    onCardClick={() => router.push(`/product/${p.id}`)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
