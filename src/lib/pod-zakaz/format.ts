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

// «Сегодня» в Asia/Oral, обрезано до даты (без времени) — для сравнения с trading_day_date.
function todayOral(): Date {
  const oral = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Oral' }))
  oral.setHours(0, 0, 0, 0)
  return oral
}

// Плашка торгового дня для карточки/панели. trading_day_date — дата ДНЯ Proflowers, не
// гарантированный срок поставки: приём по дню может быть ещё открыт (товар есть в выдаче),
// хотя сама дата дня уже прошла (подтверждено 08.10.2026 — у «Срезанные цветы» день назывался
// «6 октября» 8-го числа). Показывать прошедшую дату как «поставка» — обман клиента. Пока
// владелец не определит формулу «дата отгрузки + N дней доставки» — прошедшую/сегодняшнюю
// дату прячем, нейтральный текст «Под заказ» вместо конкретной даты.
export function tradingDayBadge(item: PfCatalogItem): string {
  const label = tradingDayLabel(item.trading_day_type)
  if (!item.trading_day_date) return label
  const day = new Date(item.trading_day_date)
  if (Number.isNaN(day.getTime())) return label
  day.setHours(0, 0, 0, 0)
  if (day.getTime() <= todayOral().getTime()) return 'Под заказ'
  return `${label} · поставка ${formatDeliveryDate(item.trading_day_date)}`
}

// Шаг корзины считаем в «ступенях»: для is_box_only ступень = 1 короб (box_multiplicity шт),
// иначе ступень = multiplicity шт. Так «нельзя заказать произвольное число штук у коробочного
// товара» соблюдается на уровне самой единицы измерения количества, а не проверкой постфактум.
export function stepUnits(item: PfCatalogItem): number {
  if (item.is_box_only) return item.box_multiplicity || 1
  return item.multiplicity || 1
}

// Цена за ЕДИНИЦУ (шт) — вне зависимости от того, продаётся ли товар коробом. У Proflowers
// box_price_with_discount — это ТОЖЕ цена за штуку (просто тариф «при покупке коробом»), не
// цена за весь короб (доказано разведкой 06.10.2026 на живых товарах: короб из 36 ваз за
// «box_price»=1400 суммарно означал бы 39₸/ваза при розничной 1100 — абсурд; box_price лишь
// немного отличается от price, это тариф за штуку).
export function unitPrice(item: PfCatalogItem): number {
  return item.is_box_only ? (item.box_client_price ?? 0) : item.client_price
}

// Цена за одну ступень (короб или упаковку кратности). Для is_box_only — это ЦЕНА ВСЕГО
// КОРОБА: box_client_price (цена за штуку под коробочный тариф) × box_multiplicity (шт в
// коробе). БЫЛО БАГОМ до 06.10.2026: отдавали box_client_price как есть, показывая цену
// короба в box_multiplicity раз ниже реальной (напр. 290 ₸ вместо 87 000 ₸ за короб 300 шт).
export function stepPrice(item: PfCatalogItem): number {
  if (item.is_box_only) return (item.box_client_price ?? 0) * (item.box_multiplicity || 1)
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
    ? `${item.box_multiplicity} шт в коробе`
    : (item.multiplicity > 1 ? `упаковка ${item.multiplicity} шт` : 'шт')
}
