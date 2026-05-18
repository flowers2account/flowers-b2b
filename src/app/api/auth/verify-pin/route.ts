import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { phone, pin } = body
  if (!phone || !pin) return NextResponse.json({ error: 'Нет телефона или кода' }, { status: 400 })
  if (!/^\d{6}$/.test(pin)) return NextResponse.json({ error: 'PIN должен содержать ровно 6 цифр' }, { status: 400 })

  const normalized = normalizePhone(phone)
  const email = `${normalized.replace('+', '')}@flowers.local`

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pin })

  if (error || !data?.user) {
    return NextResponse.json({ success: false, error: 'Неверный PIN-код' }, { status: 401 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, phone, company_name')
    .eq('phone', normalized)
    .maybeSingle()

  return NextResponse.json({ success: true, client })
}
