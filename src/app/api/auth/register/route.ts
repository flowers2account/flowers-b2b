import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

const WA_NUMBER = '77476108458'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { phone, name, company_name } = body
  if (!phone) return NextResponse.json({ error: 'Нет телефона' }, { status: 400 })

  const normalized = normalizePhone(phone)
  const email = `${normalized.replace('+', '')}@flowers.local`

  const admin = createAdminClient()

  // Guard: phone must not already be in clients
  const { data: existing } = await admin
    .from('clients')
    .select('id')
    .eq('phone', normalized)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Клиент с таким номером уже существует' }, { status: 409 })
  }

  // Create client record
  const { data: newClient, error: clientError } = await admin
    .from('clients')
    .insert({ phone: normalized, name: name || '', company_name: company_name || '' })
    .select()
    .single()

  if (clientError || !newClient) {
    return NextResponse.json({ error: clientError?.message || 'Ошибка создания клиента' }, { status: 500 })
  }

  // Create auth user with first PIN
  const pin = Math.floor(1000 + Math.random() * 9000).toString()
  const { data: newUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { phone: normalized },
  })

  if (authError || !newUser?.user) {
    console.error('[register] createUser error:', authError?.message)
    return NextResponse.json({ error: 'Ошибка создания аккаунта' }, { status: 500 })
  }

  // Create profile
  await admin.from('profiles').insert({
    id: newUser.user.id,
    email,
    role: 'client',
    full_name: name || normalized,
    phone: normalized,
    company_name: company_name || '',
  })

  const text = encodeURIComponent(`PIN: ${pin} для входа в каталог цветов. Действителен 30 минут.`)
  return NextResponse.json({
    success: true,
    client: newClient,
    whatsappUrl: `https://wa.me/${WA_NUMBER}?text=${text}`,
    expiresIn: 1800,
  })
}
