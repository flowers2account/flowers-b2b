import { create } from 'zustand'

type FilterStore = {
  category: 'all' | 'cut' | 'pot'
  onlyAvailable: boolean
  onlyDiscount: boolean
  search: string
  setCategory: (v: 'all' | 'cut' | 'pot') => void
  setOnlyAvailable: (v: boolean) => void
  setOnlyDiscount: (v: boolean) => void
  setSearch: (v: string) => void
}

export const useFilters = create<FilterStore>((set) => ({
  category: 'all',
  onlyAvailable: false,
  onlyDiscount: false,
  search: '',
  setCategory: (category) => set({ category }),
  setOnlyAvailable: (onlyAvailable) => set({ onlyAvailable }),
  setOnlyDiscount: (onlyDiscount) => set({ onlyDiscount }),
  setSearch: (search) => set({ search }),
}))
