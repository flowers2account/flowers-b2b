'use client'
import { useState } from 'react'
import { useCart } from '@/lib/cart-store'
import { useAuthStore } from '@/lib/auth-store'
import SwipeToDelete from './SwipeToDelete'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import AuthModal from './AuthModal'
import { useOrderCheckout } from '@/hooks/useOrderCheckout'
import { unitForProduct } from '@/lib/category-tree'

function formatPrice(p: number) {
  return p.toLocaleString('ru-RU') + ' ₸'
}

export default function CartSidebar() {
  const { items, remove, update, clear, total } = useCart()
  const { phone } = useAuthStore()
  const [showAuth, setShowAuth] = useState(false)

  const checkout = useOrderCheckout({
    items,
    phone,
    onAuthRequired: () => setShowAuth(true),
    onSuccess: () => clear(),
  })

  const count = items.reduce((s, i) => s + i.qty, 0)

  return (
    <>
      <div className="p-4 h-full overflow-y-auto">
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
              <div className="space-y-3">
                {items.map(item => (
                  <SwipeToDelete key={item.id} onDelete={() => remove(item.id)}>
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-muted-foreground text-xs">{formatPrice(item.price)} × {unitForProduct(item)}</p>
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
                  </SwipeToDelete>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex justify-between font-bold text-base">
                  <span>Итого:</span>
                  <span className="text-green-800">{formatPrice(total())}</span>
                </div>
                {checkout.stockError && <p className="text-red-500 text-xs">{checkout.stockError}</p>}

                {checkout.step === 'polling' && (
                  <div className="text-center text-sm text-muted-foreground py-1">
                    <p className="text-xs">Обычно занимает до 2 мин…</p>
                  </div>
                )}

                {checkout.busy && (
                  <div className="text-center text-sm text-muted-foreground py-2 space-y-1">
                    <div className="animate-spin inline-block w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full" />
                    <p>
                      {checkout.step === 'creating' ? 'Создаём заказ...'
                       : checkout.step === 'paying'  ? 'Ожидаем оплату...'
                       : 'Проверяем оплату...'}
                    </p>
                  </div>
                )}

                {checkout.step === 'idle' && (
                  <Button className="w-full bg-green-700 hover:bg-green-800"
                    onClick={checkout.submitOrder} disabled={checkout.busy}>
                    💳 Оформить и оплатить
                  </Button>
                )}

                {(checkout.isTerminal) && (
                  <Button variant="ghost" className="w-full text-sm text-muted-foreground"
                    onClick={checkout.reset}>
                    ← Вернуться к корзине
                  </Button>
                )}

                {checkout.step === 'idle' && (
                  <Button variant="ghost" className="w-full text-red-400 text-sm" onClick={clear}>
                    Очистить корзину
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />
      )}

      {/* Успешная оплата */}
      <Dialog open={checkout.step === 'success'} onOpenChange={() => checkout.reset()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>🎉 Заказ оформлен и оплачен!</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Заказ №{checkout.orderId} создан. Менеджер получил уведомление и свяжется с вами.
          </p>
          {checkout.payInfo?.cardMask && (
            <p className="text-sm font-medium">
              💳 Оплачено картой {checkout.payInfo.cardMask}
              {checkout.payInfo.amount ? ` · ${formatPrice(Number(checkout.payInfo.amount))}` : ''}
            </p>
          )}
          <Button className="w-full bg-green-700 hover:bg-green-800 mt-2" onClick={checkout.reset}>
            Отлично!
          </Button>
        </DialogContent>
      </Dialog>

      {/* Оплата обрабатывается (таймаут поллинга) */}
      <Dialog open={checkout.step === 'timeout'} onOpenChange={() => checkout.reset()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>⏳ Оплата обрабатывается</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Заказ №{checkout.orderId} создан. Платёж поставлен в обработку — статус появится в личном кабинете через 1–3 минуты.
          </p>
          <Button className="w-full mt-2" onClick={checkout.reset}>Понятно</Button>
        </DialogContent>
      </Dialog>

      {/* Неуспешная оплата */}
      <Dialog open={checkout.step === 'failed'} onOpenChange={() => checkout.reset()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>⚠️ Заказ №{checkout.orderId} создан, но не оплачен</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Товары зарезервированы на 30 минут. Вы можете повторить оплату прямо сейчас.
          </p>
          {checkout.payError && <p className="text-xs text-red-500">{checkout.payError}</p>}
          <Button className="w-full bg-green-700 hover:bg-green-800 mt-2"
            onClick={checkout.retryPayment} disabled={checkout.busy}>
            🔄 Повторить оплату
          </Button>
          <Button variant="outline" className="w-full mt-2" onClick={checkout.reset}>
            Закрыть
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
