import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

// GET /api/campaigns/[id]/summary - получить сводный заказ поставщику
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const campaignId = parseInt(params.id);
    
    if (isNaN(campaignId)) {
      return NextResponse.json(
        { error: 'Invalid campaign ID' },
        { status: 400 }
      );
    }
    
    // Проверяем авторизацию (только admin/manager)
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (!profile || !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Only admin/manager can view summary' },
        { status: 403 }
      );
    }
    
    // Получаем информацию о кампании
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, title, type, delivery_date, status')
      .eq('id', campaignId)
      .single();
    
    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }
    
    // Получаем сводный заказ
    const { data: summary, error: summaryError } = await supabase
      .rpc('get_campaign_summary', { p_campaign_id: campaignId });
    
    if (summaryError) {
      console.error('Error fetching campaign summary:', summaryError);
      return NextResponse.json(
        { error: 'Failed to fetch summary' },
        { status: 500 }
      );
    }
    
    // Проверяем формат ответа
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format'); // 'json' | 'excel'
    
    if (format === 'excel') {
      // Формируем Excel файл
      const workbook = XLSX.utils.book_new();
      
      // Лист 1: Сводный заказ поставщику
      const summaryData = summary.map((row: any) => ({
        'Название': row.product_name,
        'Сорт': row.variety_name || '',
        'Длина': row.length_str || '',
        'Цена': row.price,
        'Кратность': row.pack_size,
        'Заказано всего': row.total_qty_ordered,
        'Клиентов': row.total_orders
      }));
      
      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводный заказ');
      
      // Лист 2: Разбивка по клиентам
      const breakdownData: any[] = [];
      
      summary.forEach((row: any) => {
        if (row.orders_breakdown && Array.isArray(row.orders_breakdown)) {
          row.orders_breakdown.forEach((order: any) => {
            breakdownData.push({
              'Товар': row.product_name,
              'Клиент': order.client_name,
              'Количество': order.qty,
              'Цена': row.price,
              'Сумма': order.qty * row.price
            });
          });
        }
      });
      
      const breakdownSheet = XLSX.utils.json_to_sheet(breakdownData);
      XLSX.utils.book_append_sheet(workbook, breakdownSheet, 'По клиентам');
      
      // Конвертируем в buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      return new NextResponse(excelBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="campaign_${campaignId}_summary.xlsx"`
        }
      });
    }
    
    // Формат JSON (по умолчанию)
    return NextResponse.json({
      campaign,
      summary,
      totals: {
        total_items: summary.length,
        total_qty: summary.reduce((sum: number, row: any) => sum + row.total_qty_ordered, 0),
        total_amount: summary.reduce((sum: number, row: any) => {
          return sum + (row.total_qty_ordered * row.price);
        }, 0),
        total_clients: new Set(
          summary.flatMap((row: any) => 
            row.orders_breakdown?.map((o: any) => o.client_id) || []
          )
        ).size
      }
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
