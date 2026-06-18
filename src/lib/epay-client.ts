// epay (Halyk) клиентский URL виджета payform по флагу. NEXT_PUBLIC_* — build-time.
// Приоритет: явный NEXT_PUBLIC_EPAY_JS_URL (как сейчас, из GitHub Secrets на билде) →
// иначе карта по NEXT_PUBLIC_EPAY_ENV (test|prod). Тест не трогаем.
// Контуры: тест — test-epay.epayment.kz; бой — epay.homebank.kz (docs/PAYMENTS.md).
const JS_URL = {
  test: 'https://test-epay.epayment.kz/payform/payment-api.js',
  prod: 'https://epay.homebank.kz/payform/payment-api.js',
} as const

const env: 'test' | 'prod' = process.env.NEXT_PUBLIC_EPAY_ENV === 'prod' ? 'prod' : 'test'

export const EPAY_JS_URL = process.env.NEXT_PUBLIC_EPAY_JS_URL || JS_URL[env]
