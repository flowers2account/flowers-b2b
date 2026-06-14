import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CartItem = {
  id: number
  name: string
  price: number
  qty: number
  available: number
  category: string
  image_url?: string | null
  unit?: string | null
  subcategory?: string | null
  // Снимок выбранного цвета (Вариант А — цвет как ярлык, не SKU).
  // Остаток/резерв общие на товар; цвет едет в order_items.color, в уведомление и Excel.
  // null — у товара нет цветовых вариаций (ведёт себя как раньше).
  color?: string | null
}

// Составной ключ позиции: один товар разных цветов = разные строки корзины.
const sameLine = (i: CartItem, id: number, color: string | null) =>
  i.id === id && (i.color ?? null) === (color ?? null)

type CartStore = {
  items: CartItem[]
  add: (item: Omit<CartItem, 'qty'>) => void
  remove: (id: number, color?: string | null) => void
  update: (id: number, qty: number, color?: string | null) => void
  clear: () => void
  total: () => number
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => set(state => {
        const color = item.color ?? null
        const existing = state.items.find(i => sameLine(i, item.id, color))
        if (existing) {
          return { items: state.items.map(i => sameLine(i, item.id, color) ? { ...i, qty: Math.min(i.qty + 1, item.available) } : i) }
        }
        return { items: [...state.items, { ...item, color, qty: 1 }] }
      }),
      remove: (id, color = null) => set(state => ({
        items: state.items.filter(i => !sameLine(i, id, color)),
      })),
      update: (id, qty, color = null) => set(state => ({
        items: qty <= 0
          ? state.items.filter(i => !sameLine(i, id, color))
          : state.items.map(i => sameLine(i, id, color) ? { ...i, qty } : i),
      })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
    }),
    {
      name: 'cart',
      version: 1,
      // Миграция старого localStorage: позиции без color (и с устаревшим colorQtys
      // из прежней модели «Б») приводим к color = null, чтобы persist не падал.
      migrate: (persisted: unknown) => {
        const state = persisted as { items?: any[] } | null
        if (state?.items) {
          state.items = state.items.map((i: any) => {
            const { colorQtys: _drop, ...rest } = i
            return { ...rest, color: rest.color ?? null }
          })
        }
        return state as CartStore
      },
    }
  )
)
