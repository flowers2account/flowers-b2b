import { readFileSync } from 'fs'
import { join } from 'path'
import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Политика конфиденциальности — Цветы Уральска',
  description: 'Политика конфиденциальности и обработки персональных данных интернет-магазина Цветы Уральска',
}

export default function PrivacyPage() {
  const content = readFileSync(join(process.cwd(), 'docs/legal-content/privacy.md'), 'utf-8')
  return <LegalPage content={content} />
}
