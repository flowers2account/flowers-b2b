export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

export async function GET() {
  const admin = createAdminClient()

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, role, display_name, phone')
    .in('role', ['admin', 'manager'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })

  const userMap = Object.fromEntries(users.map(u => [u.id, u]))

  const result = (profiles ?? [])
    .map(p => ({
      id: p.id,
      role: p.role,
      display_name: p.display_name,
      phone: p.phone,
      email: userMap[p.id]?.email ?? null,
      created_at: userMap[p.id]?.created_at ?? null,
    }))
    .sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? '', 'ru'))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { name, phone, pin } = await req.json()

  if (!name || !phone || !pin) {
    return NextResponse.json({ error: 'Имя, телефон и PIN обязательны' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(String(pin))) {
    return NextResponse.json({ error: 'PIN должен быть 6 цифр' }, { status: 400 })
  }

  const admin = createAdminClient()
  const normalizedPhone = normalizePhone(String(phone))
  const phoneDigits = normalizedPhone.replace('+', '')
  const email = `${phoneDigits}@flowers.local`

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: String(pin),
    email_confirm: true,
  })

  if (authError) {
    const isDuplicate = authError.message.includes('already registered') || authError.code === 'email_exists'
    return NextResponse.json(
      { error: isDuplicate ? 'Сотрудник с таким телефоном уже существует' : authError.message },
      { status: isDuplicate ? 409 : 500 }
    )
  }

  const userId = authData.user.id

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    role: 'manager',
    display_name: name,
    phone: normalizedPhone,
  }, { onConflict: 'id' })

  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({
    id: userId,
    role: 'manager',
    display_name: name,
    phone: normalizedPhone,
    email,
    created_at: authData.user.created_at,
  })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 })

  const admin = createAdminClient()

  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single()
  if (!target) return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 })

  if (target.role === 'admin') {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Нельзя удалить единственного администратора' }, { status: 400 })
    }
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const { id, pin } = await req.json()

  if (!id || !pin) return NextResponse.json({ error: 'ID и PIN обязательны' }, { status: 400 })
  if (!/^\d{6}$/.test(String(pin))) {
    return NextResponse.json({ error: 'PIN должен быть 6 цифр' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(id, { password: String(pin) })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
