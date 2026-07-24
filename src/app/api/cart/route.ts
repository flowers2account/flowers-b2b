import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/api-auth'
import { normalizePhone } from '@/lib/phone'
import { getClientCart, replaceClientCart } from '@/lib/server-cart'

export const dynamic = 'force-dynamic'

async function resolveClientId(req: NextRequest) {
  const authed = await getAuthedUser(req)
  if (!authed?.phone) return null

  const sb = createAdminClient()
  const { data, error } = await sb
    .from('clients')
    .select('id')
    .eq('phone', normalizePhone(authed.phone))
    .maybeSingle()
  if (error || !data?.id) return null
  return data.id as string
}

export async function GET(req: NextRequest) {
  const clientId = await resolveClientId(req)
  if (!clientId) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  try {
    const cart = await getClientCart(createAdminClient(), clientId)
    return NextResponse.json(cart)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка корзины' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const clientId = await resolveClientId(req)
  if (!clientId) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const cart = await replaceClientCart(createAdminClient(), clientId, body?.items)
    return NextResponse.json(cart)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сохранения корзины' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const clientId = await resolveClientId(req)
  if (!clientId) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  try {
    const cart = await replaceClientCart(createAdminClient(), clientId, [])
    return NextResponse.json(cart)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка очистки корзины' }, { status: 500 })
  }
}
