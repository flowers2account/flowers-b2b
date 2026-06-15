'use client'

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useFilters } from '@/lib/filter-store'
import { labelForSubcat, leafForSubcat, groupIdForLeafSlug } from '@/lib/category-tree'
import { normalizeQuery } from '@/lib/search-synonyms'
import { clientSearchMatch } from '@/lib/catalog-search'
import { type Product, getAvailable, getPrice } from './ProductCard'

// ── типы ответа /api/search ───────────────────────────────────────────────────
interface SearchProduct {
  id: number
  name: string
  display_name: string | null
  subcategory: string | null
  category: string | null
  price: number
  qty: number
  image_url: string | null
}
interface SearchCategory { slug: string; label: string; count: number }
interface SearchResponse {
  products: SearchProduct[]
  categories: SearchCategory[]
  degraded?: boolean
}

const RECENT_KEY = 'catalog-recent-searches'
const RECENT_MAX = 4
const MIN_CHARS = 2
const DEBOUNCE_MS = 300

function loadRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch { return [] }
}
function saveRecent(q: string): string[] {
  const v = q.trim()
  if (!v) return loadRecent()
  const next = [v, ...loadRecent().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, RECENT_MAX)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
  return next
}

/** Подсветка совпадения: lower() и ё→е сохраняют длину → индексы совпадают с оригиналом. */
function highlight(text: string, query: string): ReactNode {
  const q = normalizeQuery(query)
  if (!q) return text
  const hay = normalizeQuery(text)
  const i = hay.indexOf(q)
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <b style={{ color: 'var(--accent)', fontWeight: 700 }}>{text.slice(i, i + q.length)}</b>
      {text.slice(i + q.length)}
    </>
  )
}

const SearchIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
)

// mode='inline' (по умолчанию) — поиск рисует выдачу в гриде каталога через filter-store.
// mode='navigate' — грида рядом нет (страница «Категории»): submit/категория/недавнее
// уводят на /catalog (?q=… или с выбранной подкатегорией). Компонент один — поведение разведено пропом.
export default function SearchBox({ products = [], mode = 'inline' }: { products?: Product[]; mode?: 'inline' | 'navigate' }) {
  const router = useRouter()
  const navigate = mode === 'navigate'
  const { search, setSearch, setSearchResults, clearSearchResults, searchResultIds } = useFilters()

  const [open, setOpen] = useState(false)
  const [ac, setAc] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<string[]>([])

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoCommitted = useRef(false)

  useEffect(() => { setRecent(loadRecent()) }, [])

  // ── «Популярные категории» — топ подкатегорий по числу товаров (для пустого запроса) ──
  const popularCategories = useMemo<SearchCategory[]>(() => {
    const counts = new Map<string, number>()
    for (const p of products) {
      const slug = p.subcategory || ''
      if (!slug || getAvailable(p.stock) <= 0) continue
      counts.set(slug, (counts.get(slug) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([slug, count]) => ({ slug, label: labelForSubcat(slug), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [products])

  // ── клиентский фолбэк (когда /api/search недоступен) ──
  const clientSearch = useCallback((q: string): SearchProduct[] => {
    const out: SearchProduct[] = []
    for (const p of products) {
      if (getAvailable(p.stock) <= 0) continue
      const hay = `${p.display_name ?? ''} ${p.name}`
      if (clientSearchMatch(hay, q)) {
        out.push({
          id: p.id, name: p.name, display_name: p.display_name ?? null,
          subcategory: p.subcategory ?? null, category: p.category ?? null,
          price: getPrice(p.stock), qty: getAvailable(p.stock), image_url: p.image_url ?? null,
        })
      }
    }
    return out
  }, [products])

  const clientResponse = useCallback((q: string): SearchResponse => {
    const prods = clientSearch(q)
    const counts = new Map<string, number>()
    for (const p of prods) { if (p.subcategory) counts.set(p.subcategory, (counts.get(p.subcategory) ?? 0) + 1) }
    const categories = [...counts.entries()]
      .map(([slug, count]) => ({ slug, label: labelForSubcat(slug), count }))
      .sort((a, b) => b.count - a.count).slice(0, 6)
    return { products: prods.slice(0, 50), categories }
  }, [clientSearch])

  // ── живой дропдаун: дебаунс 300мс, от 2 символов ──
  useEffect(() => {
    const q = search.trim()
    if (q.length < MIN_CHARS) { setAc(null); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error('search failed')
        const data = (await res.json()) as SearchResponse
        if (cancelled) return
        setAc(data.degraded ? clientResponse(q) : data)
      } catch {
        if (!cancelled) setAc(clientResponse(q))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search, clientResponse])

  // ── navigate-режим: уводим на каталог с готовым запросом (?q=…) ──
  const goToCatalogSearch = useCallback((raw: string) => {
    const q = raw.trim()
    if (q.length < MIN_CHARS) return
    setOpen(false)
    setRecent(saveRecent(q))
    router.push(`/catalog?q=${encodeURIComponent(q)}`)
  }, [router])

  // ── коммит полного поиска: грид показывает ранжированную серверную выдачу ──
  const commit = useCallback(async (raw: string) => {
    if (navigate) { goToCatalogSearch(raw); return }
    const q = raw.trim()
    if (q.length < MIN_CHARS) { clearSearchResults(); return }
    setOpen(false)
    setRecent(saveRecent(q))
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('search failed')
      const data = (await res.json()) as SearchResponse
      const ids = (data.degraded ? clientSearch(q) : data.products).map((p) => p.id)
      setSearchResults(ids, q)
    } catch {
      setSearchResults(clientSearch(q).map((p) => p.id), q)
    }
  }, [navigate, goToCatalogSearch, clearSearchResults, setSearchResults, clientSearch])

  // Авто-коммит при входе с ?search=/?q= (CatalogLayout кладёт search в стор). Только inline.
  useEffect(() => {
    if (autoCommitted.current) return
    autoCommitted.current = true
    if (navigate) return
    if (search.trim().length >= MIN_CHARS && searchResultIds === null) commit(search)
  }, [])

  // «/» — фокус на поиск, когда не в поле ввода.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return
      const el = document.activeElement as HTMLElement | null
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return
      e.preventDefault()
      inputRef.current?.focus()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Клик вне — закрыть дропдаун.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const onClear = () => {
    setSearch('')
    clearSearchResults()
    setAc(null)
    inputRef.current?.focus()
    setOpen(true)
  }

  const onPickCategory = (c: SearchCategory) => {
    if (navigate) {
      // c.slug — сырой products.subcategory; уводим в каталог с выбранной подкатегорией (leaf).
      const leafSlug = leafForSubcat(c.slug)?.slug ?? c.slug
      const grp = groupIdForLeafSlug(leafSlug)
      const params = new URLSearchParams({ category: 'accessories', leaves: leafSlug })
      if (grp) params.set('group', grp)
      setOpen(false)
      router.push(`/catalog?${params.toString()}`)
      return
    }
    setSearch(c.label)
    commit(c.label)
  }
  const onPickProduct = (p: SearchProduct) => {
    setOpen(false)
    router.push(`/product/${p.id}`)
  }
  const onPickRecent = (q: string) => {
    if (navigate) { setSearch(q); goToCatalogSearch(q); return }
    setSearch(q)
    commit(q)
  }

  const q = search.trim()
  const typing = q.length >= MIN_CHARS
  const showEmpty = typing && !loading && ac !== null && ac.products.length === 0 && ac.categories.length === 0

  // ── стили ──
  const secTitle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--text-mid)', padding: '10px 14px 4px',
  }
  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
    fontFamily: 'inherit', textAlign: 'left', color: 'var(--text)',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      {/* строка поиска */}
      <div
        className="search"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 8px 0 14px',
          background: '#fff', border: `1.5px solid ${open || q ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-input, 12px)', transition: 'border-color 0.15s',
        }}
      >
        <span style={{ color: 'var(--text-mid)', display: 'flex', flexShrink: 0 }}><SearchIcon /></span>
        <input
          ref={inputRef}
          type="text"
          value={search}
          placeholder="Поиск по названию — например, кашпо или плёнка"
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(search) }
            else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
          }}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'inherit', fontSize: 14, color: 'var(--text)',
          }}
        />
        {q ? (
          <button
            onClick={onClear}
            aria-label="Очистить"
            style={{
              flexShrink: 0, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-mid)', fontSize: 18, lineHeight: 1,
            }}
          >×</button>
        ) : (
          <kbd
            style={{
              flexShrink: 0, fontSize: 11, fontWeight: 600, color: 'var(--text-mid)',
              border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px',
              fontFamily: 'var(--font-jetbrains, monospace)', background: 'var(--bg-soft, #F7F4F1)',
            }}
          >/</kbd>
        )}
      </div>

      {/* дропдаун автоподсказок */}
      {open && (
        <div
          className="ac"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
            background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-card, 14px)',
            boxShadow: '0 8px 28px rgba(40,20,30,0.14)', overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto',
          }}
        >
          {/* пустой запрос: недавние + популярные категории */}
          {!typing && (
            <>
              {recent.length > 0 && (
                <div className="ac-sec">
                  <div style={secTitle}>Недавние запросы</div>
                  {recent.map((r) => (
                    <button key={r} className="ac-item" style={itemStyle} onClick={() => onPickRecent(r)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-soft, #F7F4F1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      <span style={{ color: 'var(--text-mid)', display: 'flex', flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg>
                      </span>
                      <span style={{ fontSize: 13.5 }}>{r}</span>
                    </button>
                  ))}
                </div>
              )}
              {popularCategories.length > 0 && (
                <div className="ac-sec">
                  <div style={secTitle}>Популярные категории</div>
                  {popularCategories.map((c) => (
                    <button key={c.slug} className="ac-item" style={itemStyle} onClick={() => onPickCategory(c)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-soft, #F7F4F1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      <span style={{ color: 'var(--accent)', display: 'flex', flexShrink: 0 }}><SearchIcon size={15} /></span>
                      <span style={{ fontSize: 13.5, flex: 1 }}>{c.label}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-mid)', flexShrink: 0 }}>{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
              {recent.length === 0 && popularCategories.length === 0 && (
                <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--text-mid)' }}>
                  Начните вводить название товара
                </div>
              )}
            </>
          )}

          {/* ввод: категории + товары */}
          {typing && (
            <>
              {ac && ac.categories.length > 0 && (
                <div className="ac-sec">
                  <div style={secTitle}>Категории</div>
                  {ac.categories.map((c) => (
                    <button key={c.slug} className="ac-item" style={itemStyle} onClick={() => onPickCategory(c)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-soft, #F7F4F1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      <span style={{ color: 'var(--accent)', display: 'flex', flexShrink: 0 }}><SearchIcon size={15} /></span>
                      <span style={{ fontSize: 13.5, flex: 1 }}>{highlight(c.label, q)}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-mid)', flexShrink: 0 }}>{c.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {ac && ac.products.length > 0 && (
                <div className="ac-sec">
                  <div style={secTitle}>Товары</div>
                  {ac.products.slice(0, 5).map((p) => {
                    const title = p.display_name || p.name
                    const inStock = p.qty > 0
                    return (
                      <button key={p.id} className="ac-item" style={itemStyle} onClick={() => onPickProduct(p)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-soft, #F7F4F1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                        <span style={{
                          flexShrink: 0, width: 36, height: 36, borderRadius: 8, overflow: 'hidden',
                          background: 'var(--bg-soft, #F2EDE9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {p.image_url
                            ? /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={p.image_url} alt="" width={36} height={36} style={{ objectFit: 'cover', width: 36, height: 36 }} />
                            : <span style={{ color: 'var(--text-mid)' }}><SearchIcon size={15} /></span>}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {highlight(title, q)}
                          </span>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-mid)' }}>
                            {inStock ? `${p.qty} шт в наличии` : 'нет в наличии'} · {Math.round(p.price).toLocaleString('ru-RU')} ₸
                          </span>
                        </span>
                        {p.subcategory && (
                          <span style={{ fontSize: 11, color: 'var(--text-mid)', flexShrink: 0, maxWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {labelForSubcat(p.subcategory)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {showEmpty && (
                <div className="ac-empty" style={{ padding: '18px 14px', fontSize: 13, color: 'var(--text-mid)', textAlign: 'center' }}>
                  Ничего не нашлось по «{q}». Проверьте написание.
                </div>
              )}

              {!showEmpty && (
                <button
                  className="ac-foot"
                  onClick={() => commit(search)}
                  style={{
                    width: '100%', padding: '11px 14px', border: 'none', borderTop: '1px solid var(--border)',
                    background: 'var(--bg-soft, #F7F4F1)', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', textAlign: 'left',
                  }}
                >
                  Показать все результаты по «{q}»
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
