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
    
    // Получаем пользователя (может быть null для неавторизованных)
    const { data: { user } } = await supabase.auth.getUser();
    
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
    
    // 4. Если пользователь авторизован - получаем его предзаказ
    let myOrder = null;
    
    if (user) {
      const { data: existingOrder } = await supabase
        .from('campaign_orders')
        .select(`
          id,
          campaign_id,
          client_id,
          guest_phone,
          guest_name,
          status,
          total,
          notes,
          created_at,
          updated_at,
          converted_to_order_id
        `)
        .eq('campaign_id', campaignId)
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (existingOrder) {
        // Получаем позиции предзаказа
        const { data: orderItems } = await supabase
          .from('campaign_order_items')
          .select(`
            id,
            campaign_order_id,
            campaign_item_id,
            qty,
            price,
            created_at,
            campaign_item:campaign_items (
              id,
              product_id,
              price,
              pack_size,
              product:products (
                id,
                name,
                variety_name,
                length_str,
                image_url
              )
            )
          `)
          .eq('campaign_order_id', existingOrder.id);
        
        myOrder = {
          ...existingOrder,
          items: orderItems || []
        };
      }
    }
    
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
      user_id: user?.id || null
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
    
    // Проверяем авторизацию
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Проверяем роль
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (!profile || !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Only admin/manager can update campaigns' },
        { status: 403 }
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
    
    // Проверяем авторизацию
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Проверяем роль (только admin)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only admin can delete campaigns' },
        { status: 403 }
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
