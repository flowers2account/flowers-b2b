import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Service Role client — bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getAccessToken(req: NextRequest): string | null {
  const cookieHeader = req.headers.get('cookie') || ''
  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [key, ...v] = c.split('=')
      return [key, v.join('=')]
    })
  )
  const authTokenKey = Object.keys(cookies).find(
    key => key.startsWith('sb-') && key.endsWith('-auth-token')
  )
  if (!authTokenKey) return null
  try {
    const tokenData = JSON.parse(decodeURIComponent(cookies[authTokenKey]))
    return tokenData.access_token || null
  } catch {
    return null
  }
}

async function getAuthUser(req: NextRequest) {
  const accessToken = getAccessToken(req)
  if (!accessToken) return { user: null, error: 'No auth token cookie found' }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  return { user: user ?? null, error: error?.message ?? null }
}

async function checkRole(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return data?.role ?? null
}

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser(req)

    console.log('=== WRITEOFF DEBUG ===')
    console.log('User:', user?.id, user?.email)
    console.log('Auth error:', authError)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', debug: authError }, { status: 401 })
    }

    const role = await checkRole(user.id)
    console.log('Role:', role)

    if (!role) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }
    if (!['admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden: insufficient role', debug: { role } }, { status: 403 })
    }

    const body = await req.json()
    const { product_id, quantity, reason, photo_url } = body
    console.log('Request:', { product_id, quantity })

    if (!product_id || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid product_id or quantity' }, { status: 400 })
    }

    const { data: stock, error: stockError } = await supabaseAdmin
      .from('stock')
      .select('qty, qty_reserved')
      .eq('product_id', product_id)
      .single()

    if (stockError || !stock) {
      return NextResponse.json({ error: 'Product not found in stock' }, { status: 404 })
    }

    const available = stock.qty - stock.qty_reserved
    if (available < quantity) {
      return NextResponse.json({ error: `Insufficient stock. Available: ${available}` }, { status: 400 })
    }

    // 1. Create writeoff
    const { data: writeoff, error: writeoffError } = await supabaseAdmin
      .from('writeoffs')
      .insert({ product_id, quantity, reason: reason || null, photo_url: photo_url || null, created_by: user.id })
      .select()
      .single()

    console.log('Writeoff:', writeoff?.id, 'Error:', writeoffError)

    if (writeoffError || !writeoff) {
      console.error('Writeoff error:', writeoffError)
      return NextResponse.json({ error: 'Failed to create writeoff' }, { status: 500 })
    }

    // 2. Decrement stock
    const { error: stockUpdateError } = await supabaseAdmin
      .from('stock')
      .update({ qty: stock.qty - quantity, updated_at: new Date().toISOString() })
      .eq('product_id', product_id)

    if (stockUpdateError) {
      console.error('Stock update error:', stockUpdateError)
      await supabaseAdmin.from('writeoffs').delete().eq('id', writeoff.id)
      return NextResponse.json({ error: 'Failed to update stock' }, { status: 500 })
    }

    // 3. Ledger entry
    const { error: ledgerError } = await supabaseAdmin
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

    if (ledgerError) console.error('Ledger error (non-critical):', ledgerError)

    console.log('=== WRITEOFF SUCCESS ===')
    return NextResponse.json({ success: true, data: writeoff })

  } catch (error: unknown) {
    console.error('=== WRITEOFF FATAL ERROR ===', error)
    const msg = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = await checkRole(user.id)
    if (!role || !['admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    let query = supabaseAdmin
      .from('writeoffs')
      .select(`*, products (name, variety_name, length_str), profiles (full_name, display_name)`)
      .order('created_at', { ascending: false })
      .limit(100)

    if (from) query = query.gte('created_at', from)
    if (to)   query = query.lte('created_at', to)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
