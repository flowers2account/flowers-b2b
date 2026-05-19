import { create } from 'zustand'

export type FilterCategory = 'all' | 'cut' | 'pot' | 'supply'

export type StockLevel = '' | 'low' | 'high'

export type Facets = {
  subcatCounts: Record<string, number>
  vtCounts: Record<string, number>
  colorCounts: Record<string, number>
  lengthCounts: Record<number, number>
  originCounts: Record<string, number>
  seasonCounts: Record<string, number>
}

type FilterStore = {
  category: FilterCategory
  subcat: string
  varietyType: string
  onlyAvailable: boolean
  onlyDiscount: boolean
  stockLevel: StockLevel
  search: string
  colors: string[]
  lengths: number[]
  origins: string[]
  potSizes: string[]
  tags: string[]
  seasons: string[]
  facets: Facets | null

  setCategory: (v: FilterCategory) => void
  setSubcat: (v: string) => void
  setVarietyType: (v: string) => void
  setOnlyAvailable: (v: boolean) => void
  setOnlyDiscount: (v: boolean) => void
  setStockLevel: (v: StockLevel) => void
  setSearch: (v: string) => void
  toggleColor: (v: string) => void
  toggleLength: (v: number) => void
  toggleOrigin: (v: string) => void
  togglePotSize: (v: string) => void
  toggleTag: (v: string) => void
  toggleSeason: (v: string) => void
  reset: () => void
  loadFacets: () => Promise<void>
}

const tog = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

export const useFilters = create<FilterStore>()((set, get) => ({
  category: 'cut',
  subcat: '',
  varietyType: '',
  onlyAvailable: true,
  onlyDiscount: false,
  stockLevel: '',
  search: '',
  colors: [],
  lengths: [],
  origins: [],
  potSizes: [],
  tags: [],
  seasons: [],
  facets: null,

  setCategory: (category) => set({
    category, subcat: '', varietyType: '',
    colors: [], lengths: [], origins: [], potSizes: [], tags: [],
    seasons: [],
  }),
  setSubcat:        (subcat) => set({ subcat, varietyType: '' }),
  setVarietyType:   (varietyType) => set({ varietyType }),
  setOnlyAvailable: (onlyAvailable) => set({ onlyAvailable }),
  setOnlyDiscount:  (onlyDiscount) => set({ onlyDiscount }),
  setStockLevel:    (stockLevel) => set({ stockLevel }),
  setSearch:        (search) => set({ search }),
  toggleColor:      (v) => set(s => ({ colors:      tog(s.colors,      v) })),
  toggleLength:     (v) => set(s => ({ lengths:     s.lengths.includes(v) ? s.lengths.filter(l => l !== v) : [...s.lengths, v] })),
  toggleOrigin:     (v) => set(s => ({ origins:     tog(s.origins,     v) })),
  togglePotSize:    (v) => set(s => ({ potSizes:    tog(s.potSizes,    v) })),
  toggleTag:    (v) => set(s => ({ tags:    tog(s.tags,    v) })),
  toggleSeason: (v) => set(s => ({ seasons: tog(s.seasons, v) })),
  reset: () => set({
    category: 'cut', subcat: '', varietyType: '',
    onlyAvailable: true, onlyDiscount: false, stockLevel: '',
    search: '', colors: [], lengths: [], origins: [], potSizes: [], tags: [],
    seasons: [], facets: null,
  }),
  loadFacets: async () => {
    const { category, subcat, varietyType, onlyAvailable } = get()
    const res = await fetch('/api/facets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, subcat, varietyType, onlyAvailable }),
    })
    if (res.ok) {
      const facets: Facets = await res.json()
      set({ facets })
    }
  },
}))
