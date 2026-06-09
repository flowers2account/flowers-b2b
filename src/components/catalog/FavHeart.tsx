'use client'
import { useFavorites } from '@/lib/favorites-store'

const ROSEWOOD = '#8B3A5A'

// Сердечко-избранное. Единое состояние из favorites-store → каталог, карточка, /favorites синхронны.
export default function FavHeart({ productId, size = 30, style }: {
  productId: number
  size?: number
  style?: React.CSSProperties
}) {
  const isFav = useFavorites(s => s.ids.has(productId))
  const toggle = useFavorites(s => s.toggle)

  return (
    <button
      onClick={e => { e.stopPropagation(); e.preventDefault(); toggle(productId) }}
      aria-label={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
      title={isFav ? 'В избранном' : 'В избранное'}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'rgba(255,255,255,0.88)', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 6px rgba(0,0,0,0.15)', backdropFilter: 'blur(4px)',
        ...style,
      }}
    >
      <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24"
        fill={isFav ? ROSEWOOD : 'none'} stroke={ROSEWOOD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    </button>
  )
}
