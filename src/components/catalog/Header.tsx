'use client'
import Link from 'next/link'
import { useAuthStore } from '@/lib/auth-store'
import { useCart } from '@/lib/cart-store'
import { useState, useEffect } from 'react'
import AuthModal from './AuthModal'

export default function Header() {
  const { isAuthed, phone, role, init, logout } = useAuthStore()
  const { items, total } = useCart()
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => { init() }, [])

  const cartCount = items.reduce((s, i) => s + i.qty, 0)
  const cartTotal = total()

  return (
    <header className="sticky top-0 z-[100]">
      {/* L1 — белая полоса */}
      <div className="bg-white h-14 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between gap-4">

          {/* Логотип */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl">🌸</span>
            <div className="leading-tight">
              <div className="font-bold text-[#8B1A1A] text-base leading-none" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                Цветы Уральска
              </div>
              <div className="text-[10px] text-gray-400 leading-none mt-0.5">оптовая база</div>
            </div>
          </Link>

          {/* Навигация по центру */}
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-gray-600">
            <Link href="/" className="hover:text-[#8B1A1A] transition-colors">Каталог</Link>
            {isAuthed && (
              <Link href="/cabinet" className="hover:text-[#8B1A1A] transition-colors">Мои заказы</Link>
            )}
          </nav>

          {/* Правый блок */}
          <div className="flex items-center gap-2 shrink-0">
            {isAuthed ? (
              <>
                {(role === 'admin' || role === 'manager') && (
                  <Link
                    href="/admin"
                    className="hidden sm:inline-flex items-center gap-1 text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-gray-700 transition-colors"
                  >
                    ⚙️ Админка
                  </Link>
                )}
                <span className="text-sm text-gray-500 hidden sm:inline">👤 {phone}</span>
                <button
                  onClick={() => logout()}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Выйти
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="text-sm bg-[#8B1A1A] text-white px-4 py-1.5 rounded-lg hover:bg-[#A52020] transition-colors"
              >
                Войти
              </button>
            )}
          </div>
        </div>
      </div>

      {/* L2 — бордовая полоса */}
      <div className="bg-[#8B1A1A] h-11">
        <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between">

          {/* Категории */}
          <div className="flex items-center gap-1 text-sm text-white/90">
            <Link href="/?cat=cut" className="hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10">
              Срезанные цветы
            </Link>
            <span className="text-white/40">|</span>
            <Link href="/?cat=pot" className="hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10">
              Горшечные растения
            </Link>
          </div>

          {/* Корзина */}
          <Link href="/" className="flex items-center gap-2 text-white hover:text-white/80 transition-colors">
            {cartCount > 0 && (
              <span className="text-sm font-medium">
                {cartTotal.toLocaleString('ru-RU')} ₸
              </span>
            )}
            <div className="relative">
              <span className="text-xl">🛒</span>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-white text-[#8B1A1A] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </div>
          </Link>
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </header>
  )
}
