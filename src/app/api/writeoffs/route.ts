import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    // Шаг 1: Проверяем авторизацию
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log('=== WRITEOFF DEBUG ===')
    console.log('Auth error:', authError)
    console.log('User:', user?.id, user?.email)

    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        debug: { authError: authError?.message }
      }, { status: 401 })
    }

    // Шаг 2: Проверяем роль
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    console.log('Profile error:', profileError)
    console.log('Profile:', profile)

    if (profileError) {
      return NextResponse.json({
        error: 'Profile not found',
        debug: { userId: user.id, profileError: profileError.message }
      }, { status: 403 })
    }

    if (!profile || !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({
        error: 'Forbidden: insufficient role',
        debug: { userId: user.id, role: profile?.role }
      }, { status: 403 })
    }

    // Шаг 3: Парсим тело запроса
    const body = await req.json()
    const { product_id, quantity, reason, photo_url } = body

    console.log('Request body:', { product_id, quantity, reason, photo_url })

    if (!product_id || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid product_id or quantity' }, { status: 400 })
    }

    // Шаг 4: Проверка остатков
    const { data: stock, error: stockError } = await supabase
      .from('stock')
      .select('qty, qty_reserved')
      .eq('product_id', product_id)
      .single()

    console.log('Stock:', stock, 'Error:', stockError)

    if (stockError || !stock) {
      return NextResponse.json({ error: 'Product not found in stock' }, { status: 404 })
    }

    const available = stock.qty - stock.qty_reserved
    if (available < quantity) {
      return NextResponse.json(
        { error: `Insufficient stock. Available: ${available}` },
        { status: 400 }
      )
    }

    // Шаг 5: Создаём списание
    const { data: writeoff, error: writeoffError } = await supabase
      .from('writeoffs')
      .insert({
        product_id,
        quantity,
        reason: reason || null,
        photo_url: photo_url || null,
        created_by: user.id
      })
      .select()
      .single()

    console.log('Writeoff created:', writeoff, 'Error:', writeoffError)

    if (writeoffError) {
      console.error('Writeoff insert error:', writeoffError)
      return NextResponse.json({
        error: 'Failed to create writeoff',
        debug: { writeoffError: writeoffError.message }
      }, { status: 500 })
    }

    // Шаг 6: Уменьшаем остаток
    const { error: stockUpdateError } = await supabase
      .from('stock')
      .update({ qty: stock.qty - quantity, updated_at: new Date().toISOString() })
      .eq('product_id', product_id)

    console.log('Stock updated, error:', stockUpdateError)

    if (stockUpdateError) {
      console.error('Stock update error:', stockUpdateError)
      await supabase.from('writeoffs').delete().eq('id', writeoff.id)
      return NextResponse.json({ error: 'Failed to update stock' }, { status: 500 })
    }

    // Шаг 7: Записываем в историю
    const { error: ledgerError } = await supabase
      .from('inventory_ledger')
      .insert({
        product_id,
        action: 'writeoff',
        quantity: -quantity,
        qty_before: stock.qty,
        qty_after: stock.qty - quantity,
        reference_type: 'writeoff',
        reference_id: writeoff.id,
        created_by: user.id,
        notes: reason || null
      })

    console.log('Ledger created, error:', ledgerError)
    if (ledgerError) console.error('Ledger error (non-critical):', ledgerError)

    console.log('=== WRITEOFF SUCCESS ===')
    return NextResponse.json({ success: true, data: writeoff })

  } catch (error: unknown) {
    console.error('=== WRITEOFF FATAL ERROR ===')
    console.error(error)
    const msg = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    let query = supabase
      .from('writeoffs')
      .select(`
        *,
        products ( name, variety_name, length_str ),
        profiles ( full_name, display_name )
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (from) query = query.gte('created_at', from)
    if (to)   query = query.lte('created_at', to)

    const { data, error } = await query
    if (error) {
      console.error('Get writeoffs error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error'
    console.error('Get writeoffs error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
