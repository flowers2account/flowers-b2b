import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/api-auth'
import { normalizePhone } from '@/lib/phone'
import { unitForProduct } from '@/lib/category-tree'
import { generateSpecPdf, type SpecLine } from '@/lib/invoice/generate-spec-pdf'

export const dynamic = 'force-dynamic'

// Предварительная спецификация корзины (PDF). Цены/наименования берём из БД по id —
// клиентские значения не доверяем; кол-во и цвет — из тела (это корзина пользователя).
type InItem = { id: number; qty: number; color?: string | null }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { items?: InItem[] } | null
  const raw = Array.isArray(body?.items) ? body!.items : []
  if (!raw.length) return NextResponse.json({ error: 'Пустая корзина' }, { status: 400 })
  if (raw.length > 300) return NextResponse.json({ error: 'Слишком много позиций' }, { status: 400 })

  const ids = [...new Set(raw.map((i) => Number(i?.id)).filter((n) => Number.isInteger(n) && n > 0))]
  if (!ids.length) return NextResponse.json({ error: 'Нет корректных позиций' }, { status: 400 })

  const sb = createAdminClient()
  const { data: products } = await sb
    .from('products')
    .select('id, name, display_name, price, unit, subcategory')
    .in('id', ids)

  const pmap = new Map((products ?? []).map((p) => [p.id, p]))

  // Строки строим из ИСХОДНОГО массива (сохраняет порядок и повторы с разным цветом),
  // но имя/цену/ед. подставляем из БД.
  const lines: SpecLine[] = []
  for (const it of raw) {
    const id = Number(it?.id)
    const qty = Math.floor(Number(it?.qty))
    const p = pmap.get(id)
    if (!p || !Number.isFinite(qty) || qty <= 0) continue
    lines.push({
      name: (p.display_name || p.name || '').trim() || `Товар #${id}`,
      qty,
      price: Number(p.price) || 0,
      unit: unitForProduct(p),
      color: typeof it?.color === 'string' && it.color.trim() ? it.color.trim().slice(0, 40) : null,
    })
  }
  if (!lines.length) return NextResponse.json({ error: 'Позиции не найдены' }, { status: 404 })

  // Покупатель — только если авторизован (иначе блок не печатается)
  let buyer: { name?: string | null; companyName?: string | null; bin?: string | null } | null = null
  const authed = await getAuthedUser(req)
  if (authed?.phone) {
    const { data: client } = await sb
      .from('clients')
      .select('name, company_name, bin')
      .eq('phone', normalizePhone(authed.phone))
      .maybeSingle()
    if (client) buyer = { name: client.name, companyName: client.company_name, bin: client.bin }
  }

  const pdf = await generateSpecPdf({ date: new Date(), buyer, lines })
  const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Oral' }) // YYYY-MM-DD
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="specifikaciya-${stamp}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
