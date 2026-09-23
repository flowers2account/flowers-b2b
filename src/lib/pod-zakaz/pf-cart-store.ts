import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Корзина раздела «Под заказ» ПОЛНОСТЬЮ изолирована от src/lib/cart-store.ts (реальная
// корзина → order_items.product_id, FK на products(id)). pf_offer_id — id предложения
// Proflowers на конкретный торговый день, это не products.id: смешивать со реальным чекаутом
// нельзя (либо коллизия id, либо ошибка внешнего ключа). Свой localStorage-ключ, свой стор.
//
// qty хранится в «ступенях», не в штуках: 1 ступень = 1 короб (is_box_only) либо multiplicity
// шт (обычный товар) — см. src/lib/pod-zakaz/format.ts. Компонент карточки сам знает текущие
// count_left/multiplicity/box_multiplicity из свежих данных каталога и передаёт готовый next-qty
// с уже применённым clamp (та же модель, что у настоящего useCart.update).

export type PfCartItem = {
  pfOfferId: number
  name: string
  imageUrl: string | null
  colorName: string | null
  isBoxOnly: boolean
  stepLabel: string     // «1 короб = 192 шт» / «упаковка 5 шт» / «шт» — снимок на момент добавления
  stepPrice: number     // цена за одну ступень (короб или кратность), уже с наценкой
  qty: number           // количество ступеней
}

type PfCartStore = {
  items: PfCartItem[]
  setQty: (item: Omit<PfCartItem, 'qty'>, qty: number) => void
  remove: (pfOfferId: number) => void
  clear: () => void
  total: () => number
}

export const usePfCart = create<PfCartStore>()(
  persist(
    (set, get) => ({
      items: [],
      setQty: (item, qty) => set(state => {
        if (qty <= 0) return { items: state.items.filter(i => i.pfOfferId !== item.pfOfferId) }
        const exists = state.items.some(i => i.pfOfferId === item.pfOfferId)
        return {
          items: exists
            ? state.items.map(i => i.pfOfferId === item.pfOfferId ? { ...item, qty } : i)
            : [...state.items, { ...item, qty }],
        }
      }),
      remove: (pfOfferId) => set(state => ({
        items: state.items.filter(i => i.pfOfferId !== pfOfferId),
      })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((sum, i) => sum + i.stepPrice * i.qty, 0),
    }),
    { name: 'pf-cart', version: 1 },
  ),
)
