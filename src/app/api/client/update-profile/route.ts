import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { getAuthedUser } from '@/lib/api-auth'
import { syncClientRequisitesToAmo } from '@/lib/amo'

export const dynamic = 'force-dynamic'

// Частичное обновление профиля: ЛК шлёт name+company+bin, форма реквизитов на оплате —
// company+bin (без name). Обновляем только присланные поля. После сохранения — синк
// реквизитов в контакт amoCRM (неблокирующе).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { name, company_name, bin, city } = body

  // Менять можно только свой профиль — владелец берётся из токена, не из тела
  const authed = await getAuthedUser(req)
  if (!authed?.phone) return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })

  const nameProvided = typeof name === 'string'
  const nameClean = nameProvided ? name.trim() : ''
  if (nameProvided && !nameClean) {
    return NextResponse.json({ success: false, error: 'Укажите имя' }, { status: 400 })
  }

  // БИН/ИИН организации — если задан, ровно 12 цифр
  const binProvided = typeof bin === 'string'
  const binClean = binProvided ? bin.trim() : ''
  if (binClean && !/^\d{12}$/.test(binClean)) {
    return NextResponse.json({ success: false, error: 'БИН/ИИН — 12 цифр' }, { status: 400 })
  }

  const normalized = normalizePhone(authed.phone)
  const admin = createAdminClient()

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id')
    .or(`phone.eq.${normalized},phone.eq.${normalized.replace('+', '')}`)
    .maybeSingle()

  if (clientError || !client) {
    return NextResponse.json({ success: false, error: 'Клиент не найден' }, { status: 404 })
  }

  // Обновляем только присланные поля (partial update)
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (nameProvided) update.name = nameClean
  if (typeof company_name === 'string') update.company_name = company_name.trim()
  if (binProvided) update.bin = binClean || null
  if (typeof city === 'string') update.city = city.trim() || null

  const { error: updateError } = await admin.from('clients').update(update).eq('id', client.id)
  if (updateError) {
    console.error('[update-profile] clients update:', updateError.message)
    return NextResponse.json({ success: false, error: 'Ошибка сохранения' }, { status: 500 })
  }

  // Синк реквизитов в карточку контакта amoCRM (неблокирующе — не валим сохранение).
  try {
    await syncClientRequisitesToAmo(client.id)
  } catch (e) {
    console.error('[update-profile] amo sync:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ success: true })
}
