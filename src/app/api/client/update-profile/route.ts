import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { name, company_name } = await req.json().catch(() => ({}))

  if (!name?.trim()) {
    return NextResponse.json({ success: false, error: 'Укажите имя' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  }

  if (!user.email?.endsWith('@flowers.local')) {
    return NextResponse.json({ success: false, error: 'Доступно только для клиентов' }, { status: 403 })
  }

  const phoneDigits = user.email.replace('@flowers.local', '')
  const admin = createAdminClient()

  // Find client (both formats)
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id')
    .or(`phone.eq.+${phoneDigits},phone.eq.${phoneDigits}`)
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

  // Sync full_name to profiles (admin bypasses RLS)
  await admin
    .from('profiles')
    .update({ full_name: name.trim() })
    .eq('id', user.id)

  return NextResponse.json({ success: true })
}
