import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/campaigns/[id]/order - создать или обновить предзаказ
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
    
    const body = await request.json();
    const { items, guest_phone, guest_name } = body;
    
    // Получаем пользователя
    const { data: { user } } = await supabase.auth.getUser();
    
    // Для гостей требуем телефон и имя
    if (!user && (!guest_phone || !guest_name)) {
      return NextResponse.json(
        { error: 'Guest orders require phone and name' },
        { status: 400 }
      );
    }
    
    // Валидация items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required and must not be empty' },
        { status: 400 }
      );
    }
    
    // 1. Проверяем что кампания существует и открыта
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, status, closes_at, allowed_price_groups')
      .eq('id', campaignId)
      .single();
    
    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }
    
    if (campaign.status !== 'published') {
      return NextResponse.json(
        { error: 'Campaign is not available for ordering' },
        { status: 400 }
      );
    }
    
    if (new Date(campaign.closes_at) < new Date()) {
      return NextResponse.json(
        { error: 'Campaign ordering period has ended' },
        { status: 400 }
      );
    }
    
    // 2. Для авторизованных проверяем что клиент имеет право на предзаказы
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('price_group')
        .eq('id', user.id)
        .single();
      
      if (profile && !campaign.allowed_price_groups.includes(profile.price_group)) {
        return NextResponse.json(
          { error: 'Your account type does not have access to pre-orders' },
          { status: 403 }
        );
      }
    }
    
    // 3. Проверяем существование всех campaign_items
    const campaignItemIds = items.map((item: any) => item.campaign_item_id);
    
    const { data: campaignItems, error: itemsError } = await supabase
      .from('campaign_items')
      .select('id, campaign_id, price, min_qty, pack_size')
      .in('id', campaignItemIds)
      .eq('campaign_id', campaignId)
      .eq('is_active', true);
    
    if (itemsError || !campaignItems || campaignItems.length !== campaignItemIds.length) {
      return NextResponse.json(
        { error: 'Some campaign items not found or inactive' },
        { status: 400 }
      );
    }
    
    // 4. Валидация количества и кратности
    for (const item of items) {
      const campaignItem = campaignItems.find(ci => ci.id === item.campaign_item_id);
      if (!campaignItem) continue;
      
      if (item.qty < campaignItem.min_qty) {
        return NextResponse.json(
          { error: `Quantity for item ${item.campaign_item_id} is below minimum ${campaignItem.min_qty}` },
          { status: 400 }
        );
      }
      
      if (item.qty % campaignItem.pack_size !== 0) {
        return NextResponse.json(
          { error: `Quantity for item ${item.campaign_item_id} must be a multiple of ${campaignItem.pack_size}` },
          { status: 400 }
        );
      }
    }
    
    // 5. Рассчитываем total
    const total = items.reduce((sum: number, item: any) => {
      const campaignItem = campaignItems.find(ci => ci.id === item.campaign_item_id);
      return sum + (campaignItem ? campaignItem.price * item.qty : 0);
    }, 0);
    
    // 6. Проверяем существует ли уже предзаказ
    let campaignOrder;
    
    const existingOrderQuery = supabase
      .from('campaign_orders')
      .select('id, status')
      .eq('campaign_id', campaignId);
    
    if (user) {
      existingOrderQuery.eq('client_id', user.id);
    } else {
      existingOrderQuery.eq('guest_phone', guest_phone);
    }
    
    const { data: existingOrders } = await existingOrderQuery.limit(1);
    
    if (existingOrders && existingOrders.length > 0) {
      const existingOrder = existingOrders[0];
      
      // Если уже confirmed, не даём изменять
      if (existingOrder.status === 'confirmed') {
        return NextResponse.json(
          { error: 'Cannot modify confirmed order' },
          { status: 400 }
        );
      }
      
      // Обновляем существующий заказ
      const { data: updatedOrder, error: updateError } = await supabase
        .from('campaign_orders')
        .update({
          total,
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingOrder.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('Error updating campaign order:', updateError);
        return NextResponse.json(
          { error: 'Failed to update order' },
          { status: 500 }
        );
      }
      
      campaignOrder = updatedOrder;
      
      // Удаляем старые позиции
      await supabase
        .from('campaign_order_items')
        .delete()
        .eq('campaign_order_id', campaignOrder.id);
      
    } else {
      // Создаём новый предзаказ
      const { data: newOrder, error: createError } = await supabase
        .from('campaign_orders')
        .insert({
          campaign_id: campaignId,
          client_id: user?.id || null,
          guest_phone: guest_phone || null,
          guest_name: guest_name || null,
          status: 'pending',
          total
        })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating campaign order:', createError);
        return NextResponse.json(
          { error: 'Failed to create order', details: createError.message },
          { status: 500 }
        );
      }
      
      campaignOrder = newOrder;
    }
    
    // 7. Добавляем позиции
    const orderItems = items.map((item: any) => {
      const campaignItem = campaignItems.find(ci => ci.id === item.campaign_item_id);
      return {
        campaign_order_id: campaignOrder.id,
        campaign_item_id: item.campaign_item_id,
        qty: item.qty,
        price: campaignItem?.price || 0
      };
    });
    
    const { error: itemsInsertError } = await supabase
      .from('campaign_order_items')
      .insert(orderItems);
    
    if (itemsInsertError) {
      console.error('Error inserting campaign order items:', itemsInsertError);
      
      // Откатываем - удаляем заказ
      await supabase
        .from('campaign_orders')
        .delete()
        .eq('id', campaignOrder.id);
      
      return NextResponse.json(
        { error: 'Failed to add order items' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      campaign_order: campaignOrder,
      message: 'Order created successfully'
    }, { status: 201 });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/campaigns/[id]/order - отменить предзаказ
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
    
    // Находим предзаказ
    const { data: order } = await supabase
      .from('campaign_orders')
      .select('id, status, campaign_id')
      .eq('campaign_id', campaignId)
      .eq('client_id', user.id)
      .single();
    
    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }
    
    // Проверяем что кампания ещё открыта
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('closes_at')
      .eq('id', campaignId)
      .single();
    
    if (campaign && new Date(campaign.closes_at) < new Date()) {
      return NextResponse.json(
        { error: 'Cannot cancel order - campaign has closed' },
        { status: 400 }
      );
    }
    
    // Меняем статус на cancelled (не удаляем физически)
    const { error: updateError } = await supabase
      .from('campaign_orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id);
    
    if (updateError) {
      console.error('Error cancelling order:', updateError);
      return NextResponse.json(
        { error: 'Failed to cancel order' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      message: 'Order cancelled successfully'
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
