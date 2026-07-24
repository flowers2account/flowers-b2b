import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'
import { getClientCart, replaceClientCart } from '@/lib/server-cart'

export const dynamic = 'force-dynamic'

async function assertClient(sb: ReturnType<typeof createAdminClient>, clientId: string) {
  const { data, error } = await sb
    .from('clients')
    .select('id, name, company_name, phone')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const clientId = req.nextUrl.searchParams.get('client_id')?.trim()
  if (!clientId) return NextResponse.json({ error: 'client_id обязателен' }, { status: 400 })

  try {
    const sb = createAdminClient()
    const client = await assertClient(sb, clientId)
    if (!client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })
    const cart = await getClientCart(sb, clientId)
    return NextResponse.json({ client, ...cart })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка корзины' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const clientId = String(body?.client_id || '').trim()
    if (!clientId) return NextResponse.json({ error: 'client_id обязателен' }, { status: 400 })

    const sb = createAdminClient()
    const client = await assertClient(sb, clientId)
    if (!client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })

    const cart = await replaceClientCart(sb, clientId, body?.items)
    return NextResponse.json({ client, ...cart })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сохранения корзины' }, { status: 500 })
  }
}
