import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Verify CRON_SECRET header
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const now = new Date().toISOString()

    // Get expired reservations with details
    const { data: expiredReservations } = await supabase
      .from('reservations')
      .select('product_id, qty')
      .lt('expires_at', now)

    // Group by product_id to calculate total qty_reserved reduction
    const qtyByProduct = new Map<number, number>()
    for (const res of expiredReservations ?? []) {
      const current = qtyByProduct.get(res.product_id) || 0
      qtyByProduct.set(res.product_id, current + res.qty)
    }

    // Delete expired reservations
    const { error: deleteError } = await supabase
      .from('reservations')
      .delete()
      .lt('expires_at', now)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete reservations' }, { status: 500 })
    }

    // Update qty_reserved for affected products
    for (const [productId, deletedQty] of qtyByProduct.entries()) {
      const { data: stock } = await supabase
        .from('stock')
        .select('qty_reserved')
        .eq('product_id', productId)
        .single()

      const newQtyReserved = Math.max(0, (stock?.qty_reserved ?? 0) - deletedQty)
      await supabase
        .from('stock')
        .update({ qty_reserved: newQtyReserved })
        .eq('product_id', productId)
    }

    const deletedCount = expiredReservations?.length ?? 0
    const affectedProductIds = Array.from(qtyByProduct.keys())

    return NextResponse.json({
      success: true,
      deleted_count: deletedCount,
      affected_products: affectedProductIds.length,
      timestamp: now,
    })
  } catch (error) {
    console.error('Cron cleanup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
