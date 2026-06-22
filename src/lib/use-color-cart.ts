'use client'
import { useState } from 'react'
import { useCart, type CartItem } from '@/lib/cart-store'
import { getColorMode, colorLabel, usableColors } from '@/lib/colors'

// Единая модель «выбор цвета → корзина» (Вариант А: цвет — ярлык, не SKU).
// Извлечена из DetailPanel, чтобы клетка грида использовала ТУ ЖЕ логику, а не свою копию.
// Цена/остаток/резерв — общие на товар; цвет едет снимком в CartItem.color → order_items.color.
//   none    → блока выбора нет, color = null (как раньше)
//   assorti → один статичный ярлык «ассорти»
//   select  → выбор обязателен; разные цвета одного товара = разные строки корзины (sameLine)

type ColorsLike = { id: number; colors?: string[] | null }

interface Opts {
  available: number
  packSize: number
  makePayload: (color: string | null) => Omit<CartItem, 'qty'>
  // Предвыбранный цвет (напр. кликнули кружок в гриде → открыли правую панель с этим цветом).
  initialSlug?: string | null
}

export function useColorCart(product: ColorsLike, { available, packSize, makePayload, initialSlug }: Opts) {
  const { items, add, update } = useCart()

  const colorList = usableColors(product.colors)
  const colorMode = getColorMode(product.colors)
  // Предвыбор извне → иначе один настоящий цвет (срезка) выбираем сразу → иначе ничего.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    initialSlug ?? (colorMode === 'select' && colorList.length === 1 ? colorList[0] : null),
  )

  // Снимок цвета, который уедет в позицию корзины и в заказ.
  const colorValue: string | null =
    colorMode === 'assorti' ? 'ассорти'
    : colorMode === 'select' ? (selectedSlug ? colorLabel(selectedSlug) : null)
    : null
  // В режиме select цвет обязателен — пока не выбран, в корзину нельзя.
  const colorRequired = colorMode === 'select' && !colorValue

  // qty конкретной строки (product_id + цвет) — sameLine, как в cart-store.
  const qtyOf = (cv: string | null) =>
    items.find(i => i.id === product.id && (i.color ?? null) === cv)?.qty ?? 0
  const qty = qtyOf(colorValue)

  // qty по каждому slug (для счётчиков на кружках в гриде — можно набирать несколько цветов).
  const qtyBySlug: Record<string, number> = {}
  for (const slug of colorList) qtyBySlug[slug] = qtyOf(colorLabel(slug))

  // inc/dec привязаны к выбранному цвету — буквально как handleInc/handleDec в DetailPanel.
  const inc = () => {
    if (colorRequired) return
    if (qty === 0) {
      add(makePayload(colorValue))
      update(product.id, packSize, colorValue)
    } else {
      update(product.id, Math.min(qty + packSize, available), colorValue)
    }
  }
  const dec = () => update(product.id, Math.max(0, qty - packSize), colorValue)

  return {
    colorList, colorMode, selectedSlug, setSelectedSlug,
    colorValue, colorRequired, qty, qtyOf, qtyBySlug, inc, dec,
  }
}
