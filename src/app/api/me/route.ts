import { NextRequest, NextResponse } from 'next/server'
import { findClientByPhone } from '@/lib/bot/conversation-store'

export const dynamic = 'force-dynamic'

// Имя клиента по телефону — для приветствия по имени в виджете (в useAuthStore имени
// нет). Версия B Такт 1. Отдаёт { name } или { name: null } (гость/не найден).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  if (!phone) return NextResponse.json({ name: null })

  const client = await findClientByPhone(phone)
  return NextResponse.json({
    name: client?.name ?? null,
    company_name: client?.company_name ?? null,
  })
}
