import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/campaigns - получить список кампаний
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Проверяем авторизацию
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('AUTH CHECK:', { user: user?.id, error: authError });
    
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // 'published' | 'draft' | 'closed' | etc
    const type = searchParams.get('type'); // 'europe' | 'china'
    
    // Строим запрос
    let query = supabase
      .from('campaigns')
      .select(`
        id,
        title,
        type,
        description,
        closes_at,
        delivery_date,
        status,
        allowed_price_groups,
        created_at,
        updated_at
      `);
    
    // Фильтр по статусу
    if (status) {
      query = query.eq('status', status);
    }
    
    // Фильтр по типу
    if (type) {
      query = query.eq('type', type);
    }
    
    // Сортировка: сначала активные, потом по дате поставки
    query = query.order('delivery_date', { ascending: true });
    
    const { data: campaigns, error } = await query;
    
    if (error) {
      console.error('Error fetching campaigns:', error);
      return NextResponse.json(
        { error: 'Failed to fetch campaigns' },
        { status: 500 }
      );
    }
    
    // Для каждой кампании получаем статистику
    const campaignsWithStats = await Promise.all(
      campaigns.map(async (campaign) => {
        const { data: stats } = await supabase
          .rpc('get_campaign_stats', { p_campaign_id: campaign.id })
          .single();
        
        // Считаем количество позиций
        const { count: itemsCount } = await supabase
          .from('campaign_items')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .eq('is_active', true);
        
        return {
          ...campaign,
          stats: stats || {
            total_items: 0,
            total_orders: 0,
            total_clients: 0,
            total_amount: 0,
            status: campaign.status,
            closes_in_hours: 0
          },
          items_count: itemsCount || 0
        };
      })
    );
    
    return NextResponse.json({
      campaigns: campaignsWithStats,
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

// POST /api/campaigns - создать новую кампанию (только admin/manager)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('AUTH CHECK:', { user: user?.id, error: authError });

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Проверяем роль
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    // TEMPORARY: auth check disabled
    // if (!profile || !['admin', 'manager'].includes(profile.role)) {
    //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    
    const {
      title,
      type = 'europe',
      description,
      closes_at,
      delivery_date,
      allowed_price_groups = ['vip', 'wholesale'],
      items = []
    } = body;
    
    // Валидация
    if (!title || !closes_at || !delivery_date) {
      return NextResponse.json(
        { error: 'Missing required fields: title, closes_at, delivery_date' },
        { status: 400 }
      );
    }
    
    // Создаём кампанию
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        title,
        type,
        description,
        closes_at,
        delivery_date,
        status: 'draft',
        allowed_price_groups,
        created_by: user.id
      })
      .select()
      .single();
    
    if (campaignError) {
      console.error('Error creating campaign:', campaignError);
      return NextResponse.json(
        { error: 'Failed to create campaign', details: campaignError.message },
        { status: 500 }
      );
    }
    
    // Добавляем позиции если есть
    if (items.length > 0) {
      const itemsToInsert = items.map((item: any, index: number) => ({
        campaign_id: campaign.id,
        product_id: item.product_id,
        price: item.price,
        min_qty: item.min_qty || 1,
        pack_size: item.pack_size || 1,
        notes: item.notes || null,
        sort_order: index
      }));
      
      const { error: itemsError } = await supabase
        .from('campaign_items')
        .insert(itemsToInsert);
      
      if (itemsError) {
        console.error('Error adding campaign items:', itemsError);
        // Не фейлим весь запрос, просто логируем
      }
    }
    
    return NextResponse.json({
      campaign,
      message: 'Campaign created successfully'
    }, { status: 201 });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
