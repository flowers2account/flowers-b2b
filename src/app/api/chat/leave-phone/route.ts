import { NextRequest, NextResponse } from 'next/server'
import { resolveConversation } from '@/lib/bot/conversation-store'
import { capturePhoneToInquiry } from '@/lib/bot/inquiry-amo'

export const dynamic = 'force-dynamic'

// Версия B Такт 1.5 — захват телефона ЗАСТРЯВШЕГО анонима (бот не смог помочь).
// НЕ регистрация (без PIN): просто связываем контакт+телефон с лидом обращения,
// двигаем этап на «Оставил телефон», уведомляем менеджера. Всё graceful.
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const anonId = typeof body?.anon_id === 'string' ? body.anon_id.trim() : ''
  const digits = rawPhone.replace(/\D/g, '')
  if (!/^[78]\d{10}$/.test(digits)) {
    return NextResponse.json({ ok: false, error: 'Телефон в формате +7XXXXXXXXXX' }, { status: 400 })
  }

  try {
    const conv = await resolveConversation({ anonId: anonId || null, phone: null })
    if (!conv) return NextResponse.json({ ok: true })   // нет таблиц/конфига — мягко

    const ok = await capturePhoneToInquiry(conv.id, rawPhone, name)
    return NextResponse.json({ ok })
  } catch (e) {
    console.error('[api/chat/leave-phone]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
