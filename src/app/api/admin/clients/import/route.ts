export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const adminClient = createAdminClient()

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue

    const phoneRaw = String(row[0] ?? '').trim()
    const nameRaw = String(row[1] ?? '').trim()
    const companyRaw = String(row[2] ?? '').trim()
    let pinRaw = String(row[3] ?? '').trim()

    if (!phoneRaw || phoneRaw.length < 7) continue

    if (!pinRaw || !/^\d{4}$/.test(pinRaw)) {
      pinRaw = Math.floor(1000 + Math.random() * 9000).toString()
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
    const { data: existing } = await adminClient
      .from('clients')
      .select('id')
      .eq('phone', normalizedPhone)
      .maybeSingle()
    if (existing) { skipped++; continue }

    const email = `${phoneDigits}@flowers.local`

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: pinRaw,
      email_confirm: true,
    })

    if (authError) {
      const isDuplicate = authError.message.includes('already registered') || authError.code === 'email_exists'
      if (isDuplicate) { skipped++; continue }
      errors.push(`${phoneRaw}: ${authError.message}`)
      continue
    }

    const userId = authData.user.id

    await adminClient.from('profiles').upsert({
      id: userId,
      email,
      role: 'client',
      phone: normalizedPhone,
      company_name: companyRaw || null,
      full_name: nameRaw || null,
    }, { onConflict: 'id' })

    const { error: clientError } = await adminClient.from('clients').insert({
      phone: normalizedPhone,
      name: nameRaw || null,
      company_name: companyRaw || null,
      pin: pinRaw,
      auth_user_id: userId,
    })

    if (clientError) {
      await adminClient.auth.admin.deleteUser(userId)
      errors.push(`${phoneRaw}: ${clientError.message}`)
      continue
    }

    created++
  }

  return NextResponse.json({ created, skipped, errors })
}
