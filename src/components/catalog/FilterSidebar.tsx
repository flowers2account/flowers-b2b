'use client'
import { useFilters } from '@/lib/filter-store'

type Product = { id: number; category: string }

const CATEGORIES = [
  { value: 'all' as const, label: 'Все' },
  { value: 'cut' as const, label: 'Срезанные цветы' },
  { value: 'pot' as const, label: 'Горшечные растения' },
]

const AVAILABILITY = [
  { label: 'Все' },
  { label: 'Есть в наличии' },
  { label: 'Уценка' },
]

export default function FilterSidebar({ products }: { products: Product[] }) {
  const { category, onlyDiscount, search, setCategory, setOnlyDiscount, setSearch } = useFilters()

  const hasPot = products.some(p => p.category === 'pot')

  function setAvailability(label: string) {
    if (label === 'Уценка') { setOnlyDiscount(true) }
    else { setOnlyDiscount(false) }
  }

  const activeAvailability = onlyDiscount ? 'Уценка' : 'Все'

  return (
    <div className="space-y-6 sticky top-[100px]">

      {/* Поиск */}
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Поиск</div>
        <input
          type="text"
          placeholder="Название сорта..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 bg-white"
        />
      </div>

      {/* Категория */}
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Категория</div>
        <div className="space-y-0.5">
          {CATEGORIES.filter(c => c.value !== 'pot' || hasPot).map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                category === c.value
                  ? 'bg-[#8B1A1A] text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Наличие */}
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Наличие</div>
        <div className="space-y-0.5">
          {AVAILABILITY.map(opt => (
            <button
              key={opt.label}
              onClick={() => setAvailability(opt.label)}
              className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                activeAvailability === opt.label
                  ? 'bg-[#8B1A1A] text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
