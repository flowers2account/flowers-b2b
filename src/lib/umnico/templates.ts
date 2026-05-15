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
}

interface ManagerStatusDetails {
  orderId: string
  managerName: string
  total: number
}

export const umnicoTemplates = {
  newOrderToManager: (details: OrderDetails): string => {
    const itemsList = details.items
      .map(item => `• ${item.name} — ${item.qty} шт × ${item.price.toLocaleString('ru-RU')} ₸`)
      .join('\n')

    return `🆕 *НОВЫЙ ЗАКАЗ #${details.orderId}*

👤 Клиент: ${details.clientName}${details.companyName ? ` | ${details.companyName}` : ''}
📞 Телефон: ${details.clientPhone}

📦 Состав заказа:
${itemsList}

💰 Итого: *${details.total.toLocaleString('ru-RU')} ₸*

⏰ Резерв действует 30 минут

🔗 ${details.adminUrl}

_Flowers B2B • Уральск_`
  },

  orderConfirmedToClient: ({ orderId, clientName, total }: StatusDetails): string =>
    `✅ *Ваш заказ #${orderId} подтверждён*

${clientName}, ваш заказ принят и будет собран в ближайшее время.

💰 Сумма: *${total.toLocaleString('ru-RU')} ₸*

Мы сообщим, когда заказ будет готов. 🌸

_Flowers B2B • Уральск_`,

  orderPackedToClient: ({ orderId, clientName, total, photoUrl }: StatusDetails): string =>
    `📦 *Заказ #${orderId} собран и готов к получению*

${clientName}, ваш заказ ждёт вас!

💰 Сумма: *${total.toLocaleString('ru-RU')} ₸*
${photoUrl ? `\n📸 Фото вашего заказа: ${photoUrl}\n` : ''}
📍 Адрес склада: ул. Промышленная, 15
🕐 Режим работы: Пн-Пт 8:00-18:00, Сб 9:00-15:00

_Flowers B2B • Уральск_`,

  orderDeliveredToClient: ({ orderId, clientName, total }: StatusDetails): string =>
    `🎉 *Заказ #${orderId} выдан*

${clientName}, спасибо за покупку!

💰 Сумма: *${total.toLocaleString('ru-RU')} ₸*

Ждём вас снова! 🌸

_Flowers B2B • Уральск_`,

  orderConfirmedToManager: ({ orderId, managerName, total }: ManagerStatusDetails): string =>
    `✅ *Заказ #${orderId} подтверждён*

👤 Менеджер: ${managerName}
💰 Сумма: *${total.toLocaleString('ru-RU')} ₸*

_Flowers B2B • Уральск_`,

  orderPackedToManager: ({ orderId, managerName, total }: ManagerStatusDetails): string =>
    `📦 *Заказ #${orderId} собран*

👤 Менеджер: ${managerName}
💰 Сумма: *${total.toLocaleString('ru-RU')} ₸*

_Flowers B2B • Уральск_`,

  orderDeliveredToManager: ({ orderId, managerName, total }: ManagerStatusDetails): string =>
    `🎉 *Заказ #${orderId} выдан*

👤 Менеджер: ${managerName}
💰 Сумма: *${total.toLocaleString('ru-RU')} ₸*

_Flowers B2B • Уральск_`,

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

📦 Состав заказа:
${itemsList}

💰 Итого: ${total.toLocaleString('ru-RU')} ₸

Мы свяжемся с вами для подтверждения в ближайшее время.

_Цветы Уральска_`
  },
}
