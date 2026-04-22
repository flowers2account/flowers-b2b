'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart-store'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function formatPrice(p: number) {
  return p.toLocaleString('ru-RU') + ' ₸'
}

export default function Cart() {
  const { items, remove, update, clear, total } = useCart()
  const [open, setOpen] = useState(false)
  const [authDialog, setAuthDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [stockError, setStockError] = useState<string>('')
  const router = useRouter()
  const supabase = createClient()

  const count = items.reduce((s, i) => s + i.qty, 0)

  async function handleCheckout() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAuthDialog(true)
      return
    }
    setLoading(true)

    // Резервируем товары
    const reserveErrors: string[] = []
    for (const item of items) {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: item.id, qty: item.qty })
      })
      if (!res.ok) {
        const data = await res.json()
        reserveErrors.push(data.available !== undefined
          ? item.name + ': доступно только ' + data.available + ' шт'
          : item.name + ': недостаточно остатков')
      }
    }
    if (reserveErrors.length > 0) {
      setStockError(reserveErrors.join(', '))
      setLoading(false)
      return
    }
    setStockError('')

    // Получаем client_id
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!client) {
      // Создаём клиента если нет
      await supabase.from('clients').insert({ id: user.id })
    }

    // Создаём заказ
    const { data: order } = await supabase
      .from('orders')
      .insert({ client_id: user.id, status: 'pending', total: total() })
      .select()
      .single()

    if (order) {
      // Привязываем резервы к заказу
      await supabase.from('reservations')
        .update({ order_id: order.id })
        .eq('user_id', user.id)
        .is('order_id', null)

      // Добавляем позиции
      await supabase.from('order_items').insert(
        items.map(i => ({
          order_id: order.id,
          product_id: i.id,
          qty: i.qty,
          price: i.price
        }))
      )

      // WhatsApp сообщение
      const msg = `🌸 Новый заказ #${order.id}\n\n` +
        items.map(i => `• ${i.name} × ${i.qty} шт = ${formatPrice(i.price * i.qty)}`).join('\n') +
        `\n\nИтого: ${formatPrice(total())}\n\nКлиент: ${user.email}`

      window.open(`https://wa.me/77007575243?text=${encodeURIComponent(msg)}`, '_blank')

      clear()
      setDone(true)
      setOpen(false)
    }
    setLoading(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            🛒 Корзина
            {count > 0 && (
              <span className="absolute -top-2 -right-2 bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {count}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>🛒 Корзина</SheetTitle>
          </SheetHeader>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">Корзина пуста</p>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto py-4 space-y-4">
                {items.map(item => (
                  <div key={item.id}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-muted-foreground text-xs">{formatPrice(item.price)} × шт</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                          onClick={() => update(item.id, item.qty - 1)}>−</Button>
                        <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                          onClick={() => update(item.id, Math.min(item.qty + 1, item.available))}>+</Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500"
                          onClick={() => remove(item.id)}>×</Button>
                      </div>
                    </div>
                    <p className="text-right text-sm font-bold text-green-800 mt-1">
                      {formatPrice(item.price * item.qty)}
                    </p>
                    <Separator className="mt-3" />
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between font-bold text-lg">
                  <span>Итого:</span>
                  <span className="text-green-800">{formatPrice(total())}</span>
                </div>
                {stockError && <p className="text-red-500 text-xs">{stockError}</p>}
          <Button className="w-full bg-green-700 hover:bg-green-800" onClick={handleCheckout} disabled={loading}>
                  {loading ? 'Оформляем...' : '✅ Оформить заказ'}
                </Button>
                <Button variant="ghost" className="w-full text-red-500" onClick={clear}>
                  Очистить корзину
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Диалог авторизации */}
      <Dialog open={authDialog} onOpenChange={setAuthDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Для оформления заказа нужен аккаунт</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">Ваша корзина сохранится после входа.</p>
          <div className="flex flex-col gap-3 mt-2">
            <Link href="/login" onClick={() => setAuthDialog(false)}>
              <Button className="w-full bg-green-700 hover:bg-green-800">Войти</Button>
            </Link>
            <Link href="/register" onClick={() => setAuthDialog(false)}>
              <Button variant="outline" className="w-full">Зарегистрироваться</Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* Успешный заказ */}
      <Dialog open={done} onOpenChange={setDone}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>🎉 Заказ оформлен!</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">Менеджер получил заказ в WhatsApp и свяжется с вами.</p>
          <Button className="w-full bg-green-700 hover:bg-green-800 mt-2" onClick={() => setDone(false)}>
            Отлично!
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
