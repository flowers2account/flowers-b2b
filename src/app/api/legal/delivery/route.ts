import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

// Единый источник условий доставки — тот же файл, что рендерит страница /delivery.
// Отдаём raw markdown для модалки в чекауте (клиентский компонент не может читать fs).
export async function GET() {
  try {
    const content = readFileSync(join(process.cwd(), 'docs/legal-content/delivery.md'), 'utf-8')
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}
