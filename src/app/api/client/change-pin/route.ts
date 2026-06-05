import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { phone, currentPin, newPin } = await req.json().catch(() => ({}))

  if (!phone) return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  if (!currentPin || !newPin) return NextResponse.json({ success: false, error: 'Не все поля заполнены' }, { status: 400 })
  if (!/^\d{6}$/.test(newPin)) return NextResponse.json({ success: false, error: 'PIN должен содержать ровно 6 цифр' }, { status: 400 })
  if (currentPin === newPin) return NextResponse.json({ success: false, error: 'Новый PIN совпадает с текущим' }, { status: 400 })

  const normalized = normalizePhone(String(phone))
  const admin = createAdminClient()

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, pin')
    .or(`phone.eq.${normalized},phone.eq.${normalized.replace('+', '')}`)
    .maybeSingle()

  if (clientError || !client) {
    return NextResponse.json({ success: false, error: 'Клиент не найден' }, { status: 404 })
  }

  if (client.pin !== currentPin) {
    return NextResponse.json({ success: false, error: 'Неверный текущий PIN-код' }, { status: 400 })
  }

  // Update clients.pin
  const { error: updateError } = await admin
    .from('clients')
    .update({ pin: newPin, updated_at: new Date().toISOString() })
    .eq('id', client.id)

  if (updateError) {
    console.error('[change-pin] update clients:', updateError.message)
    return NextResponse.json({ success: false, error: 'Ошибка обновления PIN' }, { status: 500 })
  }

  // Sync auth.users password — найти userId по email
  const phoneDigits = normalized.replace('+', '')
  const email = `${phoneDigits}@flowers.local`
  const { data: listData } = await admin.auth.admin.listUsers()
  const authUser = listData?.users?.find(u => u.email === email)
  if (authUser) {
    const { error: authError } = await admin.auth.admin.updateUserById(authUser.id, { password: newPin })
    if (authError) console.error('[change-pin] updateUserById:', authError.message)
  }

  return NextResponse.json({ success: true })
}
