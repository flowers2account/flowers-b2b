'use client'

import { useState, useEffect } from 'react'
import { useCart } from '@/lib/cart-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'

const PHONE_KEY = 'guest_phone'
const NAME_KEY = 'guest_name'

function formatPrice(p: number) {
  return p.toLocaleString('ru-RU') + ' ₸'
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) return '+7' + digits.slice(1)
  if (digits.startsWith('7') && digits.length === 11) return '+' + digits
  if (digits.length === 10) return '+7' + digits
  return raw
}

function isValidPhone(p: string): boolean {
  return /^\+7\d{10}$/.test(p)
}

function CartItems({
  onCheckout,
  loading,
  stockError,
}: {
  onCheckout: () => void
  loading: boolean
  stockError: string
}) {
  const { items, remove, update, clear, total } = useCart()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
        <span className="text-4xl mb-3">🛒</span>
        Корзина пуста
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 pb-2 min-h-0">
        {items.map(item => (
          <div key={item.id}>
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-tight">{item.name}</p>
                <p className="text-muted-foreground text-xs">{formatPrice(item.price)} × шт</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                  onClick={() => update(item.id, item.qty - 1)}>−</Button>
                <span className="w-6 text-center text-xs font-medium">{item.qty}</span>
                <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                  onClick={() => update(item.id, Math.min(item.qty + 1, item.available))}>+</Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500"
                  onClick={() => remove(item.id)}>×</Button>
              </div>
            </div>
            <p className="text-right text-xs font-bold text-green-800 mt-1">
              {formatPrice(item.price * item.qty)}
            </p>
            <Separator className="mt-2" />
          </div>
        ))}
      </div>
      <div className="border-t pt-3 space-y-2 flex-shrink-0">
        <div className="flex justify-between font-bold">
          <span>Итого:</span>
          <span className="text-green-800">{formatPrice(total())}</span>
        </div>
        {stockError && <p className="text-red-500 text-xs">{stockError}</p>}
        <Button className="w-full bg-green-700 hover:bg-green-800 text-sm" onClick={onCheckout} disabled={loading}>
          {loading ? 'Оформляем...' : '📲 Отправить в WhatsApp'}
        </Button>
        <Button variant="ghost" className="w-full text-red-500 text-xs h-8" onClick={clear}>
          Очистить корзину
        </Button>
      </div>
    </div>
  )
}

export default function CartSidebar() {
  const { items, clear, total } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [stockError, setStockError] = useState('')
  const [phoneDialog, setPhoneDialog] = useState(false)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [phoneError, setPhoneError] = useState('')

  const supabase = createClient()
  const count = items.reduce((s, i) => s + i.qty, 0)

  useEffect(() => {
    const savedPhone = localStorage.getItem(PHONE_KEY)
    const savedName = localStorage.getItem(NAME_KEY)
    if (savedPhone) setPhone(savedPhone)
    if (savedName) setName(savedName)
  }, [])

  async function handleCheckout() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPhoneDialog(true)
      return
    }
    await submitOrder(user.email ?? null, null, null)
  }

  async function handlePhoneSubmit() {
    const normalized = normalizePhone(phone)
    if (!isValidPhone(normalized)) {
      setPhoneError('Введите номер в формате +7XXXXXXXXXX')
      return
    }
    setPhoneError('')
    setPhoneDialog(false)
    localStorage.setItem(PHONE_KEY, normalized)
    if (name.trim()) localStorage.setItem(NAME_KEY, name.trim())
    await submitOrder(null, normalized, name.trim() || null)
  }

  async function submitOrder(email: string | null, guestPhone: string | null, guestName: string | null) {
    setLoading(true)
    setStockError('')

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name })),
        phone: guestPhone,
        name: guestName,
      })
    })

    if (!res.ok) {
      const data = await res.json()
      setStockError(data.error ?? 'Ошибка при оформлении заказа')
      setLoading(false)
      return
    }

    const { order_id, is_new_order } = await res.json()
    const msgHeader = is_new_order ? `🌸 Новый заказ #${order_id}` : `🌸 Обновление заказа #${order_id}`
    const clientLine = email
      ? `\n\nКлиент: ${email}`
      : guestPhone
        ? `\n\n${guestName ? `Имя: ${guestName}\n` : ''}Телефон: ${guestPhone}`
        : ''
    const msg = msgHeader + '\n\n' +
      items.map(i => `• ${i.name} × ${i.qty} шт = ${formatPrice(i.price * i.qty)}`).join('\n') +
      `\n\nИтого: ${formatPrice(total())}` + clientLine

    window.open(`https://wa.me/77007575243?text=${encodeURIComponent(msg)}`, '_blank')
    clear()
    setDone(true)
    setMobileOpen(false)
    setLoading(false)
  }

  return (
    <>
      {/* Desktop sticky sidebar — always in flex layout, hidden on mobile via display:none */}
      <div className="hidden md:flex flex-col w-[340px] flex-shrink-0 sticky top-16 max-h-[calc(100vh-5rem)] bg-white border rounded-xl p-4 shadow-sm">
        <h2 className="font-bold text-base mb-3 flex items-center gap-2 flex-shrink-0">
          🛒 Корзина
          {count > 0 && (
            <span className="bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {count}
            </span>
          )}
        </h2>
        <div className="flex-1 min-h-0 flex flex-col">
          <CartItems onCheckout={handleCheckout} loading={loading} stockError={stockError} />
        </div>
      </div>

      {/* Mobile floating button — position:fixed, escapes layout, hidden on desktop */}
      {count > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 md:hidden flex justify-center">
          <Button
            className="bg-green-700 hover:bg-green-800 shadow-lg rounded-full px-6 py-3 h-auto text-sm font-semibold"
            onClick={() => setMobileOpen(true)}
          >
            🛒 {count} шт · {formatPrice(total())}
          </Button>
        </div>
      )}

      {/* Mobile bottom sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] flex flex-col gap-0 p-4 pb-8">
          <SheetHeader className="p-0 mb-3">
            <SheetTitle>🛒 Корзина</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 flex flex-col">
            <CartItems onCheckout={handleCheckout} loading={loading} stockError={stockError} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Phone dialog */}
      <Dialog open={phoneDialog} onOpenChange={setPhoneDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Укажите ваши данные</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">Менеджер свяжется с вами для подтверждения заказа.</p>
          <div className="space-y-3 mt-1">
            <Input
              placeholder="Ваше имя (необязательно)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()}
            />
            <Input
              placeholder="+7XXXXXXXXXX"
              value={phone}
              onChange={e => { setPhone(e.target.value); setPhoneError('') }}
              onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()}
              autoFocus
            />
            {phoneError && <p className="text-red-500 text-xs">{phoneError}</p>}
            <Button className="w-full bg-green-700 hover:bg-green-800" onClick={handlePhoneSubmit}>
              📲 Отправить заказ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
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
