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
}

type CartStore = {
  items: CartItem[]
  add: (item: Omit<CartItem, 'qty'>) => void
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
