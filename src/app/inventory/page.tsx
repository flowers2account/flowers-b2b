'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/auth-store'

type InventorySession = {
  id: string
  user_id: string
  started_at: string
  completed_at: string | null
  notes: string | null
}

type ProductRow = {
  id: number
  name: string
  variety_name: string | null
  length_str: string | null
  current_qty: number
  count_id: string | null
  counts: number[]
  total_counted: number
  system_stock: number
  difference: number | null
}

export default function InventoryPage() {
  const router = useRouter()
  const { user, role, isAuthed, init } = useAuthStore()
  const supabase = createClient()

  const [session, setSession] = useState<InventorySession | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (isAuthed && role !== 'admin' && role !== 'manager') router.replace('/')
  }, [isAuthed, role])

  useEffect(() => {
    if (!isAuthed || !user) return
    loadActiveSession()
  }, [isAuthed, user])

  async function loadActiveSession() {
    setLoading(true)
    const res = await fetch(`/api/inventory/sessions?userId=${user!.id}`)
    const { data } = await res.json()
    if (data) {
      setSession(data)
      await loadSessionData(data.id)
    }
    setLoading(false)
  }

  async function loadSessionData(sessionId: string) {
    const [{ data: productsData }, { data: stockData }, { data: countsData }] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, variety_name, length_str')
        .eq('is_active', true)
        .order('variety_name')
        .order('name'),
      supabase
        .from('stock_available')
        .select('product_id, qty')
        .gt('qty', 0),
      supabase
        .from('inventory_counts')
        .select('*')
        .eq('session_id', sessionId),
    ])

    const stockMap = new Map<number, number>()
    for (const s of stockData ?? []) stockMap.set(s.product_id, s.qty)

    const countsMap = new Map<number, NonNullable<typeof countsData>[0]>()
    for (const c of countsData ?? []) countsMap.set(c.product_id, c)

    type RawProduct = { id: number; name: string; variety_name: string | null; length_str: string | null }
    const rows: ProductRow[] = (productsData as RawProduct[] ?? [])
      .filter((p: RawProduct) => stockMap.has(p.id))
      .map((p: RawProduct) => {
        const qty = stockMap.get(p.id) ?? 0
        const cnt = countsMap.get(p.id)
        return {
          id: p.id,
          name: p.name,
          variety_name: p.variety_name,
          length_str: p.length_str,
          current_qty: qty,
          count_id: cnt?.id ?? null,
          counts: cnt?.counts ?? [],
          total_counted: cnt?.total_counted ?? 0,
          system_stock: cnt?.system_stock ?? qty,
          difference: cnt != null ? cnt.total_counted - cnt.system_stock : null,
        }
      })

    setProducts(rows)
  }

  async function startSession() {
    if (!user) return
    setStarting(true)
    const res = await fetch('/api/inventory/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
    const { data } = await res.json()
    if (data) {
      setSession(data)
      await loadSessionData(data.id)
    }
    setStarting(false)
  }

  async function addCount(count: number) {
    if (!session || !selectedId || count <= 0 || saving) return
    setSaving(true)

    const res = await fetch('/api/inventory/add-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, product_id: selectedId, count, userId: user!.id }),
    })
    const { data } = await res.json()

    if (data) {
      setProducts(prev => prev.map(p => p.id === selectedId ? {
        ...p,
        count_id: data.id,
        counts: data.counts,
        total_counted: data.total_counted,
        system_stock: data.system_stock,
        difference: data.total_counted - data.system_stock,
      } : p))
    }

    setInputValue('')
    setSaving(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function completeSession() {
    if (!session || completing) return
    setCompleting(true)
    const res = await fetch(`/api/inventory/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user!.id }),
    })
    const { data } = await res.json()
    if (data) {
      setSession(data)
      setSelectedId(null)
    }
    setCompleting(false)
  }

  function selectProduct(id: number) {
    setSelectedId(prev => {
      const next = prev === id ? null : id
      if (next !== null) setTimeout(() => inputRef.current?.focus(), 50)
      return next
    })
    setInputValue('')
  }

  function handleQuickAdd(n: number) {
    addCount(n)
  }

  function handleManualAdd() {
    const v = parseInt(inputValue)
    if (v > 0) addCount(v)
  }

  const selectedProduct = products.find(p => p.id === selectedId) ?? null
  const isCompleted = !!session?.completed_at
  const counted = products.filter(p => p.counts.length > 0).length
  const discrepancies = products.filter(p => p.difference !== null && p.difference !== 0).length

  if (!isAuthed) return null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#7a1c2e' }} />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="text-5xl mb-4">📦</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Инвентаризация</h1>
        <p className="text-gray-500 text-sm mb-8 text-center">Подсчёт остатков и сверка со складской системой</p>
        <button
          onClick={startSession}
          disabled={starting}
          className="px-8 py-3 text-white font-semibold rounded-xl disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: '#7a1c2e' }}
        >
          {starting ? 'Создание...' : 'Начать инвентаризацию'}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingBottom: selectedProduct && !isCompleted ? 148 : 24 }}>

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-800">Инвентаризация</h1>
            <p className="text-xs text-gray-400">
              {isCompleted
                ? `Завершена ${new Date(session.completed_at!).toLocaleString('ru-RU', { timeZone: 'Asia/Oral' })}`
                : `Начата ${new Date(session.started_at).toLocaleString('ru-RU', { timeZone: 'Asia/Oral' })}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <>
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Завершена</span>
                <button
                  onClick={() => { setSession(null); setProducts([]); setSelectedId(null) }}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Новая
                </button>
              </>
            ) : (
              <button
                onClick={completeSession}
                disabled={completing}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: '#3D6B50' }}
              >
                {completing ? '...' : '✓ Завершить'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-1">
        <div className="flex gap-4 text-xs text-gray-500">
          <span><b className="text-gray-700">{products.length}</b> товаров</span>
          <span><b className="text-gray-700">{counted}</b> подсчитано</span>
          {discrepancies > 0 && (
            <span className="text-red-500"><b>{discrepancies}</b> расхождений</span>
          )}
        </div>
      </div>

      {/* Product list */}
      <div className="max-w-2xl mx-auto px-4 py-2 space-y-1.5">
        {products.map(p => {
          const isSelected = p.id === selectedId
          const hasCounts = p.counts.length > 0
          const diff = p.difference

          return (
            <div
              key={p.id}
              onClick={() => !isCompleted && selectProduct(p.id)}
              className={`bg-white rounded-xl border px-3 py-2.5 transition-all ${!isCompleted ? 'cursor-pointer active:bg-gray-50' : ''}`}
              style={isSelected
                ? { borderColor: '#7a1c2e', boxShadow: '0 0 0 2px rgba(122,28,46,0.12)' }
                : { borderColor: '#e5e7eb' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate leading-tight">
                    {p.variety_name || p.name}
                    {p.length_str && <span className="text-gray-400 font-normal"> {p.length_str}</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400">Сис: {p.system_stock}</span>
                    {hasCounts && (
                      <span className="text-xs text-gray-500">
                        {p.counts.map(c => `+${c}`).join(' ')}
                        {' '}<span className="font-semibold text-gray-700">= {p.total_counted}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {diff !== null ? (
                    <span className={`text-sm font-bold tabular-nums ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {diff > 0 ? `+${diff}` : diff === 0 ? '✓' : diff}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-200">—</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {products.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Нет товаров в наличии</div>
        )}
      </div>

      {/* Fixed input panel */}
      {selectedProduct && !isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-xl px-4 pt-3 pb-4">
          <div className="max-w-2xl mx-auto">
            <p className="text-xs font-semibold text-gray-700 mb-2 truncate">
              {selectedProduct.variety_name || selectedProduct.name}
              {selectedProduct.length_str ? ` · ${selectedProduct.length_str}` : ''}
              <span className="font-normal text-gray-400 ml-2">Сис: {selectedProduct.system_stock}</span>
            </p>
            <div className="flex gap-2 mb-2">
              <input
                ref={inputRef}
                type="number"
                min="1"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleManualAdd() }}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:border-gray-400"
                placeholder="Количество"
              />
              <button
                onClick={handleManualAdd}
                disabled={!inputValue || saving}
                className="px-5 py-2 text-white font-bold rounded-lg disabled:opacity-40 transition-opacity text-lg"
                style={{ backgroundColor: '#7a1c2e' }}
              >
                {saving ? '…' : '+'}
              </button>
            </div>
            <div className="flex gap-1.5">
              {[1, 5, 10, 25, 50].map(n => (
                <button
                  key={n}
                  onClick={() => handleQuickAdd(n)}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  +{n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
