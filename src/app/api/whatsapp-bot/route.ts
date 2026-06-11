import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { umnicoClient } from '@/lib/umnico/client'

export const dynamic = 'force-dynamic'

const TEST_PHONE = '77476108458'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const phone = body.phone?.replace(/\D/g, '') as string
    const text = (body.text ?? '') as string

    console.log('WhatsApp webhook:', { phone, text: text.slice(0, 80) })

    if (phone !== TEST_PHONE) {
      console.log('Не тестовый номер, пропускаем:', phone)
      return NextResponse.json({ ok: true })
    }

    const t = text.toLowerCase().trim()

    if (/остатки|остаток/.test(t)) {
      const query = t.replace(/остатки|остаток/, '').trim()
      await handleSearchProduct(phone, query)
    } else if (/мой заказ|заказ|статус/.test(t)) {
      await handleMyOrder(phone)
    } else if (/баланс/.test(t)) {
      await umnicoClient.sendMessage(phone,
        '💰 Баланс\n\nФункция в разработке.\nОбратитесь к менеджеру: +7 747 610 8458'
      )
    } else if (/помощь|help|команды/.test(t)) {
      await handleHelp(phone)
    } else {
      await umnicoClient.sendMessage(phone,
        '❓ Не понял команду.\n\nНапишите *помощь* для списка команд.'
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Ошибка бота:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function handleSearchProduct(phone: string, query: string) {
  if (!query) {
    await umnicoClient.sendMessage(phone,
      '🔍 Укажите название товара.\n\nПример: *остатки роза*'
    )
    return
  }

  const supabase = createAdminClient()
  const { data: products } = await supabase
    .from('products')
    .select('id, name, stock(qty, price)')
    .ilike('name', `%${query}%`)
    .limit(10)

  if (!products?.length) {
    await umnicoClient.sendMessage(phone, `🔍 По запросу "${query}" ничего не найдено.`)
    return
  }

  let message = `🌸 Остатки по "${query}":\n\n`
  products.forEach((p: any, i: number) => {
    const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock
    const qty: number = stock?.qty ?? 0
    const price: number = stock?.price ?? 0
    message += `${i + 1}. ${p.name}\n`
    message += `   💰 ${price.toLocaleString('ru-RU')} ₸ | 📦 ${qty} шт ${qty > 0 ? '✅' : '❌'}\n\n`
  })

  message += `_Цветы Уральска_`
  await umnicoClient.sendMessage(phone, message)
}

async function handleMyOrder(phone: string) {
  const supabase = createAdminClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('phone', `+${phone}`)
    .maybeSingle()

  if (!client) {
    await umnicoClient.sendMessage(phone,
      '❌ Клиент не найден.\n\nОбратитесь к менеджеру: +7 747 610 8458'
    )
    return
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, total, created_at, assembly_photo_url, order_items(qty, qty_actual, price, product:product_id(name))')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!order) {
    await umnicoClient.sendMessage(phone, '📦 У вас пока нет заказов.\n\n_Цветы Уральска_')
    return
  }

  const statusMap: Record<string, string> = {
    pending:    'Создан',
    reserved:   'В обработке',
    confirmed:  'Подтверждён',
    assembling: 'Собирается',
    assembled:  'Готов к выдаче',
    delivered:  'Выдан',
    cancelled:  'Отменён',
  }

  const date = new Date(order.created_at).toLocaleString('ru-RU', {
    timeZone: 'Asia/Oral', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })

  let message = `📦 Заказ #${order.id}\n`
  message += `Статус: ${statusMap[order.status] ?? order.status}\n`
  message += `Сумма: ${(order.total as number).toLocaleString('ru-RU')} ₸\n`
  message += `Дата: ${date}\n\n`

  const items = (order.order_items as any[]).filter(i => !i.is_removed)
  if (items.length) {
    message += 'Состав:\n'
    items.forEach(i => {
      const qty = i.qty_actual ?? i.qty
      message += `• ${(i.product as any)?.name ?? 'Товар'} — ${qty} шт\n`
    })
  }

  if (order.assembly_photo_url) {
    message += `\n📸 ${order.assembly_photo_url}\n`
  }

  message += `\n📍 ул. Каримуллина, 11 | Пн-Пт 8:00-18:00, Сб 9:00-15:00\n_Цветы Уральска_`

  await umnicoClient.sendMessage(phone, message)
}

async function handleHelp(phone: string) {
  await umnicoClient.sendMessage(phone,
    `🌸 Доступные команды:\n\n` +
    `🔍 *остатки [название]* — проверить наличие\n` +
    `   Пример: остатки роза\n\n` +
    `📦 *мой заказ* — последний заказ и статус\n\n` +
    `💰 *баланс* — ваш баланс\n\n` +
    `❓ *помощь* — эта справка\n\n` +
    `По вопросам: 📞 +7 747 610 8458\n_Цветы Уральска_`
  )
}
