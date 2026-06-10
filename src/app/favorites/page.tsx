'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useFavorites } from '@/lib/favorites-store'
import { useAuthStore } from '@/lib/auth-store'
import { useCart } from '@/lib/cart-store'
import { type Product, getAvailable, getPrice } from '@/components/catalog/ProductCard'
import { unitForProduct } from '@/lib/category-tree'
import s from './favorites.module.css'

const SELECT = `id, name, display_name, length_cm, pot_diameter, category, subcategory, variety_type, pack_size, stems_per_pack, weight_gram, colors, image_url, campaign_image_url, extra_images, arrival_date, price, previous_price, qty, country_iso, tags, farm, variant, unit, price_per_m, price_per_m2, short_description, is_active, source`

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'
const plural = (n: number) => { const a = n % 10, b = n % 100; if (a === 1 && b !== 11) return 'товар'; if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'товара'; return 'товаров' }

const PH = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" />
  </svg>
)
const HEART = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>

function mapStock(p: any): Product {
  const today = new Date().toISOString().slice(0, 10)
  const qty = p.qty ?? 0
  return { ...p, is_new: p.arrival_date === today, stock: { price: p.price ?? 0, qty, qty_reserved: 0, is_available: qty > 0, available_qty: qty } }
}

export default function FavoritesPage() {
  const ids = useFavorites(s => s.ids)
  const clientId = useFavorites(s => s.clientId)
  const toggle = useFavorites(s => s.toggle)
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
      setProducts((data ?? []).map(mapStock))
      setLoading(false)
    })
    return () => { alive = false }
  }, [ids])

  const getQty = (id: number) => items.find(i => i.id === id)?.qty ?? 0
  function addToCart(p: Product) {
    if (getQty(p.id) > 0) { router.push('/cart'); return }
    const available = getAvailable(p.stock)
    const price = getPrice(p.stock)
    const packSize = p.stems_per_pack || p.pack_size || 1
    add({ id: p.id, name: p.display_name || p.name, price, available, category: p.category, image_url: p.image_url, unit: (p as any).unit ?? null, subcategory: p.subcategory ?? null })
    update(p.id, packSize)
  }
  function addAll() {
    const cart = useCart.getState()
    let addedAny = false
    for (const p of products) {
      if (getAvailable(p.stock) <= 0) continue
      if (cart.items.some(i => i.id === p.id)) continue
      const packSize = p.stems_per_pack || p.pack_size || 1
      cart.add({ id: p.id, name: p.display_name || p.name, price: getPrice(p.stock), available: getAvailable(p.stock), category: p.category, image_url: p.image_url, unit: (p as any).unit ?? null, subcategory: p.subcategory ?? null })
      cart.update(p.id, packSize)
      addedAny = true
    }
    // всё уже в корзине / нечего добавлять → даём фидбек переходом в корзину
    if (!addedAny) router.push('/cart')
  }

  // Гость
  if (!isAuthed || !clientId) {
    return (
      <main className={s.page}><div className={s.shell}>
        <div className={s.phead}>
          <nav className={s.crumbs}><a onClick={() => router.push('/catalog')}>Каталог</a><span>›</span><span className={s.cur}>Избранное</span></nav>
          <div className={s.title}>Избранное</div>
        </div>
        <div className={s.empty}>
          <div className={s.ic}>{HEART}</div>
          <h2>Войдите, чтобы сохранять избранное</h2>
          <p>Отмечайте товары сердечком в каталоге — они появятся здесь после входа по номеру телефона.</p>
          <button className={s.go} onClick={() => setNeedAuth(true)}>Войти</button>
        </div>
      </div></main>
    )
  }

  const count = ids.size
  const empty = count === 0

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.phead}>
          <nav className={s.crumbs}><a onClick={() => router.push('/catalog')}>Каталог</a><span>›</span><span className={s.cur}>Избранное</span></nav>
          <div className={s.title}>Избранное {count > 0 && <span className={s.n}>· {count} {plural(count)}</span>}</div>
          {!empty && <div className={s.sub}>Сохранённые товары. Добавьте в корзину, когда будете готовы заказать.</div>}
          {!empty && (
            <div className={s.bar}>
              <button type="button" className={s.allcart} onClick={addAll}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
                Добавить всё в корзину
              </button>
            </div>
          )}
        </div>

        {empty ? (
          <div className={s.empty}>
            <div className={s.ic}>{HEART}</div>
            <h2>В избранном пусто</h2>
            <p>Нажимайте на сердечко у товара в каталоге, чтобы сохранить его сюда и не искать заново.</p>
            <Link href="/catalog" className={s.go}>Перейти в каталог
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        ) : loading ? (
          <div className={s.wrap} style={{ color: 'var(--ink-3)' }}>Загрузка…</div>
        ) : (
          <div className={s.wrap}>
            <div className={s.grid}>
              {products.map(p => {
                const available = getAvailable(p.stock)
                const out = available <= 0 || (p as any).is_active === false
                const inCart = getQty(p.id) > 0
                const unit = unitForProduct(p as any)
                const name = p.display_name || p.name
                const variant = (p as any).variant as string | null
                return (
                  <div key={p.id} className={s.card}>
                    <div className={s.cardImg} onClick={() => router.push(`/product/${p.id}`)}>
                      <button className={s.fav} title="Убрать из избранного" onClick={e => { e.stopPropagation(); toggle(p.id) }}>{HEART}</button>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.image_url ? <img src={p.image_url} alt={name} /> : <span className={s.ph}>{PH}</span>}
                      <span className={`${s.stock} ${out ? s.out : ''}`}><span className={s.dot} />{out ? 'нет в наличии' : `${available} ${unit} в наличии`}</span>
                    </div>
                    <div className={s.cardBody}>
                      <div className={s.name} onClick={() => router.push(`/product/${p.id}`)}>{name}</div>
                      {variant && <div className={s.var}>Вариант: <b>{variant}</b></div>}
                      <div className={s.price}>{fmt(getPrice(p.stock))}<span>/ {unit}</span></div>
                      {out ? (
                        <button className={`${s.addbtn} ${s.out}`} disabled>Нет в наличии</button>
                      ) : inCart ? (
                        <button className={`${s.addbtn} ${s.added}`} onClick={() => router.push('/cart')}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                          В корзине
                        </button>
                      ) : (
                        <button className={s.addbtn} onClick={() => addToCart(p)}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                          В корзину
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
