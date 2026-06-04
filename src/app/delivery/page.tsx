import { readFileSync } from 'fs'
import { join } from 'path'
import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Доставка и самовывоз — Цветы Уральска',
  description: 'Условия доставки и самовывоза заказов из интернет-магазина Цветы Уральска в Уральске, Актобе и Атырау',
}

export default function DeliveryPage() {
  const content = readFileSync(join(process.cwd(), 'docs/legal-content/delivery.md'), 'utf-8')
  return <LegalPage content={content} />
}
