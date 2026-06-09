'use client'
import { useRouter } from 'next/navigation'
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
  const { category, group, setCategory, setGroup } = useFilters()

  const open = (id: string) => {
    if (category !== 'accessories') setCategory('accessories') // setCategory сбросит group → ставим после
    setGroup(id)                    // меняет раздел, очищает selectedLeaves
    router.push(`/?category=accessories&group=${id}`)
  }

  return (
    <div className="flex items-stretch gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'thin', flex: 1, minWidth: 0 }}>
      {/* «Все» — режим подборки: мультивыбор листьев по всем разделам */}
      <button
        onClick={() => open('all')}
        title="Все категории — комбинируйте фильтры"
        className="flex items-center gap-2 whitespace-nowrap border-none cursor-pointer transition-colors"
        style={{
          flex: 'none', height: 46, padding: '0 14px',
          background: group === 'all' ? 'rgba(255,255,255,0.12)' : 'transparent',
          color: group === 'all' ? '#fff' : 'rgba(255,255,255,0.82)',
          fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
          borderBottom: group === 'all' ? '3px solid #fff' : '3px solid transparent',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', opacity: 0.92 }}>
          <path d="M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z" />
        </svg>
        Все
      </button>
      {CATEGORY_TREE.map(g => {
        const active = group === g.id
        return (
          <button
            key={g.id}
            onClick={() => open(g.id)}
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
