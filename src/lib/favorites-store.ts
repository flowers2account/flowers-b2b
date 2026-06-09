import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone } from '@/lib/phone'

// Избранное. clientId = clients.id (uuid), резолвится по телефону (как в заказах).
// Гость (clientId=null) → toggle не пишет в БД, а просит авторизацию (needAuth).
// RLS на favorites пока выключен (backlog) — пишем браузерным клиентом с сессией.

type FavState = {
  ids: Set<number>          // product_id (products.id = int)
  clientId: string | null
  loadedKey: string | null  // нормализованный телефон, для которого загружено
  needAuth: boolean
  loadForPhone: (phone: string | null) => Promise<void>
  toggle: (productId: number) => Promise<void>
  setNeedAuth: (v: boolean) => void
}

export const useFavorites = create<FavState>((set, get) => ({
  ids: new Set(),
  clientId: null,
  loadedKey: null,
  needAuth: false,

  setNeedAuth: (v) => set({ needAuth: v }),

  loadForPhone: async (phone) => {
    if (!phone) {
      set({ ids: new Set(), clientId: null, loadedKey: null })
      return
    }
    const norm = normalizePhone(phone)
    if (get().loadedKey === norm && get().clientId) return  // уже загружено для этого телефона

    const sb = createClient()
    const withoutPlus = norm.replace('+', '')
    const { data: client } = await sb
      .from('clients')
      .select('id')
      .or(`phone.eq.${norm},phone.eq.${withoutPlus}`)
      .maybeSingle()

    if (!client) {
      set({ clientId: null, ids: new Set(), loadedKey: norm })
      return
    }
    const { data: rows } = await sb
      .from('favorites')
      .select('product_id')
      .eq('client_id', client.id)
    set({
      clientId: client.id as string,
      ids: new Set((rows ?? []).map((r: { product_id: number }) => r.product_id)),
      loadedKey: norm,
    })
  },

  toggle: async (productId) => {
    const { clientId, ids } = get()
    if (!clientId) { set({ needAuth: true }); return }

    const had = ids.has(productId)
    const next = new Set(ids)
    if (had) next.delete(productId); else next.add(productId)
    set({ ids: next })  // оптимистично

    const sb = createClient()
    const { error } = had
      ? await sb.from('favorites').delete().eq('client_id', clientId).eq('product_id', productId)
      : await sb.from('favorites').upsert(
          { client_id: clientId, product_id: productId },
          { onConflict: 'client_id,product_id' },
        )

    if (error) {
      // откат при ошибке
      const rb = new Set(get().ids)
      if (had) rb.add(productId); else rb.delete(productId)
      set({ ids: rb })
    }
  },
}))
