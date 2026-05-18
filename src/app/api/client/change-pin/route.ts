import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { currentPin, newPin } = await req.json().catch(() => ({}))

  if (!currentPin || !newPin) {
    return NextResponse.json({ success: false, error: 'Не все поля заполнены' }, { status: 400 })
  }

  if (!/^\d{4,6}$/.test(newPin)) {
    return NextResponse.json({ success: false, error: 'PIN должен содержать от 4 до 6 цифр' }, { status: 400 })
  }

  if (currentPin === newPin) {
    return NextResponse.json({ success: false, error: 'Новый PIN совпадает с текущим' }, { status: 400 })
  }

  // Get current session user
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  }

  if (!user.email?.endsWith('@flowers.local')) {
    return NextResponse.json({ success: false, error: 'Смена PIN доступна только клиентам' }, { status: 403 })
  }

  // Derive phone from email: '77001234567@flowers.local' → '77001234567'
  const phoneDigits = user.email.replace('@flowers.local', '')

  // Find client record (handle both +77... and 77... formats in DB)
  const admin = createAdminClient()
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, pin')
    .or(`phone.eq.+${phoneDigits},phone.eq.${phoneDigits}`)
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

  // Sync auth.users password
  const { error: authError } = await admin.auth.admin.updateUserById(user.id, { password: newPin })
  if (authError) {
    console.error('[change-pin] updateUserById:', authError.message)
    // clients.pin is already updated — log but don't fail the request
  }

  return NextResponse.json({ success: true })
}
