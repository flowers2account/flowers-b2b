'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { CampaignSummaryRow } from '@/types/campaigns'

// ── Exported types shared with admin pages ────────────────────────────────────

export interface PreorderItem {
  id: number
  qty: number
  price: number
  campaign_items: {
    oz_delivery_date: string | null
    oz_stock_type: string | null
    products: { name: string; display_name: string | null } | null
  } | null
}

export interface PreorderOrder {
  id: number
  campaign_id: number
  client_id: string | null
  guest_phone: string | null
  guest_name: string | null
  status: string
  total: number
  notes: string | null
  created_at: string
  updated_at: string | null
  converted_to_order_id: number | null
  campaigns: { title: string; delivery_date: string | null } | null
  clients: { name: string | null; company_name: string | null; phone: string | null } | null
  campaign_order_items: PreorderItem[]
}

function generateToken(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface StagingRow {
  product_id: number | null
  oz_line_id: string | null
  oz_stock_type: string | null
  oz_delivery_date: string | null
  available_stems: number | null
  order_multiple_stems: number | null
  purchase_eur: number | null
}

export async function launchCampaign(params: {
  campaign_id: number
  markup_percent: number
  eur_kzt_rate: number
  round_to: number
}): Promise<{ inserted?: number; errors?: number; errorLog?: string[]; access_code?: string; error?: string }> {
  const supabase = createAdminClient()
  const { campaign_id, markup_percent, eur_kzt_rate, round_to } = params

  const { data: settings } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['preorder_markup_percent', 'preorder_eur_kzt_rate', 'preorder_round_to'])

  const settingsMap = Object.fromEntries(
    ((settings ?? []) as { key: string; value: string }[]).map(s => [s.key, s.value])
  )
  const markup  = markup_percent  ?? parseFloat(settingsMap.preorder_markup_percent ?? '35')
  const rate    = eur_kzt_rate    ?? parseFloat(settingsMap.preorder_eur_kzt_rate   ?? '525')
  const roundTo = round_to        ?? parseFloat(settingsMap.preorder_round_to       ?? '1')

  const { data: stagingRows, error: stagingErr } = await supabase
    .from('campaign_staging')
    .select('*')
    .eq('campaign_id', campaign_id)
    .eq('is_selected', true)

  if (stagingErr) return { error: stagingErr.message }
  if (!stagingRows?.length) return { error: 'Нет выбранных строк в стейджинге' }

  const items = (stagingRows as StagingRow[]).map((row, i) => ({
    campaign_id,
    product_id:         row.product_id,
    pack_size:          row.order_multiple_stems ?? 1,
    min_qty:            row.order_multiple_stems ?? 1,
    sort_order:         i + 1,
    is_active:          true,
    oz_line_id:         row.oz_line_id,
    oz_stock_type:      row.oz_stock_type,
    oz_delivery_date:   row.oz_delivery_date,
    oz_available_stems: row.available_stems,
    oz_purchase_eur:    row.purchase_eur,
    markup_percent:     markup,
    eur_kzt_rate:       rate,
  }))

  let inserted = 0
  const errorLog: string[] = []

  for (const item of items) {
    if (!item.oz_purchase_eur) {
      errorLog.push(`Строка без purchase_eur: oz_line_id=${item.oz_line_id}`)
      continue
    }

    const { data: priceRow } = await supabase.rpc('calc_preorder_price_kzt', {
      purchase_eur: item.oz_purchase_eur,
      markup_pct:   markup,
      rate:         rate,
      round_to:     roundTo,
    })

    const { error } = await supabase
      .from('campaign_items')
      .insert({ ...item, price: priceRow ?? 0 })

    if (error) errorLog.push(`oz_line_id=${item.oz_line_id}: ${error.message}`)
    else inserted++
  }

  const access_code = generateAccessCode()
  await supabase
    .from('campaigns')
    .update({ status: 'published', markup_percent: markup, eur_kzt_rate: rate, access_code })
    .eq('id', campaign_id)

  return { inserted, errors: errorLog.length, errorLog, access_code }
}

export async function admitRequest(params: {
  access_id: number
  campaign_id: number
  action: 'approve' | 'deny'
}): Promise<{ status?: string; error?: string }> {
  const supabase = await createServerClient()
  const { access_id, campaign_id, action } = params
  const now = new Date().toISOString()

  if (action === 'deny') {
    const { error } = await supabase
      .from('campaign_access')
      .update({ status: 'denied', decided_at: now, decided_by: null })
      .eq('id', access_id)
      .eq('campaign_id', campaign_id)
    if (error) return { error: error.message }
    return { status: 'denied' }
  }

  const access_token = generateToken()
  const { error } = await supabase
    .from('campaign_access')
    .update({ status: 'approved', access_token, decided_at: now, decided_by: null })
    .eq('id', access_id)
    .eq('campaign_id', campaign_id)

  if (error) return { error: error.message }
  return { status: 'approved' }
}

export interface AccessRow {
  id: number
  guest_phone: string
  guest_name: string | null
  status: 'pending' | 'approved' | 'denied'
  requested_at: string
  decided_at: string | null
}

export async function getAccessRequests(
  campaign_id: number
): Promise<{ rows: AccessRow[]; error?: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('campaign_access')
    .select('id, guest_phone, guest_name, status, requested_at, decided_at')
    .eq('campaign_id', campaign_id)
    .order('status', { ascending: false })   // pending first: p > d > a alphabetically
    .order('requested_at', { ascending: false })

  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as AccessRow[] }
}

// ── Update preorder status via SECURITY DEFINER RPC ──────────────────────────

export async function updatePreorderStatus(params: {
  order_id: number
  status: string
}): Promise<{ error?: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('admin_set_preorder_status', {
    p_order_id: params.order_id,
    p_status:   params.status,
  })
  if (error) return { error: error.message }
  return {}
}

// ── Preorder checkout (client-facing, called from /preorder/[id] room) ────────

export async function checkoutPreorder(params: {
  campaign_id: number
  items: Array<{ campaign_item_id: number; qty: number }>
}): Promise<{ order_id?: number; total?: number; error?: string }> {
  const cookieStore = await cookies()
  const token = cookieStore.get(`preorder_token_${params.campaign_id}`)?.value
  if (!token) return { error: 'Нет доступа: токен не найден' }

  const supabase = createAdminClient()

  // Validate token → get guest phone/name
  const { data: access } = await supabase
    .from('campaign_access')
    .select('guest_phone, guest_name')
    .eq('campaign_id', params.campaign_id)
    .eq('access_token', token)
    .eq('status', 'approved')
    .maybeSingle()

  if (!access) return { error: 'Доступ не найден или отозван' }

  const normalizedPhone = normalizePhone(access.guest_phone)

  // Match to clients by normalised phone — same FK used by orders and reservations
  const { data: clientRow } = await supabase
    .from('clients')
    .select('id')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  const clientId: string | null = clientRow?.id ?? null

  // Get item prices and limits from DB (never trust client-supplied prices)
  const itemIds = params.items.map(i => i.campaign_item_id)
  const { data: dbItems, error: itemsErr } = await supabase
    .from('campaign_items')
    .select('id, price, oz_available_stems, pack_size, min_qty')
    .in('id', itemIds)
    .eq('campaign_id', params.campaign_id)
    .eq('is_active', true)

  if (itemsErr || !dbItems?.length) return { error: 'Позиции не найдены' }

  // Validate quantities
  for (const req of params.items) {
    const db = dbItems.find(i => i.id === req.campaign_item_id)
    if (!db) return { error: `Позиция ${req.campaign_item_id} не найдена в кампании` }
    const min = db.min_qty ?? db.pack_size ?? 1
    if (req.qty < min) return { error: `Минимальное количество: ${min} стеблей` }
    if (db.pack_size && req.qty % db.pack_size !== 0) {
      return { error: `Кратность нарушена: шаг ${db.pack_size} стеблей` }
    }
    if (db.oz_available_stems !== null && req.qty > db.oz_available_stems) {
      return { error: `Превышен лимит партии (доступно ${db.oz_available_stems} стеблей)` }
    }
  }

  // Calculate total from DB prices
  const total = params.items.reduce((sum, req) => {
    const db = dbItems.find(i => i.id === req.campaign_item_id)!
    return sum + req.qty * db.price
  }, 0)

  // Create campaign_order
  const { data: order, error: orderErr } = await supabase
    .from('campaign_orders')
    .insert({
      campaign_id:  params.campaign_id,
      client_id:    clientId,
      guest_phone:  clientId ? null : access.guest_phone,
      guest_name:   access.guest_name,
      status:       'pending',
      total,
    })
    .select('id')
    .single()

  if (orderErr || !order) return { error: 'Ошибка создания заказа: ' + (orderErr?.message ?? '') }

  // Insert order items
  const { error: itemsInsertErr } = await supabase.from('campaign_order_items').insert(
    params.items.map(req => ({
      campaign_order_id: order.id,
      campaign_item_id:  req.campaign_item_id,
      qty:               req.qty,
      price:             dbItems.find(i => i.id === req.campaign_item_id)!.price,
    }))
  )

  if (itemsInsertErr) return { error: 'Ошибка записи позиций: ' + itemsInsertErr.message }

  // Telegram notification (non-fatal)
  try {
    const tgMsg = [
      `🌸 Предзаказ #${order.id} — акция #${params.campaign_id}`,
      `📞 ${access.guest_phone}${access.guest_name ? ' / ' + access.guest_name : ''}`,
      `💰 Итого: ${total.toLocaleString('ru-RU')} ₸`,
      `📦 Позиций: ${params.items.length}`,
    ].join('\n')
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: tgMsg }),
    })
  } catch { /* non-fatal */ }

  return { order_id: order.id, total }
}

// ── Read all campaign_orders via SECURITY DEFINER RPC ────────────────────────

export async function getPreorders(): Promise<{ orders: PreorderOrder[]; error?: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('get_admin_preorders')
  if (error) return { orders: [], error: error.message }
  return { orders: (data as PreorderOrder[]) ?? [] }
}

// ── Read campaign summary via SECURITY DEFINER RPC ───────────────────────────

export async function getCampaignSummary(
  campaign_id: number
): Promise<{ summary: CampaignSummaryRow[]; error?: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('get_admin_summary', { p_campaign_id: campaign_id })
  if (error) return { summary: [], error: error.message }
  return { summary: (data as CampaignSummaryRow[]) ?? [] }
}
