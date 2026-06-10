'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCart } from '@/lib/cart-store'
import { useFavorites } from '@/lib/favorites-store'

/**
 * Глобальная нижняя таб-панель для мобильных (<768px).
 * Скрыта на /catalog (там собственный нижний бар Фильтры/Корзина в CatalogLayout),
 * а также в админке и на странице входа.
 */

const IC = {
  catalog: <path d="M3 5h18M3 12h18M3 19h18" />,
  categories: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  fav: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  cart: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
}

export default function MobileTabBar() {
  const pathname = usePathname()
  const cartCount = useCart(s => s.items.reduce((n, i) => n + i.qty, 0))
  const favCount = useFavorites(s => s.ids.size)

  // не показываем там, где своя мобильная навигация / она лишняя
  if (
    pathname.startsWith('/catalog') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/preorder')
  ) return null

  const items: { href: string; label: string; icon: React.ReactNode; badge?: number; match: (p: string) => boolean }[] = [
    { href: '/catalog', label: 'Каталог', icon: IC.catalog, match: p => p.startsWith('/catalog') },
    { href: '/categories', label: 'Категории', icon: IC.categories, match: p => p.startsWith('/categories') },
    { href: '/favorites', label: 'Избранное', icon: IC.fav, badge: favCount, match: p => p.startsWith('/favorites') },
    { href: '/cart', label: 'Корзина', icon: IC.cart, badge: cartCount, match: p => p.startsWith('/cart') },
    { href: '/cabinet', label: 'Кабинет', icon: IC.user, match: p => p.startsWith('/cabinet') },
  ]

  return (
    <>
      {/* распорка, чтобы фикс-бар не перекрывал низ страницы */}
      <div className="md:hidden" style={{ height: 'calc(60px + env(safe-area-inset-bottom, 0px))' }} />
      <nav
        className="md:hidden"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 150,
          display: 'flex', background: '#fff', borderTop: '1px solid #EFEAE5',
          padding: '7px 6px calc(7px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -4px 20px rgba(40,20,30,.06)',
        }}
      >
        {items.map(it => {
          const on = it.match(pathname)
          return (
            <Link
              key={it.href}
              href={it.href}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: on ? 600 : 500, color: on ? 'var(--accent, #8B3A5A)' : '#A8A4AD',
                textDecoration: 'none', position: 'relative', padding: '2px 0',
              }}
            >
              <span style={{ position: 'relative' }}>
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
                {it.badge != null && it.badge > 0 && (
                  <span style={{ position: 'absolute', top: -5, right: -8, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--accent, #8B3A5A)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>{it.badge > 99 ? '99+' : it.badge}</span>
                )}
              </span>
              {it.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
