import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/api-auth'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

// Bearer → phone из токена → clients.id (для избранного и кабинета).
// Закрывает прямой браузерный select из clients (RLS step 2).
export async function GET(req: NextRequest) {
  const authed = await getAuthedUser(req)
  if (!authed?.phone) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, company_name, phone')
    .eq('phone', normalizePhone(authed.phone))
    .maybeSingle()

  if (!client) return NextResponse.json({ clientId: null })
  return NextResponse.json({
    clientId: client.id,
    name: client.name,
    company_name: client.company_name,
    phone: client.phone,
  })
}
