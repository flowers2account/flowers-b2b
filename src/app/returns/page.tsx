import { readFileSync } from 'fs'
import { join } from 'path'
import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Возврат и обмен — Цветы Уральска',
  description: 'Условия возврата и обмена товаров, отмены заказов в интернет-магазине Цветы Уральска',
}

export default function ReturnsPage() {
  const content = readFileSync(join(process.cwd(), 'docs/legal-content/returns.md'), 'utf-8')
  return <LegalPage content={content} />
}
