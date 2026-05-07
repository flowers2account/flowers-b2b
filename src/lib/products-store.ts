import { create } from 'zustand'
import { type Product } from '@/components/catalog/ProductCard'

type ProductsStore = {
  products: Product[]
  setProducts: (products: Product[]) => void
}

export const useProductsStore = create<ProductsStore>((set) => ({
  products: [],
  setProducts: (products) => set({ products }),
}))
