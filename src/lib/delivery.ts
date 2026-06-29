import type { SupabaseClient } from '@supabase/supabase-js'

// Стоимость доставки по городу — единый источник: app_settings.city_delivery_fee.
// Используется и сервером (/api/checkout — авторитетный расчёт), и витриной
// (/api/settings/delivery-fee — для отображения).

export const DEFAULT_CITY_DELIVERY_FEE = 2000
// Город, для которого доставка фиксированная. Прочие (Актобе/Атырау) — межгород «по согласованию».
export const DELIVERY_CITY = 'Уральск'

/**
 * Читает стоимость доставки по городу из app_settings.city_delivery_fee.
 * Ключа нет → создаёт его со значением по умолчанию (2000) и возвращает его.
 */
export async function getCityDeliveryFee(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'city_delivery_fee')
    .maybeSingle()

  if (data?.value != null && data.value !== '') {
    const n = Number(data.value)
    if (Number.isFinite(n) && n >= 0) return n
  }

  // Ключа нет (или битое значение) — создаём дефолт, best-effort.
  await supabase
    .from('app_settings')
    .upsert(
      { key: 'city_delivery_fee', value: String(DEFAULT_CITY_DELIVERY_FEE), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  return DEFAULT_CITY_DELIVERY_FEE
}

/**
 * Стоимость доставки для заказа (₸):
 *  - самовывоз / способ не указан → 0
 *  - доставка по городу (Уральск)  → fee
 *  - межгород (Актобе/Атырау)      → null = «по согласованию» (менеджер проставит позже)
 */
export function computeDeliveryCost(
  method: string | null | undefined,
  city: string | null | undefined,
  fee: number,
): number | null {
  if (method !== 'delivery') return 0
  if ((city ?? '').trim() === DELIVERY_CITY) return fee
  return null
}
