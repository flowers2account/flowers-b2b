import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

// Заявка на доступ к магазину (форма на /about). Пишет в access_requests + уведомляет менеджера.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const rawName = String(body?.name ?? '').trim()
  const rawPhone = String(body?.phone ?? '').trim()

  if (rawName.length < 2 || rawName.length > 100) {
    return NextResponse.json({ error: 'Укажите имя' }, { status: 400 })
  }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch {
    return NextResponse.json({ error: 'Укажите корректный номер телефона' }, { status: 400 })
  }
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 11 || digits.length > 15) {
    return NextResponse.json({ error: 'Укажите корректный номер телефона' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Анти-спам: не чаще 1 заявки с номера в 5 минут
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recent } = await admin
    .from('access_requests')
    .select('id')
    .eq('phone', phone)
    .gte('created_at', since)
    .limit(1)
  if (recent && recent.length > 0) {
    return NextResponse.json(
      { error: 'Заявка уже отправлена. Мы скоро свяжемся с вами.' },
      { status: 429 },
    )
  }

  const { error: insErr } = await admin
    .from('access_requests')
    .insert({ name: rawName, phone, status: 'new' })
  if (insErr) {
    console.error('[access-request] insert:', insErr.message)
    return NextResponse.json({ error: 'Не удалось отправить заявку' }, { status: 500 })
  }

  // Уведомление менеджеру в Telegram (неблокирующе)
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const text = [
      '🆕 Заявка на доступ к магазину',
      `👤 ${rawName}`,
      `📞 ${phone}`,
    ].join('\n')
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }),
    }).catch(e => console.error('[access-request] telegram:', e))
  }

  return NextResponse.json({ success: true })
}
