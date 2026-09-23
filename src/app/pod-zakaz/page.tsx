import type { Metadata } from 'next'
import PfGrid from '@/components/pod-zakaz/PfGrid'
import { fetchAllPfCatalog } from '@/lib/pod-zakaz/fetch-catalog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Под заказ · Цветы Уральска',
  description: 'Товары поставщика под заказ — придут со следующей поставкой. Обновляется несколько раз в день.',
}

export default async function PodZakazPage() {
  const products = await fetchAllPfCatalog()

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
