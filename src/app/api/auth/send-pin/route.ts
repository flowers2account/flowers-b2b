import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

const WA_NUMBER = '77476108458'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { phone } = body
  if (!phone) return NextResponse.json({ error: 'Нет телефона' }, { status: 400 })

  const normalized = normalizePhone(phone)  // '+77XXXXXXXXXX'
  const withoutPlus = normalized.replace('+', '')  // '77XXXXXXXXXX'
  const email = `${withoutPlus}@flowers.local`

  const admin = createAdminClient()

  // 1. Find client — try both +77... and 77... formats
  const { data: client } = await admin
    .from('clients')
    .select('id, name, company_name, pin, auth_user_id')
    .or(`phone.eq.${normalized},phone.eq.${withoutPlus}`)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ exists: false })
  }

  if (!client.pin) {
    return NextResponse.json(
      { exists: false, error: 'PIN-код не установлен. Обратитесь к администратору.' },
      { status: 400 }
    )
  }

  // 2. Sync client.pin → auth.users password
  if (client.auth_user_id) {
    // Direct path: auth_user_id already known
    await admin.auth.admin.updateUserById(client.auth_user_id, { password: client.pin })
  } else {
    // Find auth user via profiles.email
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (profile?.id) {
      await admin.auth.admin.updateUserById(profile.id, { password: client.pin })
      // Backfill auth_user_id in clients
      await admin.from('clients').update({ auth_user_id: profile.id }).eq('id', client.id)
    } else {
      // Create auth user for this client
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password: client.pin,
        email_confirm: true,
        user_metadata: { phone: normalized },
      })

      if (createError || !newUser?.user) {
        console.error('[send-pin] createUser:', createError?.message)
        return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
      }

      const uid = newUser.user.id
      await Promise.all([
        admin.from('profiles').insert({
          id: uid,
          email,
          role: 'client',
          full_name: client.name || '',
          phone: normalized,
          company_name: client.company_name || '',
        }),
        admin.from('clients').update({ auth_user_id: uid }).eq('id', client.id),
      ])
    }
  }

  // 3. Build WhatsApp link — client sees PIN inside the pre-filled message
  const text = encodeURIComponent(
    `Ваш PIN: ${client.pin}\nДля входа в каталог цветов.`
  )
  return NextResponse.json({
    exists: true,
    name: client.name || client.company_name || '',
    whatsappUrl: `https://wa.me/${WA_NUMBER}?text=${text}`,
  })
}
