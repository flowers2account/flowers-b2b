import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { getAuthedUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { name, company_name } = await req.json().catch(() => ({}))

  // Менять можно только свой профиль — владелец берётся из токена, не из тела
  const authed = await getAuthedUser(req)
  if (!authed?.phone) return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  if (!name?.trim()) return NextResponse.json({ success: false, error: 'Укажите имя' }, { status: 400 })

  const normalized = normalizePhone(authed.phone)
  const admin = createAdminClient()

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id')
    .or(`phone.eq.${normalized},phone.eq.${normalized.replace('+', '')}`)
    .maybeSingle()

  if (clientError || !client) {
    return NextResponse.json({ success: false, error: 'Клиент не найден' }, { status: 404 })
  }

  // Update clients.name and clients.company_name
  const { error: updateError } = await admin
    .from('clients')
    .update({
      name: name.trim(),
      company_name: company_name?.trim() || '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', client.id)

  if (updateError) {
    console.error('[update-profile] clients update:', updateError.message)
    return NextResponse.json({ success: false, error: 'Ошибка сохранения' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
