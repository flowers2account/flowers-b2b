import type { Metadata } from 'next'
import './modernist.css'
import { SmartKtruNav } from '@/components/smart-ktru/kit'

export const metadata: Metadata = {
  title: 'Smart KTRU — поставщику',
}

export default function SmartKtruLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="smart-ktru">
      <SmartKtruNav />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
