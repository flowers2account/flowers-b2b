import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import PfGrid from '@/components/pod-zakaz/PfGrid'
import type { PfCatalogItem } from '@/lib/pod-zakaz/types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Под заказ · Цветы Уральска',
  description: 'Товары поставщика под заказ — придут со следующей поставкой. Обновляется несколько раз в день.',
}

// Прямой server-side запрос к pf_catalog через service-role (как /api/pod-zakaz/products) —
// без лишнего self-fetch на этапе первой отрисовки. anon-доступа к pf_catalog нет (см. миграции
// pf_*), поэтому здесь, в отличие от /catalog (использует createClient() + RLS), нужен admin-
// клиент — создаётся внутри функции компонента, не на уровне модуля (правило CI из CLAUDE.md).
async function fetchPfCatalog(): Promise<PfCatalogItem[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pf_catalog')
    .select('*')
    .order('pf_offer_id')
    .limit(3000)
  if (error) {
    console.error('pod-zakaz page:', error)
    return []
  }
  return (data ?? []) as PfCatalogItem[]
}

export default async function PodZakazPage() {
  const products = await fetchPfCatalog()

  return (
    <main style={{ background: '#fafafa', minHeight: '60vh' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 16px 0' }}>
        <h1 style={{ fontFamily: 'var(--font-golos)', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          Под заказ
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 4, maxWidth: 640 }}>
          Товары поставщика — не на нашем складе, приедут со следующей поставкой. Цены и остатки
          обновляются несколько раз в день.
        </p>
      </div>
      <PfGrid products={products} />
    </main>
  )
}
