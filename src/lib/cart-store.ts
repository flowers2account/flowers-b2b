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
  // Ассорти по цветам (аксессуары): слаг цвета → количество. qty = сумма значений.
  // Цена/остаток общие на товар (не SKU) — цвет едет как комментарий в заказ.
  colorQtys?: Record<string, number> | null
}

type CartStore = {
  items: CartItem[]
  add: (item: Omit<CartItem, 'qty'>) => void
  // Поставить позицию-ассорти с разбивкой по цветам (replace, не инкремент).
  setColored: (item: Omit<CartItem, 'qty' | 'colorQtys'>, colorQtys: Record<string, number>) => void
  remove: (id: number) => void
  update: (id: number, qty: number) => void
  clear: () => void
  total: () => number
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => set(state => {
        const existing = state.items.find(i => i.id === item.id)
        if (existing) {
          return { items: state.items.map(i => i.id === item.id ? { ...i, qty: Math.min(i.qty + 1, item.available) } : i) }
        }
        return { items: [...state.items, { ...item, qty: 1 }] }
      }),
      setColored: (item, colorQtys) => set(state => {
        const clean = Object.fromEntries(
          Object.entries(colorQtys).filter(([, n]) => n > 0)
        )
        const sum = Object.values(clean).reduce((s, n) => s + n, 0)
        // пусто → убрать позицию
        if (sum <= 0) return { items: state.items.filter(i => i.id !== item.id) }
        const qty = Math.min(sum, item.available)
        const line: CartItem = { ...item, qty, colorQtys: clean }
        const exists = state.items.some(i => i.id === item.id)
        return {
          items: exists
            ? state.items.map(i => i.id === item.id ? line : i)
            : [...state.items, line],
        }
      }),
      remove: (id) => set(state => ({ items: state.items.filter(i => i.id !== id) })),
      update: (id, qty) => set(state => ({
        items: qty <= 0
          ? state.items.filter(i => i.id !== id)
          : state.items.map(i => i.id === id ? { ...i, qty } : i)
      })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
    }),
    { name: 'cart' }
  )
)
