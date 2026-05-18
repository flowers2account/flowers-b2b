import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function getAuthorizedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role)) return null
  return user
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getAuthorizedUser(supabase)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { product_id, quantity, reason, photo_url } = await req.json()

    if (!product_id || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid product_id or quantity' }, { status: 400 })
    }

    // Check available stock
    const { data: stock } = await supabase
      .from('stock')
      .select('qty')
      .eq('product_id', product_id)
      .single()

    if (!stock || stock.qty < quantity) {
      return NextResponse.json({ error: 'Insufficient stock' }, { status: 400 })
    }

    // Create writeoff record
    const { data: writeoff, error: writeoffError } = await supabase
      .from('writeoffs')
      .insert({ product_id, quantity, reason, photo_url, created_by: user.id })
      .select()
      .single()

    if (writeoffError) throw writeoffError

    // Decrement stock
    const { error: stockError } = await supabase
      .from('stock')
      .update({ qty: stock.qty - quantity, updated_at: new Date().toISOString() })
      .eq('product_id', product_id)

    if (stockError) throw stockError

    // Ledger entry — reference_id is integer in DB, writeoffs.id is bigint
    const { error: ledgerError } = await supabase
      .from('inventory_ledger')
      .insert({
        product_id,
        action: 'writeoff',
        quantity: -quantity,
        qty_before: stock.qty,
        qty_after: stock.qty - quantity,
        reference_type: 'writeoff',
        reference_id: Number(writeoff.id),
        created_by: user.id,
        notes: reason || null,
      })

    if (ledgerError) throw ledgerError

    return NextResponse.json({ success: true, data: writeoff })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    console.error('Writeoff error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getAuthorizedUser(supabase)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = req.nextUrl
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = 50
    const offset = (page - 1) * limit

    let query = supabase
      .from('writeoffs')
      .select(`
        id, product_id, quantity, reason, photo_url, created_at,
        products ( name, variety_name, length_str ),
        profiles ( full_name, display_name )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data, page })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    console.error('Get writeoffs error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
