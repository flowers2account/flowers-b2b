import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { umnicoClient } from '@/lib/umnico/client'
import { authPinToClient } from '@/lib/umnico/templates'

export const dynamic = 'force-dynamic'

// In-memory rate limit (resets on cold start — sufficient for spam protection)
const rateLimitStore = new Map<string, { attempts: number; windowStart: number }>()
const MAX_ATTEMPTS = 10
const WINDOW_MS = 5 * 60 * 1000 // 5 минут (короче окно — быстрее восстановление после лимита)

function checkRateLimit(phone: string): { allowed: boolean; minutesLeft?: number } {
  const now = Date.now()
  const record = rateLimitStore.get(phone)

  if (!record || now - record.windowStart > WINDOW_MS) {
    rateLimitStore.set(phone, { attempts: 1, windowStart: now })
    return { allowed: true }
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    const minutesLeft = Math.ceil((WINDOW_MS - (now - record.windowStart)) / 60_000)
    return { allowed: false, minutesLeft }
  }

  record.attempts++
  return { allowed: true }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { phone: rawPhone } = body

  if (!rawPhone) {
    return NextResponse.json({ success: false, error: 'Телефон не указан' }, { status: 400 })
  }

  const normalized = normalizePhone(rawPhone)       // +77XXXXXXXXXX
  const withoutPlus = normalized.replace('+', '')   // 77XXXXXXXXXX

  const rateLimit = checkRateLimit(withoutPlus)
  if (!rateLimit.allowed) {
    return NextResponse.json({
      success: false,
      error: `Слишком много запросов. Попробуйте через ${rateLimit.minutesLeft} мин.`,
    }, { status: 429 })
  }

  const admin = createAdminClient()

  const { data: client } = await admin
    .from('clients')
    .select('name, pin')
    .or(`phone.eq.${normalized},phone.eq.${withoutPlus}`)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ success: false, error: 'Номер не найден' }, { status: 404 })
  }

  if (!client.pin) {
    return NextResponse.json({ success: false, error: 'PIN-код не установлен. Обратитесь к администратору.' }, { status: 400 })
  }

  const hasWhatsApp = await umnicoClient.checkContact(withoutPlus)
  if (!hasWhatsApp) {
    return NextResponse.json({ success: false, error: 'WhatsApp не найден на этом номере' }, { status: 400 })
  }

  const sent = await umnicoClient.sendMessage(withoutPlus, authPinToClient(client.name || '', client.pin))
  if (!sent) {
    return NextResponse.json({ success: false, error: 'Ошибка отправки сообщения' }, { status: 500 })
  }

  console.log('PIN sent via WhatsApp to', withoutPlus.replace(/\d{6}$/, '******'))
  return NextResponse.json({ success: true })
}
