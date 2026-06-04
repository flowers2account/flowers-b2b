import { readFileSync } from 'fs'
import { join } from 'path'
import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Оплата — Цветы Уральска',
  description: 'Способы оплаты и порядок оформления заказа в интернет-магазине Цветы Уральска',
}

export default function PaymentPage() {
  const content = readFileSync(join(process.cwd(), 'docs/legal-content/payment.md'), 'utf-8')
  return <LegalPage content={content} />
}
