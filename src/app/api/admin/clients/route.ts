export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { phone, name, company_name, pin } = await req.json()

  if (!phone || !pin) {
    return NextResponse.json({ error: 'Телефон и PIN обязательны' }, { status: 400 })
  }

  const normalizedPhone = normalizePhone(String(phone))
  const phoneDigits = normalizedPhone.replace('+', '')

  if (!/^\d{11}$/.test(phoneDigits)) {
    return NextResponse.json({ error: 'Неверный формат телефона' }, { status: 400 })
  }

  if (!/^\d{4}$/.test(String(pin))) {
    return NextResponse.json({ error: 'PIN должен быть 4 цифры' }, { status: 400 })
  }

  const email = `${phoneDigits}@flowers.local`
  const adminClient = createAdminClient()

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: String(pin),
    email_confirm: true,
  })

  if (authError) {
    const isDuplicate = authError.message.includes('already registered') || authError.code === 'email_exists'
    return NextResponse.json(
      { error: isDuplicate ? 'Клиент с таким телефоном уже существует' : authError.message },
      { status: isDuplicate ? 409 : 500 }
    )
  }

  const userId = authData.user.id

  await adminClient.from('profiles').upsert({
    id: userId,
    email,
    role: 'client',
    phone: normalizedPhone,
    company_name: company_name ?? null,
    full_name: name ?? null,
  }, { onConflict: 'id' })

  const { data: client, error: clientError } = await adminClient
    .from('clients')
    .insert({ phone: normalizedPhone, name: name ?? null, company_name: company_name ?? null, pin: String(pin), auth_user_id: userId })
    .select()
    .single()

  if (clientError) {
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: clientError.message }, { status: 500 })
  }

  return NextResponse.json(client)
}

export async function PATCH(req: NextRequest) {
  const { id, name, company_name, pin } = await req.json()

  if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 })

  if (pin && !/^\d{4}$/.test(String(pin))) {
    return NextResponse.json({ error: 'PIN должен быть 4 цифры' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updateData.name = name
  if (company_name !== undefined) updateData.company_name = company_name
  if (pin) updateData.pin = String(pin)

  const { data: client, error } = await adminClient
    .from('clients')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (pin && client.auth_user_id) {
    await adminClient.auth.admin.updateUserById(client.auth_user_id, { password: String(pin) })
  }

  return NextResponse.json(client)
}
