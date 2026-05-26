'use client'
import { Badge } from '@/components/ui/badge'
import { COLORS } from '@/lib/colors'

const ROLE_ICONS: Record<string, string> = {
  focal: '🌹', mass: '🌸', line: '🌿',
  filler: '🍃', texture: '✨', foliage: '🌱',
}
const ROLE_LABELS: Record<string, string> = {
  focal: 'Фокусный', mass: 'Массовый', line: 'Линейный',
  filler: 'Наполнитель', texture: 'Текстура', foliage: 'Зелень',
}
const ORIGIN_LABELS: Record<string, string> = {
  ecuador: 'Эквадор', kenya: 'Кения', holland: 'Голландия',
  china: 'Китай', colombia: 'Колумбия', local: 'Местный',
}

type Stock = {
  price: number
  qty: number
  qty_reserved: number
  is_available: boolean
  available_qty?: number
  reserved_qty?: number
} | null

export type Product = {
  id: number
  name: string
  display_name?: string | null
  variety_name: string | null
  length_str: string | null
  length_cm: number | null
  category: string
  subcategory?: string | null
  variety_type?: string | null
  color?: string | null
  pot_size?: number | null
  pot_diameter?: number | null
  country_iso?: string | null
  floral_role?: string | null
  stem_durability?: string | null
  season?: string | null
  origin?: string | null
  description?: string | null
  images?: string[] | null
  campaign_image_url?: string | null
  colors?: string[] | null
  search_aliases?: string[] | null
  pack_size: number
  stems_per_pack?: number | null
  image_url?: string | null
  previous_price?: number | null
  arrival_date?: string | null
  is_new?: boolean
  tags?: string[] | null
  stock: Stock[] | Stock
}

export function getStock(s: Stock[] | Stock): Stock {
  if (Array.isArray(s)) return s[0] ?? null
  return s
}

export function getAvailable(s: Stock[] | Stock): number {
  const st = getStock(s)
  if (!st) return 0
  return st.available_qty ?? Math.max(0, st.qty - st.qty_reserved)
}

export function getPrice(s: Stock[] | Stock): number {
  const st = getStock(s)
  return st?.price ?? 0
}

function StockBadge({ qty }: { qty: number }) {
  if (qty === 0) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Нет</Badge>
  if (qty <= 5) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{qty} шт</Badge>
  if (qty <= 30) return <Badge className="bg-orange-500 hover:bg-orange-600 text-[10px] px-1.5 py-0">{qty} шт</Badge>
  return <Badge className="bg-green-600 hover:bg-green-700 text-[10px] px-1.5 py-0">{qty} шт</Badge>
}

type Props = {
  product: Product
  qty: number
  isAuthed: boolean
  onDecrement: () => void
  onIncrement: () => void
}

export default function ProductCard({ product, qty, isAuthed, onDecrement, onIncrement }: Props) {
  if (process.env.NODE_ENV === 'development') console.log('[ProductCard]', product.id, { floral_role: product.floral_role, origin: product.origin, stem_durability: product.stem_durability })
  const available = getAvailable(product.stock)
  const price = getPrice(product.stock)
  const hasDiscount = !!(product.previous_price && product.previous_price > price)
  const displayName = product.display_name || product.variety_name || product.name

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">

      {/* Фото */}
      <div className="aspect-square bg-pink-50 relative overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl select-none">🌸</div>
        )}
        {hasDiscount && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
            Уценка
          </span>
        )}
        <div className="absolute top-2 right-2">
          {isAuthed ? (
            <StockBadge qty={available} />
          ) : available > 0 ? (
            <Badge className="text-[10px] px-1.5 py-0 bg-gray-600 hover:bg-gray-600">В наличии</Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Нет</Badge>
          )}
        </div>
      </div>

      {/* Информация */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div>
          <div className="font-semibold text-sm leading-tight text-gray-800 line-clamp-2">{displayName}</div>
          {product.colors && product.colors.length > 0 && (
            <div style={{ display: 'flex', gap: 3, marginTop: 4, marginBottom: 2, flexWrap: 'wrap' }}>
              {product.colors.map(c => {
                const col = COLORS.find(x => x.key === c)
                return col ? (
                  <div key={c} title={col.label} style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: ('gradient' in col ? col.gradient : col.bg) as string,
                    border: '1px solid rgba(0,0,0,0.1)',
                  }} />
                ) : null
              })}
            </div>
          )}
          {product.length_str && (
            <span style={{ fontSize: 11, color: 'var(--text-mid)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="2" x2="12" y2="22"/>
                <line x1="8" y1="6" x2="16" y2="6"/>
                <line x1="8" y1="18" x2="16" y2="18"/>
              </svg>
              {product.length_str}
            </span>
          )}
          {(product.floral_role || product.origin) && (
            <div style={{ fontSize: 10, color: 'var(--text-mid)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
              {product.floral_role && (
                <span>{ROLE_ICONS[product.floral_role]} {ROLE_LABELS[product.floral_role]}</span>
              )}
              {product.floral_role && product.origin && (
                <span style={{ color: 'var(--border)' }}>·</span>
              )}
              {product.origin && (
                <span>{ORIGIN_LABELS[product.origin] ?? product.origin}</span>
              )}
            </div>
          )}
        </div>

        {/* Цена */}
        <div className="flex items-baseline gap-1.5 mt-auto">
          {isAuthed ? (
            <>
              <span className="text-base font-bold text-[#8B1A1A]">{price.toLocaleString('ru-RU')} ₸</span>
              {hasDiscount && (
                <span className="text-xs text-gray-400 line-through">
                  {product.previous_price!.toLocaleString('ru-RU')} ₸
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-gray-300 select-none tracking-widest">●●● ₸</span>
          )}
        </div>

        {/* Количество */}
        <div className="flex items-center justify-between gap-1 mt-1">
          <span className="text-[10px] text-gray-400">уп.&nbsp;{product.pack_size} шт</span>
          <div className="flex items-center gap-1">
            <button
              className="w-7 h-7 border rounded-lg text-sm font-bold hover:bg-gray-100 disabled:opacity-30 transition-colors"
              onClick={onDecrement}
              disabled={qty === 0}
            >−</button>
            <span className="w-7 text-center text-sm font-semibold">{qty}</span>
            <button
              className="w-7 h-7 bg-[#8B1A1A] text-white rounded-lg text-sm font-bold hover:bg-[#A52020] disabled:opacity-30 transition-colors"
              onClick={onIncrement}
              disabled={qty >= available}
            >+</button>
          </div>
        </div>
      </div>
    </div>
  )
}
