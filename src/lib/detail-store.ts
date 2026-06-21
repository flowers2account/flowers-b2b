import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { type Product } from '@/components/catalog/ProductCard'

export type PanelState = 'empty' | 'detail' | 'cart'

type DetailStore = {
  panel: PanelState
  product: Product | null
  productId: number | null
  // Цвет, выбранный на карточке грида/строки — предвыбираем его в правой панели.
  colorSlug: string | null
  setProduct: (product: Product, colorSlug?: string | null) => void
  setPanel: (panel: PanelState) => void
  restoreProduct: (product: Product) => void
  flashCart: (product: Product) => void
}

// Таймер авто-скрытия мелькающей корзины — один на всё приложение, чтобы каждое
// добавление продлевало окно показа (10 c) от ПОСЛЕДНЕЙ добавленной позиции, а не стопкой.
let flashTimer: ReturnType<typeof setTimeout> | null = null

export const useDetailStore = create<DetailStore>()(
  persist(
    (set) => ({
      panel: 'empty',
      product: null,
      productId: null,
      colorSlug: null,
      setProduct: (product, colorSlug = null) => set({ product, productId: product.id, panel: 'detail', colorSlug }),
      setPanel: (panel) => set({ panel }),
      restoreProduct: (product) => set({ product }),
      flashCart: (product) => {
        set({ product, productId: product.id, panel: 'cart' })
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = setTimeout(() => {
          flashTimer = null
          set(state => state.panel === 'cart' ? { panel: 'detail' } : state)
        }, 10000)
      },
    }),
    {
      name: 'catalog-detail',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        panel: s.panel,
        productId: s.productId,
      }),
    }
  )
)
