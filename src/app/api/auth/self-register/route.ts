import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { umnicoClient } from '@/lib/umnico/client'
import { authPinToClient } from '@/lib/umnico/templates'
import {
  findContactByPhone, createContact, createLead, addNote, normalizePhoneAmo,
  AMO_PIPELINE_ID, AMO_STATUS_NEW,
} from '@/lib/amo'

export const dynamic = 'force-dynamic'

// Авто-регистрация клиента из виджета. Создаёт аккаунт тем же путём, что админская
// форма (/api/admin/clients POST): auth user → profiles → clients(pin). PIN уходит в
// WhatsApp (как /api/whatsapp/send-pin). Заявка → registration_requests, лид → amoCRM,
// уведомление менеджеру. Один уровень цен → client_id для цен не нужен.

// In-memory rate limit по телефону (сброс на cold start — норм для анти-спама).
const rl = new Map<string, { n: number; t: number }>()
const WINDOW_MS = 10 * 60 * 1000
const MAX = 5
function rateOk(p: string): boolean {
  const now = Date.now()
  const r = rl.get(p)
  if (!r || now - r.t > WINDOW_MS) { rl.set(p, { n: 1, t: now }); return true }
  if (r.n >= MAX) return false
  r.n++
  return true
}

const genPin = () => String(Math.floor(100000 + Math.random() * 900000))
const TYPES = ['ИП', 'ТОО', 'Физлицо']

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const company_name = typeof body?.company_name === 'string' ? body.company_name.trim() : ''
  const client_type = TYPES.includes(body?.client_type) ? body.client_type : null
  const city = typeof body?.city === 'string' ? body.city.trim() : ''
  const rawPhone = typeof body?.phone === 'string' ? body.phone : ''

  if (!name) return NextResponse.json({ ok: false, error: 'Укажите имя' }, { status: 400 })

  const normalized = normalizePhone(rawPhone)         // +7XXXXXXXXXX
  const digits = normalized.replace('+', '')          // 7XXXXXXXXXX
  if (!/^\d{11}$/.test(digits)) {
    return NextResponse.json({ ok: false, error: 'Неверный телефон. Формат +7XXXXXXXXXX' }, { status: 400 })
  }
  if (!rateOk(digits)) {
    return NextResponse.json({ ok: false, error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 })
  }

  const admin = createAdminClient()

  // Дедуп: телефон уже зарегистрирован → не плодим аккаунт.
  const { data: existing } = await admin
    .from('clients').select('id')
    .or(`phone.eq.${normalized},phone.eq.${digits}`)
    .maybeSingle()
  if (existing) return NextResponse.json({ ok: false, alreadyExists: true })

  // Создание аккаунта (как в /api/admin/clients POST).
  const email = `${digits}@flowers.local`
  const pin = genPin()
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email, password: pin, email_confirm: true,
  })
  if (authError) {
    const dup = authError.message.includes('already registered') || (authError as { code?: string }).code === 'email_exists'
    if (dup) return NextResponse.json({ ok: false, alreadyExists: true })
    console.error('[self-register] createUser:', authError.message)
    return NextResponse.json({ ok: false, error: 'Не удалось создать аккаунт' }, { status: 500 })
  }
  const userId = authData.user.id

  await admin.from('profiles').upsert({
    id: userId, email, role: 'client', phone: normalized,
    company_name: company_name || null, full_name: name || null,
  }, { onConflict: 'id' })

  const { error: clientErr } = await admin.from('clients').insert({
    phone: normalized, name, company_name: company_name || null, pin, auth_user_id: userId,
  })
  if (clientErr) {
    await admin.auth.admin.deleteUser(userId)   // откат, чтобы не осталось auth-сироты
    console.error('[self-register] clients.insert:', clientErr.message)
    return NextResponse.json({ ok: false, error: 'Не удалось создать аккаунт' }, { status: 500 })
  }

  // PIN в WhatsApp (как send-pin).
  let delivered = false
  try {
    if (await umnicoClient.checkContact(digits)) {
      delivered = await umnicoClient.sendMessage(digits, authPinToClient(name, pin))
    }
  } catch (e) { console.error('[self-register] pin send:', e instanceof Error ? e.message : e) }

  // amoCRM лид (неблокирующе).
  let amoLeadId: number | null = null
  try {
    let contactId = await findContactByPhone(normalizePhoneAmo(normalized))
    if (!contactId) contactId = await createContact({ name, phone: normalized })
    amoLeadId = await createLead({
      name: `Регистрация: ${name}${company_name ? ` (${company_name})` : ''}`,
      price: 0, contactId, pipelineId: AMO_PIPELINE_ID, statusId: AMO_STATUS_NEW,
      tags: ['регистрация-сайт'],
    })
    const note = [
      'Новый клиент с сайта (виджет)',
      `Имя: ${name}`, `Телефон: ${normalized}`,
      company_name ? `Компания: ${company_name}` : '',
      client_type ? `Тип: ${client_type}` : '',
      city ? `Город: ${city}` : '',
      `PIN ${delivered ? 'отправлен в WhatsApp' : 'НЕ доставлен (нет WhatsApp)'}`,
    ].filter(Boolean).join('\n')
    await addNote(amoLeadId, note)
  } catch (e) { console.error('[self-register] amo:', e instanceof Error ? e.message : e) }

  // Заявка в Supabase (учёт).
  await admin.from('registration_requests').insert({
    name, phone: normalized, company_name: company_name || null,
    client_type, city: city || null, status: 'auto_approved',
    pin_delivered: delivered, amo_lead_id: amoLeadId,
  })

  // Уведомление менеджеру.
  try {
    const mgr = process.env.UMNICO_MANAGER_PHONE
    if (mgr && await umnicoClient.checkContact(mgr)) {
      await umnicoClient.sendMessage(mgr,
        `🆕 Новый клиент (виджет)\n👤 ${name}\n📞 ${normalized}` +
        `${company_name ? `\n🏢 ${company_name}` : ''}${client_type ? `\nТип: ${client_type}` : ''}` +
        `${city ? `\nГород: ${city}` : ''}\nPIN ${delivered ? 'отправлен' : 'НЕ доставлен'}. _Цветы Уральска_`)
    }
  } catch (e) { console.error('[self-register] mgr notify:', e instanceof Error ? e.message : e) }

  return NextResponse.json({ ok: true, delivered, phone: normalized })
}
