'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { useCart } from '@/lib/cart-store'
import { useDetailStore } from '@/lib/detail-store'
import { useFilters } from '@/lib/filter-store'
import { useFavorites } from '@/lib/favorites-store'
import { useState, useEffect } from 'react'
import AuthModal from './AuthModal'
import CategoryTabs from './CategoryTabs'

export default function Header() {
  const { isAuthed, phone, role, init, logout } = useAuthStore()
  const { items, total } = useCart()
  const [showAuth, setShowAuth] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { category, setGroup, setCategory } = useFilters()

  useEffect(() => { init() }, [])

  // «Каталог» — нейтральный вход: режим «Все» (комбинируемые фильтры по всем разделам)
  const goCatalogAll = () => {
    if (category !== 'accessories') setCategory('accessories')
    setGroup('all')
    router.push('/?category=accessories&group=all')
  }

  const cartCount = items.reduce((s, i) => s + i.qty, 0)
  const cartTotal = total()
  const favCount = useFavorites(s => s.ids.size)

  const isAdminRole = role === 'admin' || role === 'manager'
  const NAV = [
    { href: '/', label: 'Каталог' },
    { href: '/categories', label: 'Категории' },
    { href: '/about', label: 'О нас' },
    ...(isAuthed ? [{
      href: isAdminRole ? '/admin/orders' : '/cabinet',
      label: isAdminRole ? 'Заказы' : 'Личный кабинет / Мои заказы',
    }] : []),
  ]

  return (
    <header className="sticky top-0 z-[100]">
      {/* L1 — белая 58px */}
      <div className="bg-white border-b border-[#e8e8e8] flex items-center" style={{ height: 58 }}>
        <div className="max-w-[1480px] w-full mx-auto px-[22px] flex items-center" style={{ height: 58 }}>

          {/* Логотип */}
          <Link href="/" className="flex items-center gap-[8px] mr-9 shrink-0 no-underline">
            <img
              src="/logo.png"
              alt="Цветы Уральска"
              width={44}
              height={44}
              style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 15, color: 'var(--accent)', lineHeight: 1.1 }}>
                Цветы Уральска
              </div>
              <span style={{ display: 'block', fontSize: 8, fontWeight: 400, color: 'var(--accent-mid)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'var(--font-golos)', lineHeight: 1.6 }}>
                оптовая база
              </span>
            </div>
          </Link>

          {/* Навигация — скрыта на мобильном */}
          <nav className="hidden md:flex items-center flex-1" style={{ height: 58 }}>
            {NAV.map(({ href, label }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
              const navStyle: React.CSSProperties = {
                height: 58,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent)' : '#444',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }
              const cls = 'flex items-center px-4 text-[13px] no-underline transition-colors'
              // «Каталог» → режим «Все» через обработчик (работает и когда уже на /)
              if (href === '/') {
                return (
                  <button key={label} onClick={goCatalogAll}
                    className={cls} style={{ ...navStyle, background: 'none', border: 'none', borderBottom: navStyle.borderBottom, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {label}
                  </button>
                )
              }
              return (
                <Link
                  key={label}
                  href={href}
                  className={cls}
                  style={navStyle}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* User / Auth */}
          {isAuthed ? (
            <div className="flex items-center gap-2 shrink-0">
              {(role === 'admin' || role === 'manager') && (
                <Link
                  href="/admin"
                  className="hidden sm:inline-flex items-center gap-1 text-[12px] bg-[#f5f0f3] hover:bg-[#ede5ea] px-3 py-1.5 no-underline transition-colors"
                  style={{ color: 'var(--text-mid)', borderRadius: 'var(--radius-btn)' }}
                >
                  ⚙️ Админка
                </Link>
              )}
              <div className="flex items-center gap-2 px-[10px] py-[5px] bg-[#f5f0f3] text-[12px] font-medium" style={{ borderRadius: 'var(--radius-btn)' }}>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ background: 'var(--accent)' }}
                >
                  👤
                </div>
                <span className="hidden sm:inline text-[12px]" style={{ color: 'var(--text)' }}>
                  {phone}
                </span>
                <button
                  onClick={() => logout()}
                  className="text-[11px] ml-1 bg-none border-none cursor-pointer transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                >
                  Выйти
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="text-[13px] text-white px-4 py-1.5 border-none cursor-pointer transition-colors shrink-0"
              style={{ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-btn)' }}
            >
              Войти
            </button>
          )}
        </div>
      </div>

      {/* L2 — бордовая 46px */}
      <div className="flex items-center" style={{ backgroundColor: 'var(--accent)', height: 46, overflow: 'hidden' }}>
        <div
          className="flex items-center gap-2 px-5 w-full"
          style={{ overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' }}
        >

          {/* Разделы каталога — вкладки */}
          <CategoryTabs />

          {/* Избранное — только десктоп */}
          <Link
            href="/favorites"
            aria-label="Избранное"
            className="ml-auto md:flex hidden items-center text-white relative no-underline cursor-pointer"
            style={{ flexShrink: 0, marginRight: 18 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
            </svg>
            {favCount > 0 && (
              <span className="absolute flex items-center justify-center font-extrabold"
                style={{ top: -3, right: -10, minWidth: 17, height: 17, borderRadius: 'var(--radius-btn)', padding: '0 4px', background: '#E8B4C0', color: '#1a1a1a', fontSize: 9 }}>
                {favCount > 99 ? '99+' : favCount}
              </span>
            )}
          </Link>

          {/* Корзина — только десктоп */}
          <button
            onClick={() => useDetailStore.getState().setPanel('cart')}
            className="md:flex hidden items-center gap-2 bg-transparent border-none text-white relative cursor-pointer"
            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span className="text-[14px] font-bold">
              {cartCount > 0 ? `${cartTotal.toLocaleString('ru-RU')} ₸` : '0 ₸'}
            </span>
            {cartCount > 0 && (
              <span
                className="absolute flex items-center justify-center font-extrabold"
                style={{
                  top: -3, right: -8,
                  minWidth: 17, height: 17,
                  borderRadius: 'var(--radius-btn)', padding: '0 4px',
                  background: '#E8B4C0',
                  color: '#1a1a1a',
                  fontSize: 9,
                }}
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </header>
  )
}
