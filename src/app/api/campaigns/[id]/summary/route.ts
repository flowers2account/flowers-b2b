import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';

// GET /api/campaigns/[id]/summary - получить сводный заказ поставщику
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
    
    // Получаем сводку из VIEW
    const { data: summary } = await supabase
      .from('campaign_summary')
      .select('*')
      .eq('campaign_id', campaignId)

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
    
    // Считаем итоги
    const totalQty = summary?.reduce((sum, r: any) => sum + (r.total_qty_ordered || 0), 0) || 0
    const totalAmount = summary?.reduce((sum, r: any) => sum + (r.price * r.total_qty_ordered || 0), 0) || 0

    const uniqueClients = new Set<string>()
    summary?.forEach((row: any) => {
      row.orders_breakdown?.forEach((o: any) => {
        if (o.client_id) uniqueClients.add(o.client_id)
        else if (o.client_name) uniqueClients.add(o.client_name)
      })
    })

    const totals = {
      total_items: summary?.length || 0,
      total_qty: totalQty,
      total_amount: totalAmount,
      total_clients: uniqueClients.size
    }

    return NextResponse.json({ campaign, summary, totals });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
