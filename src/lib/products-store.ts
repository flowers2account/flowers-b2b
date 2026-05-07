import { create } from 'zustand'
import { type Product } from '@/components/catalog/ProductCard'

type ProductsStore = {
  products: Product[]
  filteredCount: number
  setProducts: (products: Product[]) => void
  setFilteredCount: (n: number) => void
}

export const useProductsStore = create<ProductsStore>((set) => ({
  products: [],
  filteredCount: 0,
  setProducts: (products) => set({ products }),
  setFilteredCount: (filteredCount) => set({ filteredCount }),
}))
