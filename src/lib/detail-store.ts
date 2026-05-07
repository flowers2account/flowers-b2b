import { create } from 'zustand'
import { type Product } from '@/components/catalog/ProductCard'

export type PanelState = 'empty' | 'detail' | 'cart'

type DetailStore = {
  panel: PanelState
  product: Product | null
  setProduct: (product: Product) => void
  setPanel: (panel: PanelState) => void
  flashCart: (product: Product) => void
}

export const useDetailStore = create<DetailStore>((set) => ({
  panel: 'empty',
  product: null,
  setProduct: (product) => set({ product, panel: 'detail' }),
  setPanel: (panel) => set({ panel }),
  flashCart: (product) => {
    set({ product, panel: 'cart' })
    setTimeout(() => {
      set(state => state.panel === 'cart' ? { panel: 'detail' } : state)
    }, 1500)
  },
}))
