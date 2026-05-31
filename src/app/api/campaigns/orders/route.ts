import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/phone';

// GET /api/campaigns/orders?phone=<+7...> — предзаказы клиента
// Резолвит clients.id по телефону (тот же FK, что и orders.client_id).
export async function GET(request: NextRequest) {
  const rawPhone = request.nextUrl.searchParams.get('phone');
  if (!rawPhone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Resolve clients.id by phone — same pattern as /api/my-orders
  const normalizedPhone = normalizePhone(rawPhone);
  const { data: clientRow } = await supabase
    .from('clients')
    .select('id')
    .eq('phone', normalizedPhone)
    .maybeSingle();

  if (!clientRow) {
    return NextResponse.json({ orders: [] });
  }

  const { data, error } = await supabase
    .from('campaign_orders')
    .select(`
      id,
      status,
      total,
      created_at,
      converted_to_order_id,
      campaign_id,
      campaigns(title, delivery_date, type),
      campaign_order_items(
        id,
        qty,
        price,
        campaign_items(
          oz_delivery_date,
          products(name, display_name)
        )
      )
    `)
    .eq('client_id', clientRow.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaign orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }

  const orders = (data ?? []).map((row: any) => ({
    id:                    row.id,
    campaign_id:           row.campaign_id,
    campaign_title:        row.campaigns?.title ?? null,
    campaign_type:         row.campaigns?.type ?? null,
    delivery_date:         row.campaigns?.delivery_date ?? null,
    status:                row.status,
    total:                 row.total,
    converted_to_order_id: row.converted_to_order_id ?? null,
    items_count:           (row.campaign_order_items as any[]).length,
    items: (row.campaign_order_items as any[]).map((oi: any) => ({
      id:            oi.id,
      qty:           oi.qty,
      price:         oi.price,
      name:          oi.campaign_items?.products?.display_name
                       ?? oi.campaign_items?.products?.name
                       ?? '—',
      delivery_date: oi.campaign_items?.oz_delivery_date ?? null,
    })),
    created_at: row.created_at,
  }));

  return NextResponse.json({ orders });
}
