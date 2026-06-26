// Halyk OnlineBank QR — ТОЛЬКО генерация ссылки (GET, без авторизации/токена).
// Клиент платит, войдя в своё приложение Onlinebank; REST API/эквайринг тут НЕ участвуют.
// Ссылка: {BASE}/applink/b2b/distributor/{distributorBIN}/client/{clientBIN}
//         /invoiceId/{invoiceId}/amount/{amount}/invoiceTitle/{invoiceTitle}
import { company } from '@/config/company'

const BASE = {
  test: 'https://public.test.onlinebank.kz',
  prod: 'https://public.onlinebank.kz',
} as const

// env-флаг тест/боевой. Боевой — ТОЛЬКО при NEXT_PUBLIC_HALYK_QR_ENV='prod' (пока тест).
export const HALYK_QR_ENV: 'test' | 'prod' =
  process.env.NEXT_PUBLIC_HALYK_QR_ENV === 'prod' ? 'prod' : 'test'
export const HALYK_QR_BASE = BASE[HALYK_QR_ENV]

// distributorBIN — ИИН ИП Тропин (единый источник company.iin), с env-override.
export const HALYK_DISTRIBUTOR_BIN =
  process.env.NEXT_PUBLIC_HALYK_DISTRIBUTOR_BIN || company.iin

export type QrOrder = { id: string | number; total: number | null }
export type QrClient = { bin?: string | null }

/** БИН/ИИН организации — ровно 12 цифр. */
export function isValidBin(bin?: string | null): boolean {
  return typeof bin === 'string' && /^\d{12}$/.test(bin.trim())
}

// invoiceId не должен содержать спецсимволы: $ @ # ! & ? \ | /
const sanitizeInvoiceId = (id: string | number) => String(id).replace(/[$@#!&?\\/|]/g, '')

/**
 * Сумма в формате applink: целая — без копеек (17500), дробная — с двумя знаками (280.50).
 * Тиыны отделяются точкой.
 */
function formatQrAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export type InvoiceQrInput = {
  bin: string                       // БИН клиента (clients.bin) — 12 цифр, обязателен
  guid: string                      // invoices.guid (UUID) → invoiceId
  amount: number | string           // сумма счёта (₸), тиыны через точку
  invoiceNumber: number | string    // invoices.invoice_number → invoiceTitle
}

/**
 * Собрать QR-ссылку OnlineDuken по счёту (invoices).
 * Жёсткая валидация: пустое/кривое поле → throw, кривую ссылку НЕ генерим.
 *   - bin: ровно 12 цифр, иначе «укажите БИН»
 *   - guid: непустой UUID документа
 *   - amount: положительное число
 *   - invoiceNumber: положительное целое (номер счёта, напр. 9000001)
 */
export function buildInvoiceQrLink(input: InvoiceQrInput): string {
  const bin = String(input?.bin ?? '').trim()
  if (!bin) throw new Error('укажите БИН')
  if (!isValidBin(bin)) throw new Error('БИН клиента должен содержать ровно 12 цифр')

  const guid = String(input?.guid ?? '').trim()
  if (!guid) throw new Error('не задан invoiceId (guid) счёта')

  const amount = Number(input?.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('некорректная сумма счёта')

  const invoiceNumber = String(input?.invoiceNumber ?? '').trim()
  if (!/^\d+$/.test(invoiceNumber)) throw new Error('не задан номер счёта')

  return `${HALYK_QR_BASE}/applink/b2b/distributor/${HALYK_DISTRIBUTOR_BIN}` +
    `/client/${bin}/invoiceId/${guid}/amount/${formatQrAmount(amount)}/invoiceTitle/${invoiceNumber}`
}

/**
 * Собрать QR-ссылку оплаты. Возвращает null, если БИН клиента невалиден или нет суммы
 * (тогда UI показывает «заполните БИН организации» и QR не генерит).
 */
export function buildHalykQrLink(order: QrOrder, client: QrClient): string | null {
  const clientBIN = (client?.bin ?? '').trim()
  if (!isValidBin(clientBIN)) return null
  const amount = Number(order?.total)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const invoiceId = sanitizeInvoiceId(order.id)
  if (!invoiceId) return null
  const invoiceTitle = sanitizeInvoiceId(order.id) // номер заказа
  return `${HALYK_QR_BASE}/applink/b2b/distributor/${HALYK_DISTRIBUTOR_BIN}` +
    `/client/${clientBIN}/invoiceId/${invoiceId}/amount/${amount}/invoiceTitle/${invoiceTitle}`
}
