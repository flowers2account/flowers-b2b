// Позиция для перечня в уведомлении. `name` — уже выбранное вызывающим:
// клиенту передаём витринное (display_name), менеджеру — 1С (name).
export interface NotifyItem {
  name: string
  color?: string | null
  qty: number
  price?: number
}

// Строка позиции: «• Имя (Цвет) — N шт». Цена добавляется, только если передана.
const itemLine = (i: NotifyItem): string =>
  `• ${i.name}${i.color ? ` (${i.color})` : ''} — ${i.qty} шт` +
  (i.price != null ? ` × ${i.price.toLocaleString('ru-RU')} ₸` : '')

// Блок перечня (с ведущим переносом строки) либо пусто, если позиций нет.
const fmtItems = (items?: NotifyItem[]): string =>
  items?.length ? '\n' + items.map(itemLine).join('\n') : ''

interface OrderDetails {
  orderId: string
  clientName: string
  clientPhone: string
  companyName?: string
  total: number
  items: NotifyItem[]
  adminUrl: string
}

interface ManagerStatusDetails {
  orderId: string
  managerName: string
  clientName?: string
  companyName?: string
  total: number
  items?: NotifyItem[]
}

interface ClientStatusDetails {
  orderId: string
  items?: NotifyItem[]
}

export const umnicoTemplates = {
  newOrderToManager: (details: OrderDetails): string => {
    // Шлётся ТОЛЬКО после успешной оплаты (postlink) → явно помечаем «ОПЛАЧЕН».
    // «Резерв 30 мин» убран — это логика ДО оплаты, для оплаченного заказа неверна.
    return `🆕 ЗАКАЗ #${details.orderId} ✅ ОПЛАЧЕН
👤 ${details.clientName}${details.companyName ? ` | ${details.companyName}` : ''}
📞 ${details.clientPhone}${fmtItems(details.items)}
💰 Оплачено: ${details.total.toLocaleString('ru-RU')} ₸
🔗 ${details.adminUrl}`
  },

  // Оплата (создание сделки)
  orderPaidToClient: ({ orderId, items }: ClientStatusDetails): string =>
    `✅ Заказ #${orderId} оплачен. Спасибо! Принят в работу, скоро подтвердим.${fmtItems(items)}\n_Цветы Уральска_`,

  // Состав заказа — ТОЛЬКО в первом («оплачен»/«новый заказ») и последнем («выдан»)
  // уведомлениях. В промежуточных (подтверждён/собран/в пути/отменён) — без перечня.

  // confirmed (Подтверждён)
  orderConfirmedToClient: ({ orderId }: ClientStatusDetails): string =>
    `✅ Заказ #${orderId} подтверждён, собираем.\n_Цветы Уральска_`,

  orderConfirmedToManager: ({ orderId, managerName, clientName, companyName, total }: ManagerStatusDetails): string =>
    `✅ Заказ #${orderId} подтверждён
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName} | 💰 ${total.toLocaleString('ru-RU')} ₸`,

  // assembled (Готово) — ветвится по способу получения. Фото заказа прикрепляется отдельно (sendImage).
  orderAssembledPickupToClient: ({ orderId }: ClientStatusDetails): string =>
    `📦 Заказ #${orderId} собран и готов к выдаче! Забрать: г. Уральск, ул. Каримуллина, 11. Часы: пн–пт 9:00–18:00, сб–вс 10:00–17:00. Назовите номер заказа.\n_Цветы Уральска_`,

  orderAssembledDeliveryToClient: ({ orderId }: ClientStatusDetails): string =>
    `📦 Заказ #${orderId} собран! Передаём в доставку, сообщим, когда выедет курьер.\n_Цветы Уральска_`,

  orderPackedToManager: ({ orderId, managerName, clientName, companyName, total }: ManagerStatusDetails): string =>
    `📦 Заказ #${orderId} собран
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName} | 💰 ${total.toLocaleString('ru-RU')} ₸`,

  // in_transit (На доставке) — пустые строки скрываются
  orderOnDeliveryToClient: ({ orderId, driverName, driverPhone, driverCarPlate, deliveryDate }: {
    orderId: string
    driverName?: string | null; driverPhone?: string | null
    driverCarPlate?: string | null; deliveryDate?: string | null
    items?: NotifyItem[]
  }): string => {
    const lines = [
      `🚚 Заказ #${orderId} в пути!`,
      driverName     ? `Водитель: ${driverName}` : '',
      driverPhone    ? `Телефон: ${driverPhone}` : '',
      driverCarPlate ? `Авто: ${driverCarPlate}` : '',
      deliveryDate   ? `Ожидайте к ${deliveryDate}.` : '',
    ].filter(Boolean)
    return `${lines.join('\n')}\n_Цветы Уральска_`
  },

  // delivered (Выдан)
  orderDeliveredToClient: ({ orderId, items }: ClientStatusDetails): string =>
    `🎉 Заказ #${orderId} выдан. Спасибо, что выбрали нас! Будем рады видеть снова.${fmtItems(items)}\n_Цветы Уральска_`,

  orderDeliveredToManager: ({ orderId, managerName, clientName, companyName, total, items }: ManagerStatusDetails): string =>
    `🎉 Заказ #${orderId} выдан
👤 ${clientName ?? '—'}${companyName ? ` | ${companyName}` : ''}
👔 ${managerName}${fmtItems(items)}
💰 ${total.toLocaleString('ru-RU')} ₸`,

  // cancelled (Отменён)
  orderCancelledToClient: ({ orderId }: ClientStatusDetails): string =>
    `❌ Заказ #${orderId} отменён. Если это ошибка — напишите нам.\n_Цветы Уральска_`,
}

export function authPinToClient(clientName: string, pin: string): string {
  return `Здравствуйте${clientName ? ', ' + clientName : ''}!

Ваш код для входа в каталог цветов: *${pin}*

⚠️ Никому не сообщайте этот код.

—
🌸 Цветы Уральска
📞 +7 700 757 5243`
}
