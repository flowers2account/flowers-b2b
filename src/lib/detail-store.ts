import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { type Product } from '@/components/catalog/ProductCard'

export type PanelState = 'empty' | 'detail' | 'cart'

type DetailStore = {
  panel: PanelState
  product: Product | null
  productId: number | null
  setProduct: (product: Product) => void
  setPanel: (panel: PanelState) => void
  restoreProduct: (product: Product) => void
  flashCart: (product: Product) => void
}

export const useDetailStore = create<DetailStore>()(
  persist(
    (set) => ({
      panel: 'empty',
      product: null,
      productId: null,
      setProduct: (product) => set({ product, productId: product.id, panel: 'detail' }),
      setPanel: (panel) => set({ panel }),
      restoreProduct: (product) => set({ product }),
      flashCart: (product) => {
        set({ product, productId: product.id, panel: 'cart' })
        setTimeout(() => {
          set(state => state.panel === 'cart' ? { panel: 'detail' } : state)
        }, 1500)
      },
    }),
    {
      name: 'catalog-detail',
      storage: createJSONStorage(() => sessionStorage),
      // Don't persist panel/productId — prevents orphaned product on reload
      partialize: () => ({}),
    }
  )
)
