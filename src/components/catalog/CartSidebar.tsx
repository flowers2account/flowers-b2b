'use client'
import { useState } from 'react'
import { useCart } from '@/lib/cart-store'
import { useAuthStore } from '@/lib/auth-store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

function formatPrice(p: number) {
  return p.toLocaleString('ru-RU') + ' ₸'
}

export default function CartSidebar() {
  const { items, remove, update, clear, total } = useCart()
  const { clientPhone, clientName } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [stockError, setStockError] = useState('')
  const [whatsappUrl, setWhatsappUrl] = useState('')

  const count = items.reduce((s, i) => s + i.qty, 0)

  async function submitOrder() {
    if (!clientPhone) return
    setLoading(true)
    setStockError('')

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name })),
        phone: clientPhone,
        name: clientName ?? '',
      }),
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
      `\n\nИтого: ${formatPrice(total())}\n\nКлиент: ${clientPhone}`

    setWhatsappUrl(`https://wa.me/77007575243?text=${encodeURIComponent(msg)}`)
    clear()
    setDone(true)
    setLoading(false)
  }

  return (
    <>
      <div className="w-80 shrink-0 sticky top-24">
        <div className="border rounded-xl bg-white shadow-sm p-4">
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            🛒 Корзина
            {count > 0 && (
              <span className="bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {count}
              </span>
            )}
          </h2>

          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Корзина пуста</p>
          ) : (
            <>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {items.map(item => (
                  <div key={item.id}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-muted-foreground text-xs">{formatPrice(item.price)} × шт</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                          onClick={() => update(item.id, item.qty - 1)}>−</Button>
                        <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                        <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                          onClick={() => update(item.id, Math.min(item.qty + 1, item.available))}>+</Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400"
                          onClick={() => remove(item.id)}>×</Button>
                      </div>
                    </div>
                    <p className="text-right text-sm font-bold text-green-800 mt-1">
                      {formatPrice(item.price * item.qty)}
                    </p>
                    <Separator className="mt-2" />
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex justify-between font-bold text-base">
                  <span>Итого:</span>
                  <span className="text-green-800">{formatPrice(total())}</span>
                </div>
                {stockError && <p className="text-red-500 text-xs">{stockError}</p>}
                <Button
                  className="w-full bg-green-700 hover:bg-green-800"
                  onClick={submitOrder}
                  disabled={loading || !clientPhone}
                >
                  {loading ? 'Оформляем...' : '✅ Создать заказ'}
                </Button>
                <Button variant="ghost" className="w-full text-red-400 text-sm" onClick={clear}>
                  Очистить корзину
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={done} onOpenChange={setDone}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>🎉 Заказ оформлен!</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">Менеджер получил заказ и свяжется с вами.</p>
          <Button
            className="w-full bg-green-700 hover:bg-green-800 mt-2"
            onClick={() => window.open(whatsappUrl, '_blank')}
          >
            📲 Открыть WhatsApp
          </Button>
          <Button variant="outline" className="w-full mt-2" onClick={() => setDone(false)}>
            Отлично!
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}