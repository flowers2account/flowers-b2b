'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { authHeaders } from '@/lib/api-token'
import Image from 'next/image'

type ProductHit = {
  id: number
  is_active: boolean
  category: string | null
  name: string
  display_name: string | null
  code_1c: string | null
  supplier_ref: string | null
  source: string | null
  length_cm: number | null
  subcategory: string | null
  image_url: string | null
  colors: string[] | null
}

type ImportRow = {
  id: number
  raw_name: string
  norm_name: string
  qty: number
  price: number
  status: 'unmatched' | 'matched' | 'skipped' | 'applied'
  match_source: string | null
  matched_product_id: number | null
  product: ProductHit | null
}

type Summary = { total: number; unmatched: number; matched: number; skipped: number; applied: number }

type Filter = 'all' | 'unmatched' | 'matched' | 'skipped'

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function SearchBox({ rowId, onMatch }: { rowId: number; onMatch: (p: ProductHit) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ProductHit[]>([])
  const [open, setOpen] = useState(false)
  const dq = useDebounce(q, 280)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (dq.length < 2) { setHits([]); return }
    fetch(`/api/import-xls/search?q=${encodeURIComponent(dq)}`)
      .then(r => r.json()).then(setHits).catch(() => setHits([]))
  }, [dq])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Поиск: название, ID, код 1С, supplier_ref…"
        style={{
          width: '100%', padding: '5px 8px', border: '1px solid #d1d5db',
          borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: 'inherit',
        }}
      />
      {open && hits.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 320, overflowY: 'auto',
        }}>
          {hits.map(h => (
            <div
              key={h.id}
              onMouseDown={() => { onMatch(h); setQ(''); setHits([]); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
              }}
              className="hover:bg-gray-50"
            >
              {h.image_url && (
                <Image src={h.image_url} alt="" width={32} height={32}
                  style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {h.display_name || h.name}
                  </span>
                  <span style={{ fontSize: 9, color: h.is_active ? '#047857' : '#b45309', background: h.is_active ? '#d1fae5' : '#fef3c7', borderRadius: 999, padding: '1px 5px', flexShrink: 0 }}>
                    {h.is_active ? 'активна' : 'неактивна'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>
                  #{h.id}{h.category ? ` · ${h.category}` : ''}{h.code_1c ? ` · 1С ${h.code_1c}` : ''}{h.supplier_ref ? ` · ref ${h.supplier_ref}` : ''}{h.source ? ` · ${h.source}` : ''}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.name}{h.length_cm ? ` · ${h.length_cm}см` : ''}{h.subcategory ? ` · ${h.subcategory}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MappingPage() {
  const params = useParams()
  const importId = params.importId as string
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()
  const userId = useAuthStore(s => s.user?.id)

  const [rows, setRows] = useState<ImportRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ applied: number; errors: number } | null>(null)
  const [creating, setCreating] = useState<Set<number>>(new Set())

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (isAuthed === false) router.replace('/admin')
  }, [isAuthed])

  const loadRows = useCallback(async () => {
    setLoading(true)
    const headers = await authHeaders()
    fetch(`/api/import-xls/rows?importId=${importId}`, { headers })
      .then(r => r.json())
      .then(data => { setRows(data.rows ?? []); setSummary(data.summary ?? null) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [importId])

  useEffect(() => { loadRows() }, [loadRows])

  async function handleMatch(rowId: number, product: ProductHit) {
    setRows(prev => prev.map(r => r.id === rowId
      ? { ...r, status: 'matched', matched_product_id: product.id, match_source: 'manual', product }
      : r
    ))
    setSummary(prev => prev ? { ...prev, unmatched: prev.unmatched - 1, matched: prev.matched + 1 } : prev)

    await fetch('/api/import-xls/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ rowId, productId: product.id, action: 'match', userId }),
    })
  }

  async function handleUnmatch(rowId: number) {
    setRows(prev => prev.map(r => r.id === rowId
      ? { ...r, status: 'unmatched', matched_product_id: null, match_source: null, product: null }
      : r
    ))
    setSummary(prev => prev ? { ...prev, unmatched: prev.unmatched + 1, matched: prev.matched - 1 } : prev)

    await fetch('/api/import-xls/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ rowId, action: 'unmatch' }),
    })
  }

  async function handleSkip(rowId: number) {
    const row = rows.find(r => r.id === rowId)
    const wasUnmatched = row?.status === 'unmatched'
    const wasMatched = row?.status === 'matched'

    setRows(prev => prev.map(r => r.id === rowId
      ? { ...r, status: 'skipped', matched_product_id: null, match_source: null, product: null }
      : r
    ))
    setSummary(prev => prev ? {
      ...prev,
      unmatched: wasUnmatched ? prev.unmatched - 1 : prev.unmatched,
      matched: wasMatched ? prev.matched - 1 : prev.matched,
      skipped: prev.skipped + 1,
    } : prev)

    await fetch('/api/import-xls/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ rowId, action: 'skip' }),
    })
  }

  async function handleCreateProduct(rowId: number) {
    setCreating(prev => new Set(prev).add(rowId))
    try {
      const res = await fetch('/api/import-xls/create-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ rowId }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Ошибка создания'); return }

      const product: ProductHit = data.product
      setRows(prev => prev.map(r => r.id === rowId
        ? { ...r, status: 'matched', matched_product_id: product.id, match_source: '1c_manual', product }
        : r
      ))
      setSummary(prev => prev ? { ...prev, unmatched: prev.unmatched - 1, matched: prev.matched + 1 } : prev)
    } catch (e) {
      alert('Ошибка: ' + String(e))
    } finally {
      setCreating(prev => { const s = new Set(prev); s.delete(rowId); return s })
    }
  }

  async function handleApply() {
    if (!confirm(`Применить ${summary?.matched ?? 0} совпавших строк к остаткам?`)) return
    setApplying(true)
    try {
      const auth = await authHeaders()
      const applyRes = await fetch('/api/import-xls/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ importId: parseInt(importId), userId }),
      })
      const applyData = await applyRes.json()

      // Finalize: deactivate products not in importedIds
      // (для 1С-импортов apply возвращает categories=[] → finalize не вызывается)
      if (applyData.importedIds?.length > 0 && applyData.categories?.length > 0) {
        await fetch('/api/import-xls/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({
            keepIds: applyData.importedIds,
            categories: applyData.categories,
          }),
        })
      }

      setApplyResult({ applied: applyData.applied ?? 0, errors: applyData.errors ?? 0 })
      loadRows()
    } catch (e) {
      alert('Ошибка при применении: ' + String(e))
    } finally {
      setApplying(false)
    }
  }

  if (!isAuthed || (role !== 'admin' && role !== 'manager')) {
    return <div style={{ padding: 40, color: '#666' }}>Нет доступа</div>
  }

  const visible = rows.filter(r => {
    if (filter === 'all') return r.status !== 'applied'
    return r.status === filter
  })

  const canApply = (summary?.matched ?? 0) > 0
  const blockingUnmatched = summary?.unmatched ?? 0

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => router.push('/admin')}
          style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
        >
          ← Назад
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          Маппинг импорта
        </h1>
      </div>

      {/* Summary chips */}
      {summary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { key: 'all',       label: `Все ${summary.total}`,               color: '#6b7280' },
            { key: 'unmatched', label: `⚠ Не найдены ${summary.unmatched}`,  color: summary.unmatched > 0 ? '#dc2626' : '#16a34a' },
            { key: 'matched',   label: `✓ Совпали ${summary.matched}`,        color: '#2563eb' },
            { key: 'skipped',   label: `— Пропущены ${summary.skipped}`,      color: '#9ca3af' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as Filter)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: `1.5px solid ${filter === tab.key ? tab.color : '#e5e7eb'}`,
                background: filter === tab.key ? tab.color : '#fff',
                color: filter === tab.key ? '#fff' : tab.color,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Apply result */}
      {applyResult && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: applyResult.errors > 0 ? '#fef9c3' : '#dcfce7',
          border: `1px solid ${applyResult.errors > 0 ? '#fde047' : '#86efac'}`,
          fontSize: 13,
        }}>
          Применено: <strong>{applyResult.applied}</strong> товаров.
          {applyResult.errors > 0 && ` Ошибок: ${applyResult.errors}.`}
          {' '}Остатки и цены обновлены.
        </div>
      )}

      {/* Rows table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Загрузка…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          {filter === 'unmatched' ? 'Все строки привязаны!' : 'Нет строк'}
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px 1.4fr 80px',
            gap: 0, background: '#f9fafb', padding: '8px 12px',
            fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em',
            textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb',
          }}>
            <div>Название 1С</div>
            <div style={{ textAlign: 'right' }}>Кол-во</div>
            <div style={{ textAlign: 'right' }}>Цена</div>
            <div>Карточка каталога</div>
            <div />
          </div>

          {visible.map((row, i) => (
            <div
              key={row.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px 1.4fr 80px',
                gap: 0, padding: '9px 12px', alignItems: 'center',
                borderBottom: i < visible.length - 1 ? '1px solid #f3f4f6' : 'none',
                background: row.status === 'unmatched' ? '#fff7f7' : '#fff',
              }}
            >
              {/* 1C name */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{row.raw_name}</div>
                {row.status === 'unmatched' && (
                  <div style={{ fontSize: 10, color: '#dc2626', marginTop: 1 }}>Не найдено в каталоге</div>
                )}
                {row.match_source && row.status === 'matched' && (
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                    {row.match_source === 'alias' ? 'по алиасу'
                      : row.match_source === 'exact_name' ? 'точное совпадение'
                      : row.match_source === '1c_manual' ? <span style={{ color: '#b45309', fontWeight: 600 }}>[1С] новая карточка</span>
                      : 'вручную'}
                  </div>
                )}
                {row.status === 'skipped' && (
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>пропущено</div>
                )}
              </div>

              <div style={{ textAlign: 'right', fontSize: 12, color: '#374151' }}>{row.qty} шт</div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#374151' }}>{row.price} ₸</div>

              {/* Catalog match */}
              <div style={{ paddingLeft: 8 }}>
                {row.status === 'unmatched' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <SearchBox rowId={row.id} onMatch={p => handleMatch(row.id, p)} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => handleCreateProduct(row.id)}
                        disabled={creating.has(row.id)}
                        title="Создать новую карточку товара в каталоге из этой строки"
                        style={{
                          padding: '3px 8px', fontSize: 10, border: '1px solid #d1d5db',
                          borderRadius: 5, background: creating.has(row.id) ? '#f3f4f6' : '#fffbeb',
                          color: creating.has(row.id) ? '#9ca3af' : '#92400e',
                          cursor: creating.has(row.id) ? 'default' : 'pointer',
                          fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        {creating.has(row.id) ? 'Создаётся…' : '+ Создать карточку'}
                      </button>
                      <span style={{ fontSize: 9, color: '#d97706' }}>
                        только если нет в каталоге
                      </span>
                    </div>
                  </div>
                )}
                {row.status === 'matched' && row.product && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {row.product.image_url && (
                      <Image src={row.product.image_url} alt="" width={28} height={28}
                        style={{ objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#1d4ed8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.product.display_name || row.product.name}
                        </span>
                        <span style={{ fontSize: 9, color: row.product.is_active ? '#047857' : '#b45309', background: row.product.is_active ? '#d1fae5' : '#fef3c7', borderRadius: 999, padding: '1px 5px', flexShrink: 0 }}>
                          {row.product.is_active ? 'активна' : 'неактивна'}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>
                        #{row.product.id}{row.product.category ? ` · ${row.product.category}` : ''}{row.product.code_1c ? ` · 1С ${row.product.code_1c}` : ''}{row.product.supplier_ref ? ` · ref ${row.product.supplier_ref}` : ''}{row.product.source ? ` · ${row.product.source}` : ''}{row.product.length_cm ? ` · ${row.product.length_cm} см` : ''}
                      </div>
                    </div>
                  </div>
                )}
                {row.status === 'skipped' && (
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                {(row.status === 'unmatched') && (
                  <button
                    onClick={() => handleSkip(row.id)}
                    title="Пропустить"
                    style={{
                      padding: '3px 8px', fontSize: 11, border: '1px solid #e5e7eb',
                      borderRadius: 5, background: '#fff', color: '#9ca3af',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Пропустить
                  </button>
                )}
                {row.status === 'matched' && (
                  <button
                    onClick={() => handleUnmatch(row.id)}
                    title="Изменить привязку"
                    style={{
                      padding: '3px 8px', fontSize: 11, border: '1px solid #e5e7eb',
                      borderRadius: 5, background: '#fff', color: '#6b7280',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Изменить
                  </button>
                )}
                {row.status === 'skipped' && (
                  <button
                    onClick={() => handleUnmatch(row.id)}
                    style={{
                      padding: '3px 8px', fontSize: 11, border: '1px solid #e5e7eb',
                      borderRadius: 5, background: '#fff', color: '#6b7280',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Вернуть
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply bar */}
      {!applyResult && (
        <div style={{
          marginTop: 20, padding: '14px 16px', background: '#f9fafb',
          border: '1px solid #e5e7eb', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ fontSize: 13, color: '#374151' }}>
            {blockingUnmatched > 0
              ? <><span style={{ color: '#dc2626', fontWeight: 600 }}>{blockingUnmatched} строк не привязаны</span> — привяжите или пропустите их.</>
              : <span style={{ color: '#16a34a', fontWeight: 500 }}>Все строки привязаны. Готово к применению.</span>
            }
          </div>
          <button
            onClick={handleApply}
            disabled={!canApply || applying}
            style={{
              padding: '9px 20px', borderRadius: 7, fontSize: 13, fontWeight: 600,
              background: canApply ? '#7a1c2e' : '#e5e7eb',
              color: canApply ? '#fff' : '#9ca3af',
              border: 'none', cursor: canApply ? 'pointer' : 'default',
              fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            {applying ? 'Применяется…' : `Применить ${summary?.matched ?? 0} строк`}
          </button>
        </div>
      )}
    </div>
  )
}
