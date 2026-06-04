import { readFileSync } from 'fs'
import { join } from 'path'
import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Контакты — Цветы Уральска',
  description: 'Контактная информация интернет-магазина Цветы Уральска: телефон, email, адрес склада в Уральске',
}

export default function ContactsPage() {
  const content = readFileSync(join(process.cwd(), 'docs/legal-content/contacts.md'), 'utf-8')
  return <LegalPage content={content} />
}
