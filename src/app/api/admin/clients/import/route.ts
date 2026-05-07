export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  // Skip header row if found
  const headerIdx = rawRows.findIndex(row =>
    Array.isArray(row) && row.some(cell => String(cell ?? '').trim().toLowerCase() === 'телефон')
  )
  const dataRows = headerIdx >= 0 ? rawRows.slice(headerIdx + 1) : rawRows

  let created = 0
  let skipped = 0
  const errors: string[] = []

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-client-user`

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue

    const phoneRaw = String(row[0] ?? '').trim()
    const nameRaw = String(row[1] ?? '').trim()
    const companyRaw = String(row[2] ?? '').trim()
    let pinRaw = String(row[3] ?? '').trim()

    if (!phoneRaw || phoneRaw.length < 7) continue

    if (!pinRaw || !/^\d{6}$/.test(pinRaw)) {
      pinRaw = Math.floor(100000 + Math.random() * 900000).toString()
    }

    let normalizedPhone: string
    try {
      normalizedPhone = normalizePhone(phoneRaw)
    } catch {
      errors.push(`${phoneRaw}: неверный формат телефона`)
      continue
    }

    const phoneDigits = normalizedPhone.replace('+', '')
    if (!/^\d{11}$/.test(phoneDigits)) {
      errors.push(`${phoneRaw}: неверный формат телефона`)
      continue
    }

    // Skip if already in clients table
    const { data: existing } = await anonClient
      .from('clients')
      .select('id')
      .eq('phone', normalizedPhone)
      .maybeSingle()
    if (existing) { skipped++; continue }

    const email = `${phoneDigits}@flowers.local`

    const efRes = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password: pinRaw, phone: normalizedPhone, name: nameRaw, company_name: companyRaw }),
    })
    const efData = await efRes.json() as { userId?: string; error?: string; code?: string }

    if (!efRes.ok || !efData.userId) {
      const isDuplicate = efData.error?.includes('already registered') || efData.code === 'email_exists'
      if (isDuplicate) { skipped++; continue }
      errors.push(`${phoneRaw}: ${efData.error ?? 'ошибка создания пользователя'}`)
      continue
    }

    const { error: clientError } = await anonClient.from('clients').insert({
      phone: normalizedPhone,
      name: nameRaw || null,
      company_name: companyRaw || null,
      pin: pinRaw,
      auth_user_id: efData.userId,
    })

    if (clientError) {
      errors.push(`${phoneRaw}: ${clientError.message}`)
      continue
    }

    created++
  }

  return NextResponse.json({ created, skipped, errors })
}
