import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { getCityDeliveryFee, computeDeliveryCost } from '@/lib/delivery'
import { computeOrderTotal } from '@/lib/order-total'
import { umnicoClient } from '@/lib/umnico/client'
import { authPinToClient } from '@/lib/umnico/templates'
import { createOrderAccessToken } from '@/lib/order-access-token'

export const dynamic = 'force-dynamic'

const genPin = () => String(Math.floor(100000 + Math.random() * 900000))

export async function POST(req: NextRequest) {
  // Без service-role ключа admin-клиент деградирует до anon и RLS молча режет вставку
  // позиций → заказ-сирота без order_items. Явный отказ лучше тихого пустого заказа
  // (именно это валило оформление на preview, где ключа нет).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[checkout] SUPABASE_SERVICE_ROLE_KEY отсутствует — оформление отклонено, заказ НЕ создаётся')
    return NextResponse.json({ error: 'Оформление временно недоступно (конфигурация сервера)' }, { status: 503 })
  }
  const supabase = createAdminClient()

  const { items, phone, name, delivery, recipient, payment_method } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
  const normalizedPhone = normalizePhone(phone)
  const phoneDigits = normalizedPhone.replace('+', '')

  // Find or create client by phone
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id, name, company_name, pin, auth_user_id, city')
    .or(`phone.eq.${normalizedPhone},phone.eq.${phoneDigits}`)
    .maybeSingle()

  let clientId: string
  let clientName: string | null = null
  let companyName: string | null = null
  let clientPin: string | null = null
  let clientAuthUserId: string | null = null
  const submittedName = typeof name === 'string' && name.trim() ? name.trim() : null
  const submittedCity =
    delivery?.method === 'delivery' && typeof delivery?.city === 'string' && delivery.city.trim()
      ? delivery.city.trim()
      : null

  if (existingClient) {
    clientId = existingClient.id
    clientName = existingClient.name
    companyName = (existingClient as any).company_name ?? null
    clientPin = (existingClient as any).pin ?? null
    clientAuthUserId = (existingClient as any).auth_user_id ?? null
    const updateData: Record<string, unknown> = {}
    if (submittedName && submittedName !== clientName) {
      updateData.name = submittedName
      clientName = submittedName
    }
    if (submittedCity && !(existingClient as any).city) {
      updateData.city = submittedCity
    }
    if (!clientPin) {
      clientPin = genPin()
      updateData.pin = clientPin
    }
    if (Object.keys(updateData).length > 0) {
      await supabase.from('clients').update(updateData).eq('id', clientId)
    }
  } else {
    clientPin = genPin()
    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert({ phone: normalizedPhone, name: submittedName, city: submittedCity, pin: clientPin })
      .select('id, auth_user_id')
      .single()
    if (!newClient) return NextResponse.json({ error: 'Failed to create client', detail: clientError?.message }, { status: 500 })
    clientId = newClient.id
    clientName = submittedName
    clientAuthUserId = (newClient as any).auth_user_id ?? null
  }

  await ensureClientAuthUser({
    supabase,
    clientId,
    phone: normalizedPhone,
    phoneDigits,
    pin: clientPin,
    name: clientName,
    companyName,
    existingAuthUserId: clientAuthUserId,
  })

  // Первый заказ клиента — условие скидки 1% (см. order-total.ts). Черновики-счета
  // (status='cart', ещё не подтверждённые как реальный заказ) не считаются.
  const { count: priorOrdersCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .neq('status', 'cart')
  const isFirstOrder = (priorOrdersCount ?? 0) === 0

  const now = new Date().toISOString()
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  // Цвет — ярлык, не SKU: остаток/резерв считаем суммарно по product_id.
  // Несколько цветных строк одного товара = одна бронь на товар (цвет в резерв не идёт).
  const qtyByProduct = new Map<number, number>()
  const nameById = new Map<number, string>()
  for (const it of items as any[]) {
    qtyByProduct.set(it.id, (qtyByProduct.get(it.id) ?? 0) + it.qty)
    if (!nameById.has(it.id)) nameById.set(it.id, it.name)
  }

  // Check availability: products.qty minus other clients' reservations
  const reserveErrors: string[] = []
  let hasPotItem = false
  for (const [productId, wantQty] of qtyByProduct) {
    const { data: product } = await supabase
      .from('products')
      .select('qty, site_qty, category')
      .eq('id', productId)
      .single()

    if (!product) {
      reserveErrors.push(`${nameById.get(productId) ?? productId}: товар не найден`)
      continue
    }
    if ((product as any).category === 'pot') hasPotItem = true

    const { data: otherRes } = await supabase
      .from('reservations')
      .select('qty')
      .eq('product_id', productId)
      .gt('expires_at', now)
      .neq('client_id', clientId)

    const othersReserved = (otherRes ?? []).reduce((s: number, r: any) => s + r.qty, 0)
    const stockQty = Math.max(Number(product.qty) || 0, Number((product as any).site_qty) || 0)
    const available = stockQty - othersReserved
    if (wantQty > available) {
      reserveErrors.push(`${nameById.get(productId) ?? productId}: доступно только ${available} шт`)
    }
  }
  if (reserveErrors.length > 0) {
    return NextResponse.json({ error: reserveErrors.join(', ') }, { status: 409 })
  }

  // Доставка считается на сервере (клиенту не доверяем). По городу — фикс из
  // app_settings.city_delivery_fee; межгород → 10% от суммы товаров; самовывоз → 0.
  // Сумма товаров нужна ДО расчёта доставки — считаем её отдельным проходом (deliveryCost=0),
  // затем пересчитываем итог уже с реальной доставкой.
  const { rawTotal: goodsSum } = computeOrderTotal({
    items,
    fulfillmentType: delivery?.method,
    deliveryCity: delivery?.city,
    deliveryCost: 0,
    isFirstOrder,
  })
  const cityFee = await getCityDeliveryFee(supabase)
  // Первый заказ клиента — доставка бесплатно (любой город). Повторная наценка (2000 ₸
  // Уральск / 10% межгород) — только на повторные заказы.
  const deliveryCost = computeDeliveryCost(delivery?.method, delivery?.city, cityFee, goodsSum, isFirstOrder)

  // Сумма + скидка 1% для Уральска (самовывоз или доставка по городу) на первый заказ
  // клиента. Единый расчёт (общий с правкой состава в пульте оператора). Сервер —
  // источник суммы к оплате: payments/init берёт order.total.
  const { rawTotal, discountPct, goodsTotal, total } = computeOrderTotal({
    items,
    fulfillmentType: delivery?.method,
    deliveryCity: delivery?.city,
    deliveryCost,
    isFirstOrder,
  })

  // Заметка для менеджера: способ получения, получатель, скидка (флоу чекаута)
  const noteLines: string[] = []
  if (delivery?.method === 'pickup') {
    noteLines.push('Получение: Самовывоз (склад Уральск, ул. Каримуллина, 11)')
  } else if (delivery?.method === 'delivery') {
    noteLines.push(`Получение: Доставка${delivery.city ? ` — ${delivery.city}` : ''}`)
    if (delivery.date)    noteLines.push(`Желаемая дата: ${delivery.date}`)
    if (delivery.address) noteLines.push(`Адрес: ${delivery.address}`)
    if (delivery.comment) noteLines.push(`Комментарий курьеру: ${delivery.comment}`)
    const isIntercity = delivery.city && delivery.city.trim() !== 'Уральск'
    noteLines.push(deliveryCost === 0 && isFirstOrder
      ? 'Стоимость доставки: 0 ₸ (первый заказ клиента — бесплатно)'
      : `Стоимость доставки: ${deliveryCost.toLocaleString('ru-RU')} ₸${isIntercity ? ' (10% от суммы товаров)' : ''}`)
  }
  if (recipient) {
    const r = [recipient.name, recipient.phone, recipient.email].filter(Boolean).join(', ')
    if (r) noteLines.push(`Получатель: ${r}`)
  }
  if (discountPct > 0) {
    noteLines.push(`Скидка ${discountPct}% (Уральск): −${(rawTotal - goodsTotal).toLocaleString('ru-RU')} ₸`)
  }

  // Горшечные (category='pot'): оплата картой на checkout НЕ запускается — заказ уходит
  // менеджеру как заявка, требующая звонка/WhatsApp клиенту ДО оплаты (решение владельца
  // 24.09.2026). «По счёту» (isInvoice) — отдельный, уже существующий документ-флоу для
  // юр.лиц, его не трогаем: если клиент выбрал счёт, ведём его как обычно.
  const isInvoice = payment_method === 'invoice'
  const isPotConfirmationOrder = hasPotItem && !isInvoice
  if (isPotConfirmationOrder) {
    noteLines.unshift('⚠️ ГОРШЕЧНЫЕ — заявка требует подтверждения оператором (звонок/WhatsApp клиенту), оплата не производилась при оформлении')
  }
  const notes = noteLines.length ? noteLines.join('\n') : null

  // Структурные поля доставки/получателя (машинно разбираемые) — параллельно с notes.
  // delivery_cost: город → фикс, межгород → 10% от суммы товаров, самовывоз → 0.
  // driver_* при создании не заполняем (их вносит менеджер позже).
  const clean = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s === '' ? null : s
  }
  const isDelivery = delivery?.method === 'delivery'
  const structured = {
    fulfillment_type: clean(delivery?.method),
    delivery_city:    isDelivery ? clean(delivery?.city) : null,
    delivery_address: isDelivery ? clean(delivery?.address) : null,
    delivery_date:    isDelivery ? clean(delivery?.date) : null,
    courier_comment:  isDelivery ? clean(delivery?.comment) : null,
    delivery_cost:    deliveryCost,
    recipient_name:   clean(recipient?.name),
    recipient_phone:  clean(recipient?.phone),
  }

  // «По счёту» — это ДОКУМЕНТ-предложение, а не заказ/сделка. Поэтому ветка invoice
  // создаёт заказ-черновик (status='cart'): он СКРЫТ из обеих панелей оператора, НЕ
  // резервирует склад и НЕ синкается в amoCRM как продажа. Заказ становится «реальным»
  // (cart→pending) + появляется в панели + двигается в воронке только при подтверждении
  // оплаты (postlink/ручное/OnlineDuken). epay/card/cash — без изменений (status='pending').
  // (isInvoice/isPotConfirmationOrder вычислены выше — до notes, т.к. notes от них зависят)

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      client_id: clientId,
      status: isInvoice ? 'cart' : 'pending',
      total,
      ...structured,
      ...(notes ? { notes } : {}),
      // Горшечная заявка: payment_method НЕ фиксируем при создании (клиент реально не
      // платил) — иначе order выглядел бы как «оплата картой зависла», как обычный
      // брошенный ePay-платёж (см. разбор от 24.09.2026). Метод оплаты оператор проставит
      // сам, когда подтвердит заказ с клиентом.
      ...(payment_method && !isPotConfirmationOrder ? { payment_method } : {}),
    })
    .select()
    .single()
  if (!order) return NextResponse.json({ error: 'Failed to create order', detail: orderError?.message }, { status: 500 })
  const orderId = (order as any).id

  // Атомарность: позиции обязательны. Если вставка упала (RLS/нет ключа/битая строка) —
  // не глотаем молча, а откатываем заказ и возвращаем реальную ошибку, чтобы сбой был
  // громким (заказ не создаётся), а не оставлял пустой заказ-сироту.
  const { error: itemsError } = await supabase.from('order_items').insert(
    items.map((i: any) => ({ order_id: orderId, product_id: i.id, qty: i.qty, price: i.price, color: i.color ?? null }))
  )
  if (itemsError) {
    console.error(`[checkout] order_items insert FAILED for order ${orderId} — откатываю заказ:`, itemsError.message)
    await supabase.from('orders').delete().eq('id', orderId)
    return NextResponse.json(
      { error: 'Не удалось сохранить позиции заказа', detail: itemsError.message },
      { status: 500 },
    )
  }

  // amoCRM sync (non-fatal — ошибка не роняет заказ).
  // Ветка invoice: сделка создаётся на стадии «Счёт выставлен» (документ, не продажа),
  // с тегом. На «Новый» её двигает подтверждение оплаты. Прочие способы — на «Новый», как было.
  try {
    const { syncOrderToAmo, AMO_STATUS_INVOICE_ISSUED } = await import('@/lib/amo')
    await syncOrderToAmo(orderId, isInvoice
      ? { statusId: AMO_STATUS_INVOICE_ISSUED, extraTags: ['Счёт выставлен'] }
      : isPotConfirmationOrder
        ? { extraTags: ['Горшечные — требует подтверждения'] }
        : {})
  } catch (err) {
    console.error('[checkout] amoCRM sync failed:', err instanceof Error ? err.message : err)
  }

  // Резерв остатков: только для реальных заказов. Счёт-документ склад НЕ держит.
  if (!isInvoice) {
    // Create reservations (replace any existing client reservations for these products).
    // По product_id с суммарным qty — цвет в резерв не входит.
    for (const [productId, totalQty] of qtyByProduct) {
      await supabase.from('reservations').delete()
        .eq('product_id', productId)
        .eq('client_id', clientId)

      await supabase.from('reservations').insert({
        product_id: productId,
        qty: totalQty,
        client_id: clientId,
        expires_at,
        order_id: orderId,
      })
    }
  }

  // Горшечная заявка: обычной цепочки postlink (уведомление после оплаты) для этого
  // заказа НИКОГДА не будет — оплата не запускается. Шлём менеджеру+кладовщику сразу,
  // с составом заказа и контактами клиента, как договорено с владельцем 24.09.2026.
  if (isPotConfirmationOrder && process.env.UMNICO_API_TOKEN) {
    try {
      const { notifyOrderChain } = await import('@/lib/umnico/client')
      const { umnicoTemplates } = await import('@/lib/umnico/templates')
      await notifyOrderChain(
        umnicoTemplates.newConfirmationOrderToManager({
          orderId: String(orderId),
          clientName: clientName || normalizedPhone,
          clientPhone: normalizedPhone,
          companyName: companyName ?? undefined,
          total,
          items: (items as any[]).map(i => ({ name: i.name, color: i.color ?? null, qty: i.qty, price: i.price })),
          adminUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://uralskflowers.kz'}/admin`,
        })
      )
    } catch (err) {
      console.error('[checkout] pot confirmation notify failed:', err instanceof Error ? err.message : err)
    }
  }

  // PIN отправляем после успешного создания заказа: оформление не блокируется входом.
  let pinDelivered = false
  if (clientPin) {
    try {
      if (await umnicoClient.checkContact(phoneDigits)) {
        pinDelivered = await umnicoClient.sendMessage(phoneDigits, authPinToClient(clientName || '', clientPin))
      }
    } catch (err) {
      console.error('[checkout] pin send failed:', err instanceof Error ? err.message : err)
    }
  }

  // Уведомления менеджеру по обычным заказам (card/epay/cash/invoice) — НЕ здесь, только
  // после подтверждения оплаты в /api/payments/postlink. Горшечная заявка — исключение,
  // отправлена выше (isPotConfirmationOrder): для неё postlink никогда не наступит.

  const orderAccessToken = createOrderAccessToken({ orderId: Number(orderId), clientId, phone: normalizedPhone })

  return NextResponse.json({
    success: true,
    order_id: orderId,
    pending_confirmation: isPotConfirmationOrder,
    expires_at,
    pin_delivered: pinDelivered,
    order_access_token: orderAccessToken,
  })
}

async function ensureClientAuthUser(opts: {
  supabase: ReturnType<typeof createAdminClient>
  clientId: string
  phone: string
  phoneDigits: string
  pin: string | null
  name: string | null
  companyName: string | null
  existingAuthUserId: string | null
}): Promise<string | null> {
  if (!opts.pin) return opts.existingAuthUserId

  const email = `${opts.phoneDigits}@flowers.local`

  if (opts.existingAuthUserId) {
    const { error } = await opts.supabase.auth.admin.updateUserById(opts.existingAuthUserId, { password: opts.pin })
    if (!error) return opts.existingAuthUserId
    console.error('[checkout] update auth user pin failed:', error.message)
  }

  const { data: profile } = await opts.supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (profile?.id) {
    const { error } = await opts.supabase.auth.admin.updateUserById(profile.id, { password: opts.pin })
    if (error) console.error('[checkout] sync existing auth user pin failed:', error.message)
    await opts.supabase.from('clients').update({ auth_user_id: profile.id }).eq('id', opts.clientId)
    return profile.id as string
  }

  const { data: created, error: createError } = await opts.supabase.auth.admin.createUser({
    email,
    password: opts.pin,
    email_confirm: true,
    user_metadata: { phone: opts.phone },
  })

  if (createError || !created?.user) {
    console.error('[checkout] create auth user failed:', createError?.message)
    return null
  }

  const userId = created.user.id
  await Promise.all([
    opts.supabase.from('profiles').upsert({
      id: userId,
      email,
      role: 'client',
      full_name: opts.name || '',
      phone: opts.phone,
      company_name: opts.companyName || '',
    }, { onConflict: 'id' }),
    opts.supabase.from('clients').update({ auth_user_id: userId }).eq('id', opts.clientId),
  ])

  return userId
}
