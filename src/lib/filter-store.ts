import { create } from 'zustand'

export type FilterCategory = 'all' | 'cut' | 'pot' | 'supply'

type FilterStore = {
  category: FilterCategory
  subcat: string
  varietyType: string
  onlyAvailable: boolean
  onlyDiscount: boolean
  search: string
  colors: string[]
  lengths: number[]
  origins: string[]
  potSizes: string[]
  tags: string[]
  floralRoles: string[]
  durations: string[]
  seasons: string[]

  setCategory: (v: FilterCategory) => void
  setSubcat: (v: string) => void
  setVarietyType: (v: string) => void
  setOnlyAvailable: (v: boolean) => void
  setOnlyDiscount: (v: boolean) => void
  setSearch: (v: string) => void
  toggleColor: (v: string) => void
  toggleLength: (v: number) => void
  toggleOrigin: (v: string) => void
  togglePotSize: (v: string) => void
  toggleTag: (v: string) => void
  toggleFloralRole: (v: string) => void
  toggleDuration: (v: string) => void
  toggleSeason: (v: string) => void
  reset: () => void
}

const tog = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

export const useFilters = create<FilterStore>((set) => ({
  category: 'cut',
  subcat: '',
  varietyType: '',
  onlyAvailable: false,
  onlyDiscount: false,
  search: '',
  colors: [],
  lengths: [],
  origins: [],
  potSizes: [],
  tags: [],
  floralRoles: [],
  durations: [],
  seasons: [],

  setCategory: (category) => set({
    category, subcat: '', varietyType: '',
    colors: [], lengths: [], origins: [], potSizes: [], tags: [],
    floralRoles: [], durations: [], seasons: [],
  }),
  setSubcat:        (subcat) => set({ subcat, varietyType: '' }),
  setVarietyType:   (varietyType) => set({ varietyType }),
  setOnlyAvailable: (onlyAvailable) => set({ onlyAvailable }),
  setOnlyDiscount:  (onlyDiscount) => set({ onlyDiscount }),
  setSearch:        (search) => set({ search }),
  toggleColor:      (v) => set(s => ({ colors:      tog(s.colors,      v) })),
  toggleLength:     (v) => set(s => ({ lengths:     s.lengths.includes(v) ? s.lengths.filter(l => l !== v) : [...s.lengths, v] })),
  toggleOrigin:     (v) => set(s => ({ origins:     tog(s.origins,     v) })),
  togglePotSize:    (v) => set(s => ({ potSizes:    tog(s.potSizes,    v) })),
  toggleTag:        (v) => set(s => ({ tags:        tog(s.tags,        v) })),
  toggleFloralRole: (v) => set(s => ({ floralRoles: tog(s.floralRoles, v) })),
  toggleDuration:   (v) => set(s => ({ durations:   tog(s.durations,   v) })),
  toggleSeason:     (v) => set(s => ({ seasons:     tog(s.seasons,     v) })),
  reset: () => set({
    category: 'cut', subcat: '', varietyType: '', onlyAvailable: false, onlyDiscount: false,
    search: '', colors: [], lengths: [], origins: [], potSizes: [], tags: [],
    floralRoles: [], durations: [], seasons: [],
  }),
}))
