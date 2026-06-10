'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { useCart } from '@/lib/cart-store'
import { useFilters } from '@/lib/filter-store'
import { useFavorites } from '@/lib/favorites-store'
import { useState, useEffect } from 'react'
import AuthModal from './AuthModal'
import CategoryTabs from './CategoryTabs'

export default function Header() {
  const { isAuthed, phone, role, init, logout } = useAuthStore()
  const { items, total } = useCart()
  const [showAuth, setShowAuth] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { category, setGroup, setCategory } = useFilters()

  useEffect(() => { init() }, [])
  // блокируем скролл body при открытом мобильном меню
  useEffect(() => {
    if (drawer) { document.body.style.overflow = 'hidden' }
    else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [drawer])
  // закрываем меню при смене маршрута
  useEffect(() => { setDrawer(false) }, [pathname])

  // «Каталог» — нейтральный вход: режим «Все» (комбинируемые фильтры по всем разделам)
  const goCatalogAll = () => {
    if (category !== 'accessories') setCategory('accessories')
    setGroup('all')
    router.push('/catalog?category=accessories&group=all')
  }

  const cartCount = items.reduce((s, i) => s + i.qty, 0)
  const cartTotal = total()
  const favCount = useFavorites(s => s.ids.size)

  const isAdminRole = role === 'admin' || role === 'manager'
  const NAV = [
    { href: '/', label: 'О нас' },
    { href: '/categories', label: 'Категории' },
    { href: '/catalog', label: 'Каталог' },
    ...(isAuthed ? [{
      href: isAdminRole ? '/admin/orders' : '/cabinet',
      label: isAdminRole ? 'Заказы' : 'Личный кабинет / Мои заказы',
    }] : []),
  ]

  return (
    <header className="sticky top-0 z-[100]">
      {/* L1 — белая 58px */}
      <div data-header-l1 className="bg-white border-b border-[#e8e8e8] flex items-center" style={{ height: 58, overflow: 'hidden' }}>
        <div className="max-w-[1480px] w-full mx-auto px-[16px] md:px-[22px] flex items-center" style={{ height: 58 }}>

          {/* Бургер — только мобильный */}
          <button
            onClick={() => setDrawer(true)}
            aria-label="Меню"
            className="md:hidden flex items-center justify-center mr-3 shrink-0"
            style={{ width: 40, height: 40, borderRadius: 11, border: '1px solid #E6DFD9', background: '#fff', color: 'var(--accent)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>

          {/* Логотип */}
          <Link href="/" className="flex items-center gap-[8px] md:mr-9 mr-auto shrink-0 no-underline">
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
              // «Каталог» (/catalog) — спец-кнопка ниже; остальные — обычные ссылки
              const navStyle: React.CSSProperties = {
                height: 58,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent)' : '#444',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }
              const cls = 'flex items-center px-4 text-[13px] no-underline transition-colors'
              // «Каталог» → режим «Все» через обработчик (работает и когда уже на /catalog)
              if (href === '/catalog') {
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
          <Link
            href="/cart"
            aria-label="Корзина"
            className="md:flex hidden items-center gap-2 bg-transparent border-none text-white relative cursor-pointer no-underline"
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
          </Link>
        </div>
      </div>

      {/* Мобильное выезжающее меню */}
      <div className="md:hidden" aria-hidden={!drawer}>
        <div
          onClick={() => setDrawer(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(28,18,22,.45)', zIndex: 200, opacity: drawer ? 1 : 0, pointerEvents: drawer ? 'auto' : 'none', transition: 'opacity .2s' }}
        />
        <aside
          style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, width: '82%', maxWidth: 300, background: '#fff', zIndex: 201,
            display: 'flex', flexDirection: 'column',
            transform: drawer ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform .26s cubic-bezier(.4,0,.2,1)', boxShadow: '0 0 40px rgba(0,0,0,.2)',
          }}
        >
          {/* Шапка меню */}
          <div style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))', color: '#fff', padding: '20px 18px' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="" width={38} height={38} style={{ borderRadius: '50%', objectFit: 'cover' }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 15, lineHeight: 1.1 }}>Цветы Уральска</div>
                  <span style={{ display: 'block', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: .85, lineHeight: 1.6 }}>оптовая база</span>
                </div>
              </div>
              <button onClick={() => setDrawer(false)} aria-label="Закрыть" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(255,255,255,.15)', borderRadius: 8, border: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            {isAuthed && phone && (
              <div style={{ marginTop: 14, fontSize: 12.5, opacity: .9, fontFamily: 'var(--font-jetbrains), monospace' }}>{phone}</div>
            )}
          </div>

          {/* Пункты меню */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
            {([
              { label: 'О нас', href: '/' },
              { label: 'Категории', href: '/categories' },
              { label: 'Каталог', action: goCatalogAll },
              { label: 'Избранное', href: '/favorites', badge: favCount },
              { label: 'Корзина', href: '/cart', badge: cartCount },
              ...(isAuthed && !isAdminRole ? [{ label: 'Личный кабинет', href: '/cabinet' }] : []),
              ...(isAdminRole ? [{ label: 'Заказы', href: '/admin/orders' }, { label: 'Админка', href: '/admin' }] : []),
            ] as { label: string; href?: string; action?: () => void; badge?: number }[]).map(it => {
              const active = it.href ? (it.href === '/' ? pathname === '/' : pathname.startsWith(it.href)) : false
              const inner = (
                <>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.badge != null && it.badge > 0 && (
                    <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: active ? '#fff' : 'var(--accent)', color: active ? 'var(--accent)' : '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{it.badge > 99 ? '99+' : it.badge}</span>
                  )}
                </>
              )
              const st: React.CSSProperties = {
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '13px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: active ? 600 : 500,
                color: active ? 'var(--accent)' : '#333', background: active ? 'var(--accent-light, #F7EEF2)' : 'transparent',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
              }
              return it.href
                ? <Link key={it.label} href={it.href} style={st} onClick={() => setDrawer(false)}>{inner}</Link>
                : <button key={it.label} style={st} onClick={() => { setDrawer(false); it.action?.() }}>{inner}</button>
            })}
          </nav>

          {/* Низ меню — вход/выход */}
          <div style={{ borderTop: '1px solid #eee', padding: 12 }}>
            {isAuthed ? (
              <button onClick={() => { setDrawer(false); logout() }} style={{ width: '100%', padding: '13px', borderRadius: 10, border: '1px solid #E6DFD9', background: '#fff', color: '#7A7780', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Выйти</button>
            ) : (
              <button onClick={() => { setDrawer(false); setShowAuth(true) }} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Войти</button>
            )}
          </div>
        </aside>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </header>
  )
}
