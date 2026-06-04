import { readFileSync } from 'fs'
import { join } from 'path'
import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Договор публичной оферты — Цветы Уральска',
  description: 'Договор публичной оферты о продаже товаров через интернет-магазин Цветы Уральска',
}

export default function OfertaPage() {
  const content = readFileSync(join(process.cwd(), 'docs/legal-content/oferta.md'), 'utf-8')
  return <LegalPage content={content} />
}
