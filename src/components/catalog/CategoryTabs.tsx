'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useFilters } from '@/lib/filter-store'
import { CATEGORY_TREE } from '@/lib/category-tree'

// Короткие ярлыки разделов в шапке (полное имя — в title). id = group.id из category-tree.
const SHORT: Record<string, string> = {
  packaging: 'Упаковка', pots: 'Горшки', vases: 'Вазы',
  decor: 'Декор', garden: 'Сад', lawn: 'Газоны',
}
const ICON: Record<string, string> = {
  packaging: 'm2 8 10-5 10 5-10 5z M2 8v8l10 5 10-5V8',
  pots: 'M5 9h14l-1.5 11h-11z M7 9V7a5 5 0 0 1 10 0v2',
  vases: 'M8 2h8 M9 2c0 3-2 4-2 8a5 5 0 0 0 10 0c0-4-2-5-2-8',
  decor: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  garden: 'M12 22V12 M12 12c0-3 2-5 5-5 0 3-2 5-5 5Z M12 12c0-3-2-5-5-5 0 3 2 5 5 5Z M7 17c0-2 2-3 5-3 M17 17c0-2-2-3-5-3',
  lawn: 'M3 20h18 M6 20v-5 M10 20v-7 M14 20v-5 M18 20v-8 M4 14c2-3 5-3 7 0 M13 13c2-2 5-2 7 0',
}

export default function CategoryTabs() {
  const router = useRouter()
  const pathname = usePathname()
  const { category, selectedLeaves, setCategory, setSelectedLeaves } = useFilters()

  const isActive = (leaves: string[]) =>
    category === 'accessories' && selectedLeaves.length > 0 && selectedLeaves.every(l => leaves.includes(l))

  const open = (leaves: string[]) => {
    setCategory('accessories')      // сбрасывает прочие фильтры
    setSelectedLeaves(leaves)       // ставим листья раздела
    router.push(`/?category=accessories&leaves=${leaves.join(',')}`)
  }

  return (
    <div className="flex items-stretch gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'thin', flex: 1, minWidth: 0 }}>
      {CATEGORY_TREE.map(g => {
        const slugs = g.leaves.map(l => l.slug)
        const active = isActive(slugs)
        return (
          <button
            key={g.id}
            onClick={() => open(slugs)}
            title={g.label}
            className="flex items-center gap-2 whitespace-nowrap border-none cursor-pointer transition-colors"
            style={{
              flex: 'none', height: 46, padding: '0 14px', background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: active ? '#fff' : 'rgba(255,255,255,0.82)',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              borderBottom: active ? '3px solid #fff' : '3px solid transparent',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', opacity: 0.92 }}>
              <path d={ICON[g.id]} />
            </svg>
            {SHORT[g.id] ?? g.label}
          </button>
        )
      })}
    </div>
  )
}
