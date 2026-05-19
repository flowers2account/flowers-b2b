import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/campaigns/[id]/convert - конвертировать все предзаказы в обычные заказы
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const campaignId = parseInt(id);

    if (isNaN(campaignId)) {
      return NextResponse.json(
        { error: 'Invalid campaign ID' },
        { status: 400 }
      );
    }

    // Проверяем кампанию
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, title, status')
      .eq('id', campaignId)
      .single();
    
    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }
    
    if (campaign.status === 'delivered') {
      return NextResponse.json(
        { error: 'Campaign already converted' },
        { status: 400 }
      );
    }
    
    // Вызываем функцию массовой конвертации
    const { data: results, error: convertError } = await supabase
      .rpc('convert_all_campaign_orders', { p_campaign_id: campaignId });
    
    if (convertError) {
      console.error('Error converting campaign orders:', convertError);
      return NextResponse.json(
        { error: 'Failed to convert orders', details: convertError.message },
        { status: 500 }
      );
    }
    
    // Подсчитываем успешные и неудачные конвертации
    const successful = results?.filter((r: any) => r.success) || [];
    const failed = results?.filter((r: any) => !r.success) || [];
    
    return NextResponse.json({
      message: 'Conversion completed',
      total: results?.length || 0,
      successful: successful.length,
      failed: failed.length,
      results: results || [],
      new_order_ids: successful.map((r: any) => r.new_order_id)
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

