import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type FilterCategory = 'all' | 'cut' | 'pot' | 'accessories'

// Default category while cut/pot pills are hidden — change back to 'cut' when unhiding
const DEFAULT_CATEGORY: FilterCategory = 'accessories'
// accessories теперь мульти-выбор листьев (selectedLeaves), без одиночного subcat-дефолта.
// cut/pot по-прежнему используют subcat/varietyType.
const DEFAULT_SUBCAT = ''

function getPersistedCategory(): FilterCategory {
  if (typeof window === 'undefined') return DEFAULT_CATEGORY
  try {
    const raw = sessionStorage.getItem('catalog-filters')
    const val = raw ? JSON.parse(raw)?.state?.category : null
    if (val === 'all' || val === 'cut' || val === 'pot' || val === 'accessories') return val
  } catch {}
  return DEFAULT_CATEGORY
}

export type StockLevel = '' | 'low' | 'high'

export type Facets = {
  subcatCounts: Record<string, number>
  vtCounts: Record<string, number>
  colorCounts: Record<string, number>
  lengthCounts: Record<number, number>
  originCounts: Record<string, number>
  seasonCounts: Record<string, number>
  farmCounts: Record<string, number>
}

type FilterStore = {
  category: FilterCategory
  subcat: string
  varietyType: string
  selectedLeaves: string[]   // мульти-выбор листьев для accessories (по leaf.slug)
  subgroup: string
  onlyAvailable: boolean
  onlyDiscount: boolean
  stockLevel: StockLevel
  search: string
  colors: string[]
  lengths: number[]
  origins: string[]
  farms: string[]
  potSizes: string[]
  volumeRanges: string[]
  tags: string[]
  seasons: string[]
  facets: Facets | null

  setCategory: (v: FilterCategory) => void
  setSubcat: (v: string) => void
  setVarietyType: (v: string) => void
  setSubcatAndVT: (subcat: string, varietyType: string) => void
  toggleLeaf: (slug: string) => void
  clearLeaves: () => void
  setSubgroup: (v: string) => void
  setOnlyAvailable: (v: boolean) => void
  setOnlyDiscount: (v: boolean) => void
  setStockLevel: (v: StockLevel) => void
  setSearch: (v: string) => void
  toggleColor: (v: string) => void
  toggleLength: (v: number) => void
  toggleOrigin: (v: string) => void
  toggleFarm: (v: string) => void
  togglePotSize: (v: string) => void
  toggleVolumeRange: (v: string) => void
  toggleTag: (v: string) => void
  toggleSeason: (v: string) => void
  reset: () => void
  loadFacets: () => Promise<void>
}

const tog = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

export const useFilters = create<FilterStore>()(
  persist(
    (set, get) => ({
  category: getPersistedCategory(),
  subcat: DEFAULT_SUBCAT,
  varietyType: '',
  selectedLeaves: [],
  subgroup: '',
  onlyAvailable: true,
  onlyDiscount: false,
  stockLevel: '',
  search: '',
  colors: [],
  lengths: [],
  origins: [],
  farms: [],
  potSizes: [],
  volumeRanges: [],
  tags: [],
  seasons: [],
  facets: null,

  setCategory: (category) => set({
    category, subcat: '', varietyType: '', selectedLeaves: [], subgroup: '',
    search: '',
    colors: [], lengths: [], origins: [], farms: [], potSizes: [], volumeRanges: [], tags: [],
    seasons: [],
  }),
  setSubcat:        (subcat) => set({ subcat, varietyType: '', subgroup: '' }),
  setVarietyType:   (varietyType) => set({ varietyType }),
  setSubcatAndVT:   (subcat, varietyType) => set({ subcat, varietyType, subgroup: '' }),
  toggleLeaf:       (slug) => set(s => ({ selectedLeaves: tog(s.selectedLeaves, slug), subgroup: '' })),
  clearLeaves:      () => set({ selectedLeaves: [], subgroup: '' }),
  setSubgroup:      (subgroup) => set({ subgroup }),
  setOnlyAvailable: (onlyAvailable) => set({ onlyAvailable }),
  setOnlyDiscount:  (onlyDiscount) => set({ onlyDiscount }),
  setStockLevel:    (stockLevel) => set({ stockLevel }),
  setSearch:        (search) => set({ search }),
  toggleColor:      (v) => set(s => ({ colors:      tog(s.colors,      v) })),
  toggleLength:     (v) => set(s => ({ lengths:     s.lengths.includes(v) ? s.lengths.filter(l => l !== v) : [...s.lengths, v] })),
  toggleOrigin:     (v) => set(s => ({ origins:     tog(s.origins,     v) })),
  toggleFarm:       (v) => set(s => ({ farms:       tog(s.farms,       v) })),
  togglePotSize:    (v) => set(s => ({ potSizes:    tog(s.potSizes,    v) })),
  toggleVolumeRange:(v) => set(s => ({ volumeRanges: tog(s.volumeRanges, v) })),
  toggleTag:    (v) => set(s => ({ tags:    tog(s.tags,    v) })),
  toggleSeason: (v) => set(s => ({ seasons: tog(s.seasons, v) })),
  reset: () => set({
    category: DEFAULT_CATEGORY, subcat: DEFAULT_SUBCAT, varietyType: '', selectedLeaves: [], subgroup: '',
    onlyAvailable: true, onlyDiscount: false, stockLevel: '',
    search: '', colors: [], lengths: [], origins: [], farms: [], potSizes: [], volumeRanges: [], tags: [],
    seasons: [], facets: null,
  }),
  loadFacets: async () => {
    const { category, subcat, varietyType, subgroup, volumeRanges, onlyAvailable } = get()
    const res = await fetch('/api/facets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, subcat, varietyType, subgroup, volumeRanges, onlyAvailable }),
    })
    if (res.ok) {
      const facets: Facets = await res.json()
      set({ facets })
    }
  },
}),
{
  name: 'catalog-filters',
  version: 3,
  storage: createJSONStorage(() => sessionStorage),
  partialize: (s) => ({
    category:      s.category,
    subcat:        s.subcat,
    varietyType:   s.varietyType,
    selectedLeaves: s.selectedLeaves,
    subgroup:      s.subgroup,
    onlyAvailable: s.onlyAvailable,
    onlyDiscount:  s.onlyDiscount,
    colors:        s.colors,
    lengths:       s.lengths,
    origins:       s.origins,
    farms:         s.farms,
    potSizes:      s.potSizes,
    volumeRanges:  s.volumeRanges,
    tags:          s.tags,
    seasons:       s.seasons,
  }),
}
  )
)
