import { readFileSync } from 'fs'
import { join } from 'path'
import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Согласие на обработку персональных данных — Цветы Уральска',
  description: 'Согласие на сбор и обработку персональных данных пользователей интернет-магазина Цветы Уральска',
}

export default function PersonalDataPage() {
  const content = readFileSync(join(process.cwd(), 'docs/legal-content/personal-data.md'), 'utf-8')
  return <LegalPage content={content} />
}
