export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const supabase = createAdminClient()
  const { keepIds, categories } = await req.json() as {
    keepIds: number[]
    categories: string[]
  }

  if (!categories.length) return NextResponse.json({ zeroed: 0 })

  const { data: allActive } = await supabase
    .from('products')
    .select('id')
    .eq('is_active', true)
    .in('category', categories)

  const toDeactivate = (allActive ?? [])
    .map((p: { id: number }) => p.id)
    .filter((id: number) => !keepIds.includes(id))

  if (!toDeactivate.length) return NextResponse.json({ zeroed: 0 })

  await supabase
    .from('products')
    .update({ is_active: false, qty: 0 })
    .in('id', toDeactivate)

  return NextResponse.json({ zeroed: toDeactivate.length })
}
