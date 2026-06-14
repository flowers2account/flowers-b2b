import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { expandSearchQuery, normalizeQuery } from '@/lib/search-synonyms'
import { labelForSubcat } from '@/lib/category-tree'

export const dynamic = 'force-dynamic'

// Серверный поиск каталога. Вызывает RPC search_products (ранжирование по релевантности
// + similarity-фолбэк для опечаток), расширяет запрос синонимами, склеивает результаты
// нескольких термов и собирает секцию «Категории» (совпавшие подкатегории с counts).
//
// GET /api/search?q=...&category=...&subcategory=...
//   → { products: SearchProduct[], categories: { slug, label, count }[], degraded? }

interface Row {
  id: number
  name: string
  display_name: string | null
  subcategory: string | null
  category: string | null
  price: number
  qty: number
  image_url: string | null
  rank: number
  sim: number
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const q = normalizeQuery(sp.get('q') ?? '')
  const category = sp.get('category')?.trim() || null
  const subcategory = sp.get('subcategory')?.trim() || null

  // Запрос от 2 символов — короче не ищем (чтобы не вернуть полкаталога).
  if (q.length < 2) return NextResponse.json({ products: [], categories: [] })

  const supabase = await createClient()
  const terms = expandSearchQuery(q) // [q, ...каноничные термины из синонимов]

  // Один RPC на терм (термов ≤ ~3), мерж по id с лучшим рангом.
  const byId = new Map<number, Row>()
  for (const term of terms) {
    const { data, error } = await supabase.rpc('search_products', {
      q: term,
      p_category: category,
      p_subcategory: subcategory,
    })
    if (error) {
      // RPC ещё не применён в БД (миграция вручную) или иная ошибка → деградация:
      // фронт переключится на клиентский матч по уже загруженному каталогу.
      console.error('[api/search] rpc search_products failed:', error.message)
      return NextResponse.json({ products: [], categories: [], degraded: true })
    }
    for (const r of (data ?? []) as Row[]) {
      const prev = byId.get(r.id)
      if (!prev || r.rank > prev.rank || (r.rank === prev.rank && r.sim > prev.sim)) {
        byId.set(r.id, r)
      }
    }
  }

  const products = [...byId.values()]
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        b.sim - a.sim ||
        (b.qty > 0 ? 1 : 0) - (a.qty > 0 ? 1 : 0) ||
        a.price - b.price,
    )
    .slice(0, 50)

  // Секция «Категории» — совпавшие подкатегории с counts (из найденных товаров).
  const counts = new Map<string, number>()
  for (const p of products) {
    const slug = p.subcategory || ''
    if (!slug) continue
    counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  const categories = [...counts.entries()]
    .map(([slug, count]) => ({ slug, label: labelForSubcat(slug), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  return NextResponse.json({ products, categories })
}
