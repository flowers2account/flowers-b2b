import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/campaigns/orders?client_id=<auth_uid> — все предзаказы клиента
export async function GET(request: NextRequest) {
  const client_id = request.nextUrl.searchParams.get('client_id');

  if (!client_id) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

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
    .eq('client_id', client_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaign orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }

  const orders = (data ?? []).map((row: any) => ({
    id:                   row.id,
    campaign_id:          row.campaign_id,
    campaign_title:       row.campaigns?.title ?? null,
    campaign_type:        row.campaigns?.type ?? null,
    delivery_date:        row.campaigns?.delivery_date ?? null,
    status:               row.status,
    total:                row.total,
    converted_to_order_id: row.converted_to_order_id ?? null,
    items_count:          (row.campaign_order_items as any[]).length,
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
