import { createAdminClient } from '@/lib/supabase/admin'
import type { PfCatalogItem } from './types'

// PostgREST режет ответ на max-rows (по умолчанию 1000) НЕЗАВИСИМО от .limit() в клиенте —
// без пагинации первый прогон молча отдавал 1000 из ~2279 строк (обнаружено на живом сервере
// 23.09.2026). Пагинируем .range() до конца, как fetchAllProducts в src/app/catalog/page.tsx.
const PAGE_SIZE = 900

// Только на сервере (Server Component / route handler) — использует service-role, у anon
// доступа к pf_catalog нет. admin-клиент создаётся внутри функции, не на уровне модуля.
export async function fetchAllPfCatalog(): Promise<PfCatalogItem[]> {
  const admin = createAdminClient()
  const all: PfCatalogItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await admin
      .from('pf_catalog')
      .select('*')
      .order('pf_offer_id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('fetchAllPfCatalog:', error)
      break
    }
    if (!data || data.length === 0) break

    all.push(...(data as PfCatalogItem[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}
