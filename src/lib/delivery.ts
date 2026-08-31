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

// Межгород (Актобе/Атырау и т.д.) — авто-наценка 10% от суммы товаров (решение
// владельца 18.08.2026). Раньше было «по согласованию» (менеджер вписывал вручную
// через amoCRM) — этот путь больше не используется для новых заказов.
export const INTERCITY_DELIVERY_PCT = 10

/**
 * Стоимость доставки для заказа (₸):
 *  - самовывоз / способ не указан      → 0
 *  - ПЕРВЫЙ заказ клиента (isFirstOrder) → 0 (доставка бесплатно, любой город; решение
 *    владельца 31.08.2026) — правило повторной наценки касается только повторных заказов
 *  - доставка по городу (Уральск)       → fee (фикс)
 *  - межгород (Актобе/Атырау)           → 10% от суммы товаров (goodsSum)
 */
export function computeDeliveryCost(
  method: string | null | undefined,
  city: string | null | undefined,
  fee: number,
  goodsSum: number,
  isFirstOrder = false,
): number {
  if (method !== 'delivery') return 0
  if (isFirstOrder) return 0
  if ((city ?? '').trim() === DELIVERY_CITY) return fee
  return Math.round(goodsSum * (INTERCITY_DELIVERY_PCT / 100))
}
