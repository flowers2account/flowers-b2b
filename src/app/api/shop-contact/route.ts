import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Контакт магазина для шапки. Номер берётся из app_settings (ключ shop_whatsapp_phone),
// чтобы менять без правки кода. anon не имеет доступа к app_settings — поэтому читаем
// через admin-клиент и отдаём наружу только публичный контакт.
export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'shop_whatsapp_phone')
    .single()

  const phone = (data?.value ?? '').trim()
  if (!phone) {
    return NextResponse.json({ phone: null, digits: null, waLink: null, telLink: null })
  }

  const digits = phone.replace(/\D/g, '') // для wa.me — только цифры
  return NextResponse.json({
    phone,                                  // отображаемый номер (+77476108458)
    digits,                                 // 77476108458
    waLink: `https://wa.me/${digits}`,
    telLink: `tel:+${digits}`,
  })
}
