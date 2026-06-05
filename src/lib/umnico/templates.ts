interface OrderDetails {
  orderId: string
  clientName: string
  clientPhone: string
  companyName?: string
  total: number
  items: Array<{ name: string; qty: number; price: number }>
  adminUrl: string
}

interface StatusDetails {
  orderId: string
  clientName: string
  total: number
  photoUrl?: string
  items?: Array<{ name: string; qty: number }>
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

  orderConfirmedToClient: ({ orderId, clientName, total }: StatusDetails): string =>
    `✅ Заказ #${orderId} подтверждён
${clientName}, заказ принят и будет собран в ближайшее время.
💰 Сумма: ${total.toLocaleString('ru-RU')} ₸
_Цветы Уральска_`,

  orderConfirmedToManager: ({ orderId, managerName, clientName, companyName, total }: ManagerStatusDetails): string =>
    `✅ Заказ #${orderId} подтверждён
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName} | 💰 ${total.toLocaleString('ru-RU')} ₸`,

  orderPackedToClient: ({ orderId, clientName, total, photoUrl }: StatusDetails): string =>
    `📦 Заказ #${orderId} собран и готов к получению
${clientName}, ваш заказ ждёт вас!
💰 Сумма: ${total.toLocaleString('ru-RU')} ₸${photoUrl ? `\n📸 ${photoUrl}` : ''}
📍 ул. Каримуллина, 11 | Пн-Пт 8:00-18:00, Сб 9:00-15:00
_Цветы Уральска_`,

  orderPackedToManager: ({ orderId, managerName, clientName, companyName, total }: ManagerStatusDetails): string =>
    `📦 Заказ #${orderId} собран
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName} | 💰 ${total.toLocaleString('ru-RU')} ₸`,

  orderDeliveredToClient: ({ orderId, clientName, total, items }: StatusDetails): string => {
    const itemsList = items?.length
      ? '\n' + items.map(i => `• ${i.name} — ${i.qty} шт`).join('\n')
      : ''
    return `🎉 Заказ #${orderId} выдан
${clientName}, спасибо за покупку! 🌸${itemsList}
💰 Итого: ${total.toLocaleString('ru-RU')} ₸
_Цветы Уральска_`
  },

  orderDeliveredToManager: ({ orderId, managerName, clientName, companyName, total, items }: ManagerStatusDetails): string => {
    const itemsList = items?.length
      ? '\n' + items.map(i => `• ${i.name} — ${i.qty} шт`).join('\n')
      : ''
    return `🎉 Заказ #${orderId} выдан
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName}${itemsList}
💰 ${total.toLocaleString('ru-RU')} ₸`
  },

  orderCancelledToClient: ({ orderId, clientName }: { orderId: string; clientName: string }): string =>
    `❌ Заказ #${orderId} отменён
${clientName}, ваш заказ был отменён.
Если есть вопросы — свяжитесь с нами.
_Цветы Уральска_`,

  orderPaidToClient: (
    orderId: string,
    clientName: string,
    items: Array<{ name: string; qty: number; price: number }>,
    total: number,
    cardMask?: string
  ): string => {
    const itemsList = items
      .map(i => `• ${i.name} — ${i.qty} шт × ${i.price.toLocaleString('ru-RU')} ₸`)
      .join('\n')
    const paymentLine = cardMask ? `💳 Оплачено картой ${cardMask}` : '💳 Оплата прошла успешно'

    return `✅ Заказ #${orderId} оплачен!
${clientName ? clientName + ', ваш' : 'Ваш'} заказ успешно оплачен.

${itemsList}

💰 Итого: ${total.toLocaleString('ru-RU')} ₸
${paymentLine}

📦 Мы уже приступили к обработке заказа. Как только он будет проверен и передан в сборку — пришлём уведомление.

_Цветы Уральска_`
  },

  orderCreatedToClient: (
    orderId: string,
    clientName: string,
    items: Array<{ name: string; qty: number; price: number }>,
    total: number
  ): string => {
    const itemsList = items
      .map(i => `• ${i.name} — ${i.qty} шт × ${i.price.toLocaleString('ru-RU')} ₸`)
      .join('\n')

    return `✅ Заказ #${orderId} принят!
${clientName}, ваш заказ принят в обработку.
${itemsList}
💰 ${total.toLocaleString('ru-RU')} ₸
Свяжемся для подтверждения в ближайшее время.
_Цветы Уральска_`
  },
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
