import type { PfCatalogItem } from './types'

// Часовой пояс проекта — Asia/Oral (см. CLAUDE.md, правило 2).
export function formatDeliveryDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU', { timeZone: 'Asia/Oral', day: 'numeric', month: 'long' })
}

const TRADING_DAY_LABEL: Record<string, string> = {
  exchange: 'Биржа',
  preorder: 'Предзаказ',
}

export function tradingDayLabel(type: string): string {
  return TRADING_DAY_LABEL[type] ?? type
}

// Шаг корзины считаем в «ступенях»: для is_box_only ступень = 1 короб (box_multiplicity шт),
// иначе ступень = multiplicity шт. Так «нельзя заказать произвольное число штук у коробочного
// товара» соблюдается на уровне самой единицы измерения количества, а не проверкой постфактум.
export function stepUnits(item: PfCatalogItem): number {
  if (item.is_box_only) return item.box_multiplicity || 1
  return item.multiplicity || 1
}

// Цена за одну ступень (короб или упаковку кратности).
export function stepPrice(item: PfCatalogItem): number {
  if (item.is_box_only) return item.box_client_price ?? 0
  return item.client_price * (item.multiplicity || 1)
}

// Максимум ступеней, которые можно набрать при текущем остатке.
export function maxSteps(item: PfCatalogItem): number {
  const step = stepUnits(item)
  if (step <= 0) return 0
  return Math.floor((item.count_left || 0) / step)
}

export function stepLabel(item: PfCatalogItem): string {
  return item.is_box_only
    ? `1 короб = ${item.box_multiplicity} шт`
    : (item.multiplicity > 1 ? `упаковка ${item.multiplicity} шт` : 'шт')
}
