import { create } from 'zustand'

export type FilterCategory = 'all' | 'cut' | 'pot' | 'supply'

type FilterStore = {
  category: FilterCategory
  subcat: string
  onlyAvailable: boolean
  onlyDiscount: boolean
  search: string
  colors: string[]
  lengths: number[]
  origins: string[]
  tags: string[]

  setCategory: (v: FilterCategory) => void
  setSubcat: (v: string) => void
  setOnlyAvailable: (v: boolean) => void
  setOnlyDiscount: (v: boolean) => void
  setSearch: (v: string) => void
  toggleColor: (v: string) => void
  toggleLength: (v: number) => void
  toggleOrigin: (v: string) => void
  toggleTag: (v: string) => void
  reset: () => void
}

export const useFilters = create<FilterStore>((set) => ({
  category: 'cut',
  subcat: '',
  onlyAvailable: false,
  onlyDiscount: false,
  search: '',
  colors: [],
  lengths: [],
  origins: [],
  tags: [],

  setCategory: (category) => set({ category, subcat: '' }),
  setSubcat: (subcat) => set({ subcat }),
  setOnlyAvailable: (onlyAvailable) => set({ onlyAvailable }),
  setOnlyDiscount: (onlyDiscount) => set({ onlyDiscount }),
  setSearch: (search) => set({ search }),
  toggleColor: (v) => set(s => ({ colors: s.colors.includes(v) ? s.colors.filter(c => c !== v) : [...s.colors, v] })),
  toggleLength: (v) => set(s => ({ lengths: s.lengths.includes(v) ? s.lengths.filter(l => l !== v) : [...s.lengths, v] })),
  toggleOrigin: (v) => set(s => ({ origins: s.origins.includes(v) ? s.origins.filter(o => o !== v) : [...s.origins, v] })),
  toggleTag: (v) => set(s => ({ tags: s.tags.includes(v) ? s.tags.filter(t => t !== v) : [...s.tags, v] })),
  reset: () => set({
    category: 'cut', subcat: '', onlyAvailable: false, onlyDiscount: false,
    search: '', colors: [], lengths: [], origins: [], tags: [],
  }),
}))
