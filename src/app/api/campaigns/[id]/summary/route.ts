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
      const rows = summary || []

      // 1. Собираем уникальных клиентов из всех orders_breakdown
      const clientSet = new Map<string, string>() // key → display name
      rows.forEach((row: any) => {
        row.orders_breakdown?.forEach((o: any) => {
          const key = o.client_id ?? o.client_name ?? 'unknown'
          if (!clientSet.has(key)) clientSet.set(key, o.client_name || o.client_id || 'Клиент')
        })
      })
      const clientKeys = Array.from(clientSet.keys())
      const clientNames = clientKeys.map(k => clientSet.get(k)!)

      // 2. Заголовок
      const header = ['Товар', ...clientNames, 'ИТОГО']

      // 3. Строки по товарам
      const dataRows = rows.map((row: any) => {
        const productLabel = [row.product_name, row.variety_name, row.length_str]
          .filter(Boolean).join(' ')

        const qtyByClient: Record<string, number> = {}
        row.orders_breakdown?.forEach((o: any) => {
          const key = o.client_id ?? o.client_name ?? 'unknown'
          qtyByClient[key] = (qtyByClient[key] || 0) + (o.qty || 0)
        })

        const clientQtys = clientKeys.map(k => qtyByClient[k] || 0)
        const rowTotal = clientQtys.reduce((s, v) => s + v, 0)

        return [productLabel, ...clientQtys, rowTotal]
      })

      // 4. Итоговая строка
      const totalRow = ['ИТОГО']
      for (let i = 0; i < clientKeys.length; i++) {
        totalRow.push(String(dataRows.reduce((s, r) => s + (r[i + 1] as number), 0)))
      }
      totalRow.push(String(dataRows.reduce((s, r) => s + (r[r.length - 1] as number), 0)))

      const sheetData = [header, ...dataRows.map(r => r.map(String)), totalRow]
      const sheet = XLSX.utils.aoa_to_sheet(sheetData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, 'Сводный заказ')

      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      return new NextResponse(excelBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="campaign_${campaignId}_summary.xlsx"`
        }
      })
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
