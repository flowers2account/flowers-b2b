import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Нет телефона' }, { status: 400 })

  const supabase = await createClient()

  const normalized = phone.replace(/[^\d+]/g, '')

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, phone, company_name')
    .or(`phone.eq.${normalized},phone.eq.${phone}`)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Телефон не найден. Обратитесь к менеджеру.' }, { status: 404 })

  return NextResponse.json({
    id: data.id,
    name: data.name || data.company_name || 'Клиент',
    phone: data.phone,
  })
}
