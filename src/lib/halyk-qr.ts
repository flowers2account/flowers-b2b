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
