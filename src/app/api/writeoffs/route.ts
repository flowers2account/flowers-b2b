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

  console.log('=== DEBUG COOKIES ===')
  console.log('Cookie header length:', cookieHeader.length)

  const authCookies = cookieHeader
    .split('; ')
    .filter(c => c.includes('sb-') && c.includes('auth-token'))

  console.log('Auth cookies found:', authCookies.length)

  if (authCookies.length === 0) {
    console.error('No auth token cookie found')
    console.log('Available cookies:', cookieHeader.split('; ').map(c => c.split('=')[0]))
    return null
  }

  try {
    const eqIdx = authCookies[0].indexOf('=')
    const cookieValue = authCookies[0].slice(eqIdx + 1)
    const decodedValue = decodeURIComponent(cookieValue)

    console.log('Cookie value length:', cookieValue.length)
    console.log('Decoded value length:', decodedValue.length)

    let tokenData: Record<string, unknown>
    try {
      tokenData = JSON.parse(decodedValue)
    } catch {
      console.error('Failed to parse cookie as JSON, trying base64')
      try {
        const base64Decoded = Buffer.from(decodedValue, 'base64').toString()
        tokenData = JSON.parse(base64Decoded)
      } catch {
        console.error('Failed to decode as base64')
        return null
      }
    }

    console.log('Token data keys:', Object.keys(tokenData))

    const accessToken = (tokenData.access_token || tokenData.accessToken) as string | undefined
    if (!accessToken) {
      console.error('No access_token in parsed data')
      return null
    }

    console.log('Access token found, length:', accessToken.length)
    return accessToken

  } catch (error) {
    console.error('Error extracting access token:', error)
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
  console.log('=== WRITEOFF POST START ===')
  console.log('Headers:', Object.fromEntries(req.headers.entries()))

  try {
    const accessToken = getAccessToken(req)

    if (!accessToken) {
      console.error('=== NO ACCESS TOKEN ===')
      return NextResponse.json({
        error: 'Not authenticated',
        debug: 'No access token in cookies',
      }, { status: 401 })
    }

    console.log('Access token extracted successfully')

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken)

    console.log('Auth check:', {
      hasUser: !!user,
      userId: user?.id,
      email: user?.email,
      error: authError?.message,
    })

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
