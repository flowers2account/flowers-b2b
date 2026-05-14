interface OrderDetails {
  orderId: string
  clientName: string
  clientPhone: string
  total: number
  items: Array<{ name: string; qty: number; price: number }>
  adminUrl: string
}

interface ConfirmationDetails {
  orderId: string
  clientName: string
  total: number
}

export const umnicoTemplates = {
  newOrderToManager: (details: OrderDetails): string => {
    const itemsList = details.items
      .map(item => `• ${item.name} — ${item.qty} шт × ${item.price.toLocaleString('ru-RU')} ₸`)
      .join('\n')

    return `🆕 *НОВЫЙ ЗАКАЗ #${details.orderId}*

👤 Клиент: ${details.clientName}
📞 Телефон: ${details.clientPhone}

📦 Состав заказа:
${itemsList}

💰 Итого: *${details.total.toLocaleString('ru-RU')} ₸*

⏰ Резерв действует 30 минут

🔗 ${details.adminUrl}

_Flowers B2B • Уральск_`
  },

  orderConfirmedToClient: (details: ConfirmationDetails): string => {
    return `✅ *Ваш заказ #${details.orderId} подтверждён*

${details.clientName}, ваш заказ готов к выдаче!

💰 Сумма: *${details.total.toLocaleString('ru-RU')} ₸*

📍 Адрес склада: ул. Промышленная, 15
🕐 Режим работы: Пн-Пт 8:00-18:00, Сб 9:00-15:00

Спасибо за заказ! 🌸`
  }
}
