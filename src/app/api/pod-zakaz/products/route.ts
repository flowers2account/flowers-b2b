import { NextResponse } from 'next/server'
import { fetchAllPfCatalog } from '@/lib/pod-zakaz/fetch-catalog'

export const dynamic = 'force-dynamic'

// Витрина «Под заказ» публична (как остальной каталог, кроме среза) — без авторизации.
// pf_catalog закрыта от anon/authenticated (см. миграции pf_*), поэтому читаем service-role
// внутри fetchAllPfCatalog (с пагинацией — PostgREST режет на 1000 строк вне зависимости
// от .limit()); сама вьюха уже не отдаёт закупочные цены, наружу утечь нечему.
export async function GET() {
  const products = await fetchAllPfCatalog()
  return NextResponse.json(products)
}
