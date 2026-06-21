interface OrderDetails {
  orderId: string
  clientName: string
  clientPhone: string
  companyName?: string
  total: number
  items: Array<{ name: string; qty: number; price: number }>
  adminUrl: string
}

interface ManagerStatusDetails {
  orderId: string
  managerName: string
  clientName?: string
  companyName?: string
  total: number
  items?: Array<{ name: string; qty: number }>
}

export const umnicoTemplates = {
  newOrderToManager: (details: OrderDetails): string => {
    const itemsList = details.items
      .map(item => `• ${item.name} — ${item.qty} шт × ${item.price.toLocaleString('ru-RU')} ₸`)
      .join('\n')

    return `🆕 ЗАКАЗ #${details.orderId}
👤 ${details.clientName}${details.companyName ? ` | ${details.companyName}` : ''}
📞 ${details.clientPhone}
${itemsList}
💰 ${details.total.toLocaleString('ru-RU')} ₸ | Резерв 30 мин
🔗 ${details.adminUrl}`
  },

  // Оплата (создание сделки)
  orderPaidToClient: (orderId: string): string =>
    `✅ Заказ #${orderId} оплачен. Спасибо! Принят в работу, скоро подтвердим. _Цветы Уральска_`,

  // confirmed (Подтверждён)
  orderConfirmedToClient: ({ orderId }: { orderId: string }): string =>
    `✅ Заказ #${orderId} подтверждён, собираем. _Цветы Уральска_`,

  orderConfirmedToManager: ({ orderId, managerName, clientName, companyName, total }: ManagerStatusDetails): string =>
    `✅ Заказ #${orderId} подтверждён
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName} | 💰 ${total.toLocaleString('ru-RU')} ₸`,

  // assembled (Готово) — ветвится по способу получения. Фото заказа прикрепляется отдельно (sendImage).
  orderAssembledPickupToClient: ({ orderId }: { orderId: string }): string =>
    `📦 Заказ #${orderId} собран и готов к выдаче! Забрать: г. Уральск, ул. Каримуллина, 11. Часы: пн–пт 9:00–18:00, сб–вс 10:00–17:00. Назовите номер заказа. _Цветы Уральска_`,

  orderAssembledDeliveryToClient: ({ orderId }: { orderId: string }): string =>
    `📦 Заказ #${orderId} собран! Передаём в доставку, сообщим, когда выедет курьер. _Цветы Уральска_`,

  orderPackedToManager: ({ orderId, managerName, clientName, companyName, total }: ManagerStatusDetails): string =>
    `📦 Заказ #${orderId} собран
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName} | 💰 ${total.toLocaleString('ru-RU')} ₸`,

  // in_transit (На доставке) — пустые строки скрываются
  orderOnDeliveryToClient: ({ orderId, driverName, driverPhone, driverCarPlate, deliveryDate }: {
    orderId: string
    driverName?: string | null; driverPhone?: string | null
    driverCarPlate?: string | null; deliveryDate?: string | null
  }): string => {
    const lines = [
      `🚚 Заказ #${orderId} в пути!`,
      driverName     ? `Водитель: ${driverName}` : '',
      driverPhone    ? `Телефон: ${driverPhone}` : '',
      driverCarPlate ? `Авто: ${driverCarPlate}` : '',
      deliveryDate   ? `Ожидайте к ${deliveryDate}.` : '',
    ].filter(Boolean)
    return `${lines.join('\n')} _Цветы Уральска_`
  },

  // delivered (Выдан)
  orderDeliveredToClient: ({ orderId }: { orderId: string }): string =>
    `🎉 Заказ #${orderId} выдан. Спасибо, что выбрали нас! Будем рады видеть снова. _Цветы Уральска_`,

  orderDeliveredToManager: ({ orderId, managerName, clientName, companyName, total, items }: ManagerStatusDetails): string => {
    const itemsList = items?.length
      ? '\n' + items.map(i => `• ${i.name} — ${i.qty} шт`).join('\n')
      : ''
    return `🎉 Заказ #${orderId} выдан
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName}${itemsList}
💰 ${total.toLocaleString('ru-RU')} ₸`
  },

  // cancelled (Отменён)
  orderCancelledToClient: ({ orderId }: { orderId: string }): string =>
    `❌ Заказ #${orderId} отменён. Если это ошибка — напишите нам. _Цветы Уральска_`,
}

export function authPinToClient(clientName: string, pin: string): string {
  return `Здравствуйте${clientName ? ', ' + clientName : ''}!

Ваш PIN-код для входа в каталог цветов: *${pin}*

Код действителен 30 минут.
⚠️ Никому не сообщайте этот код.

—
🌸 Цветы Уральска
📞 +7 (747) 610-84-58`
}
