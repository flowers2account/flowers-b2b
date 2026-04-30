'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart-store'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

function formatPrice(p: number) {
  return p.toLocaleString('ru-RU') + ' ₸'
}

export default function Cart() {
  const { items, remove, update, clear, total } = useCart()
  const [open, setOpen] = useState(false)
  const [contactDialog, setContactDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [stockError, setStockError] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')

  const count = items.reduce((s, i) => s + i.qty, 0)

  async function submitOrder(phone: string, name: string) {
    setLoading(true)
    setStockError('')

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name })),
        phone,
        name,
      })
    })

    if (!res.ok) {
      const data = await res.json()
      setStockError(data.error ?? 'Ошибка при оформлении заказа')
      setLoading(false)
      return
    }

    const { order_id, is_new_order } = await res.json()

    const msgHeader = is_new_order
      ? `🌸 Новый заказ #${order_id}`
      : `🌸 Обновление заказа #${order_id}`
    const msg = msgHeader + '\n\n' +
      items.map(i => `• ${i.name} × ${i.qty} шт = ${formatPrice(i.price * i.qty)}`).join('\n') +
      `\n\nДобавлено: ${formatPrice(total())}\n\nКлиент: ${phone}`

    window.open(`https://wa.me/77007575243?text=${encodeURIComponent(msg)}`, '_blank')

    clear()
    setDone(true)
    setOpen(false)
    setLoading(false)
  }

  function handleCheckout() {
    const savedPhone = localStorage.getItem('customer_phone')
    const savedName = localStorage.getItem('customer_name') ?? ''
    if (savedPhone) {
      submitOrder(savedPhone, savedName)
    } else {
      setPhone('')
      setName('')
      setContactDialog(true)
    }
  }

  function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    localStorage.setItem('customer_phone', phone)
    localStorage.setItem('customer_name', name)
    setContactDialog(false)
    submitOrder(phone, name)
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

      {/* Диалог ввода контактов */}
      <Dialog open={contactDialog} onOpenChange={setContactDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Контактные данные</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleContactSubmit} className="flex flex-col gap-3 mt-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Номер телефона</label>
              <input
                type="tel"
                required
                placeholder="+7 (777) 000-00-00"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Ваше имя</label>
              <input
                type="text"
                required
                placeholder="Имя"
                value={name}
                onChange={e => setName(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>
            <Button type="submit" className="w-full bg-green-700 hover:bg-green-800 mt-1">
              Продолжить
            </Button>
          </form>
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
