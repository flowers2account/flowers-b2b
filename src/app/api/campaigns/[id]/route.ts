import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
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
    
    // 1. Получаем кампанию
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    
    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }
    
    // 2. Получаем позиции кампании с данными о товарах
    const { data: items, error: itemsError } = await supabase
      .from('campaign_items')
      .select(`
        id,
        campaign_id,
        product_id,
        price,
        min_qty,
        pack_size,
        notes,
        sort_order,
        is_active,
        created_at,
        product:products (
          id,
          name,
          variety_name,
          length_str,
          image_url,
          campaign_image_url,
          category,
          color,
          colors,
          subcategory,
          variety_type,
          floral_role,
          origin
        )
      `)
      .eq('campaign_id', campaignId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (itemsError) {
      console.error('Error fetching campaign items:', itemsError);
    }
    
    // 3. Получаем статистику
    const { data: stats } = await supabase
      .rpc('get_campaign_stats', { p_campaign_id: campaignId })
      .single();
    
    const myOrder = null;

    return NextResponse.json({
      campaign,
      items: items || [],
      stats: stats || {
        total_items: 0,
        total_orders: 0,
        total_clients: 0,
        total_amount: 0,
        status: campaign.status,
        closes_in_hours: 0
      },
      my_order: myOrder,
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/campaigns/[id] - обновить кампанию (только admin/manager)
export async function PATCH(
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
    
    const body = await request.json();
    
    // Обновляем кампанию
    const { data: campaign, error: updateError } = await supabase
      .from('campaigns')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error updating campaign:', updateError);
      return NextResponse.json(
        { error: 'Failed to update campaign', details: updateError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      campaign,
      message: 'Campaign updated successfully'
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/campaigns/[id] - удалить кампанию (только admin)
export async function DELETE(
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
    
    // Удаляем кампанию (каскадно удалятся campaign_items и campaign_order_items)
    const { error: deleteError } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId);
    
    if (deleteError) {
      console.error('Error deleting campaign:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete campaign', details: deleteError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      message: 'Campaign deleted successfully'
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
