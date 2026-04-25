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

    // Get expired reservations
    const { data: expiredReservations } = await supabase
      .from('reservations')
      .select('product_id')
      .lt('expires_at', now)

    const affectedProductIds = [...new Set((expiredReservations ?? []).map((r: any) => r.product_id))]

    // Delete expired reservations
    const { error: deleteError } = await supabase
      .from('reservations')
      .delete()
      .lt('expires_at', now)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete reservations' }, { status: 500 })
    }

    // Recalculate qty_reserved for affected products
    for (const productId of affectedProductIds) {
      // Get count of active reservations for this product
      const { data: activeReservations } = await supabase
        .from('reservations')
        .select('qty')
        .eq('product_id', productId)

      const qtyReserved = (activeReservations ?? []).reduce((sum: number, r: any) => sum + r.qty, 0)

      // Update stock
      await supabase
        .from('stock')
        .update({ qty_reserved: qtyReserved })
        .eq('product_id', productId)
    }

    const deletedCount = expiredReservations?.length ?? 0

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
