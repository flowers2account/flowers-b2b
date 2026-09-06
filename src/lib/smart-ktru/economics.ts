// Экономика лота. Каждая цифра — с источником. Нет данных → null («Нет данных»).
// «Потенциальная маржа» именно потенциальная: если расчёт на исторической цене — это явно помечено.

import type { Economics, EconomicsLine } from './types.ts'

export interface EconomicsInput {
  /** количество из лота */
  quantity: number | null
  quantityUnit?: string | null
  /** сумма лота/закупки, ₸ (потолок = сумма / количество) */
  lotAmount: number | null
  /** себестоимость за единицу из товара, ₸ */
  costPerUnit?: number | null
  /** историческая цена за единицу (медиана контрактов), ₸ */
  historicalUnitPrice?: number | null
  historicalSource?: string
  /** стоимость доставки всей партии, ₸ (из настроек логистики; на первом этапе — оценка) */
  logistics?: number | null
  logisticsSource?: string
  /** налог: доля от выручки (УСН 3% → 0.03) */
  taxRatio?: number | null
  taxLabel?: string
  /** прочие расходы всей партии, ₸ (обеспечение и т.п.) */
  otherCost?: number | null
  otherCostLabel?: string
}

export function computeEconomics(inp: EconomicsInput): Economics {
  const warnings: string[] = []
  const q = inp.quantity && inp.quantity > 0 ? inp.quantity : null
  const ceiling =
    inp.lotAmount != null && q != null ? inp.lotAmount / q : null

  // цена, на которой строим расчёт: историческая (реалистичнее), иначе потолок
  let unitPriceBasis: number | null = null
  let unitPriceBasisSource = ''
  let usesHistoricalPrice = false
  if (inp.historicalUnitPrice != null && inp.historicalUnitPrice > 0) {
    unitPriceBasis = inp.historicalUnitPrice
    unitPriceBasisSource = inp.historicalSource || 'исторические контракты по КТРУ'
    usesHistoricalPrice = true
  } else if (ceiling != null) {
    unitPriceBasis = ceiling
    unitPriceBasisSource = 'потолок цены (сумма лота ÷ количество)'
    warnings.push('Нет исторической цены — расчёт по потолку цены, это оптимистичная оценка')
  } else {
    warnings.push('Недостаточно данных для расчёта цены (нет суммы лота или количества)')
  }

  const lines: EconomicsLine[] = []
  const push = (key: string, label: string, amount: number | null, source: string) =>
    lines.push({ key, label, amount, source })

  push('ceiling', 'Потолок цены за ед.', ceiling != null ? round(ceiling) : null,
    'сумма лота ÷ количество (API Госзакупок)')
  push('historical', 'Историческая цена за ед.',
    inp.historicalUnitPrice != null ? round(inp.historicalUnitPrice) : null,
    inp.historicalSource || 'нет данных по завершённым контрактам')
  push('cost', 'Себестоимость за ед.', inp.costPerUnit ?? null, 'мой товар')

  const revenue = unitPriceBasis != null && q != null ? unitPriceBasis * q : null
  const directCost = inp.costPerUnit != null && q != null ? inp.costPerUnit * q : null
  if (inp.costPerUnit == null) warnings.push('Не указана себестоимость товара — прибыль и маржа не рассчитаны')

  const logistics = inp.logistics ?? null
  const otherCost = inp.otherCost ?? null
  const tax =
    revenue != null && inp.taxRatio != null ? revenue * inp.taxRatio : null

  push('revenue', 'Выручка (ожидаемая)', revenue != null ? round(revenue) : null,
    usesHistoricalPrice ? 'ист. цена × количество' : 'цена × количество')
  push('logistics', 'Логистика',
    logistics, inp.logisticsSource || (logistics == null ? 'не задана в настройках' : 'настройки логистики'))
  push('tax', inp.taxLabel || 'Налог', tax != null ? round(tax) : null,
    inp.taxRatio != null ? `${(inp.taxRatio * 100).toFixed(1)}% от выручки` : 'налоговый режим не задан')
  push('other', inp.otherCostLabel || 'Прочие расходы', otherCost,
    otherCost == null ? '—' : 'ручной ввод')

  let profit: number | null = null
  if (revenue != null && directCost != null) {
    profit = revenue - directCost - (logistics ?? 0) - (tax ?? 0) - (otherCost ?? 0)
  }
  const marginRatio = profit != null && revenue != null && revenue > 0 ? profit / revenue : null

  push('profit', 'Прибыль', profit != null ? round(profit) : null,
    'выручка − себестоимость − логистика − налог − прочее')

  return {
    quantity: q,
    quantityUnit: inp.quantityUnit ?? null,
    unitPriceBasis: unitPriceBasis != null ? round(unitPriceBasis) : null,
    unitPriceBasisSource,
    usesHistoricalPrice,
    lines,
    revenue: revenue != null ? round(revenue) : null,
    directCost: directCost != null ? round(directCost) : null,
    logistics,
    otherCost,
    profit: profit != null ? round(profit) : null,
    marginRatio,
    warnings,
  }
}

function round(n: number): number {
  return Math.round(n)
}
