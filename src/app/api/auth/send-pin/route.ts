import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

const WA_NUMBER = '77476108458'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { phone } = body
  if (!phone) return NextResponse.json({ error: 'Нет телефона' }, { status: 400 })

  const normalized = normalizePhone(phone)          // '+77001234567'
  const email = `${normalized.replace('+', '')}@flowers.local` // '77001234567@flowers.local'

  const admin = createAdminClient()

  // 1. Check clients table
  const { data: client } = await admin
    .from('clients')
    .select('id, name, company_name')
    .eq('phone', normalized)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ exists: false })
  }

  // 2. Generate 4-digit PIN
  const pin = Math.floor(1000 + Math.random() * 9000).toString()

  // 3. Find existing auth user via profiles.email
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (profile?.id) {
    // Update existing user's password
    await admin.auth.admin.updateUserById(profile.id, { password: pin })
  } else {
    // Create new auth user
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { phone: normalized },
    })

    if (createError || !newUser?.user) {
      console.error('[send-pin] createUser error:', createError?.message)
      return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
    }

    // Create profile
    await admin.from('profiles').insert({
      id: newUser.user.id,
      email,
      role: 'client',
      full_name: client.name || '',
      phone: normalized,
      company_name: client.company_name || '',
    })
  }

  const text = encodeURIComponent(`PIN: ${pin} для входа в каталог цветов. Действителен 30 минут.`)
  return NextResponse.json({
    exists: true,
    name: client.name || client.company_name || 'Клиент',
    whatsappUrl: `https://wa.me/${WA_NUMBER}?text=${text}`,
    expiresIn: 1800,
  })
}
