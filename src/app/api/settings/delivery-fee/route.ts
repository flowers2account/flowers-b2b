import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCityDeliveryFee, DEFAULT_CITY_DELIVERY_FEE } from '@/lib/delivery'

export const dynamic = 'force-dynamic'

// Публичный read-only: стоимость доставки по городу для отображения в чекауте.
// Авторитетный расчёт суммы — всё равно на сервере в /api/checkout.
export async function GET() {
  try {
    const supabase = createAdminClient()
    const fee = await getCityDeliveryFee(supabase)
    return NextResponse.json({ fee })
  } catch {
    return NextResponse.json({ fee: DEFAULT_CITY_DELIVERY_FEE })
  }
}
