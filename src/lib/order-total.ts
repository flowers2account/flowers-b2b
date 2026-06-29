// Единый расчёт итога заказа — общий источник для /api/checkout и правки состава
// в пульте оператора (/api/admin/console/items). Правило взято дословно из чекаута:
// скидка 1% действует для Уральска — самовывоз ИЛИ доставка по городу (ключ — способ
// получения + город, НЕ город клиента). Доставка считается отдельно и приходит готовой.

export type OrderTotalItem = { qty: number | string; price: number | string }

export function computeOrderTotal(params: {
  items: OrderTotalItem[]
  fulfillmentType?: string | null
  deliveryCity?: string | null
  deliveryCost?: number | null
}): { rawTotal: number; discountPct: number; discount: number; goodsTotal: number; deliveryCost: number; total: number } {
  const { items, fulfillmentType, deliveryCity, deliveryCost } = params

  const rawTotal = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.price), 0)

  const isUralsk = fulfillmentType === 'pickup'
    || (fulfillmentType === 'delivery' && deliveryCity === 'Уральск')
  const discountPct = isUralsk ? 1 : 0
  const goodsTotal = Math.round(rawTotal * (1 - discountPct / 100))

  const delivery = deliveryCost ?? 0
  const total = goodsTotal + delivery

  return { rawTotal, discountPct, discount: rawTotal - goodsTotal, goodsTotal, deliveryCost: delivery, total }
}
