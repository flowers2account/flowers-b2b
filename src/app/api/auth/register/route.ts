import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Самостоятельная регистрация отключена — клиенты добавляются администратором.
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Регистрация доступна только через администратора. Свяжитесь с нами.' },
    { status: 403 }
  )
}
