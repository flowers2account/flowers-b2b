import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Витрина «Под заказ» публична (как остальной каталог, кроме среза) — без авторизации.
// pf_catalog закрыта от anon/authenticated (см. миграции pf_*), поэтому читаем service-role;
// сама вьюха уже не отдаёт закупочные цены, наружу утечь нечему. admin-клиент — внутри
// обработчика, не на уровне модуля (иначе падает сборка в CI, см. CLAUDE.md).
export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pf_catalog')
    .select('*')
    .order('pf_offer_id')
    .limit(3000)

  if (error) {
    console.error('pod-zakaz/products:', error)
    return NextResponse.json({ error: 'Не удалось загрузить каталог' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
