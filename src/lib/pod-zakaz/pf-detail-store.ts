import { create } from 'zustand'

// Изолированное состояние «какой товар открыт в детальной панели» для витрины «Под заказ» —
// не пересекается с src/lib/detail-store.ts основного каталога (тот ключуется по products.id,
// у нас pf_offer_id). Сам товар не храним — резолвится по id из уже загруженного массива
// PfCatalogItem[], который и так есть в PfGrid/PfLayout (без нового запроса).

type PfDetailStore = {
  pfOfferId: number | null
  open: (pfOfferId: number) => void
  close: () => void
}

export const usePfDetail = create<PfDetailStore>()((set) => ({
  pfOfferId: null,
  open: (pfOfferId) => set({ pfOfferId }),
  close: () => set({ pfOfferId: null }),
}))
