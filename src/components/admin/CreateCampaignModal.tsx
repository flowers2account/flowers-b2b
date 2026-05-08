'use client'

import { useState } from 'react'
import type { CampaignType } from '@/types/campaigns'

interface Product {
  id: string
  name: string
  variety_name: string | null
  length_str: string | null
  category: string | null
  stock: { price: number | null }[] | null
}

interface ItemState {
  price: string
  pack_size: string
  min_qty: string
}

interface Props {
  onClose: () => void
  onCreated: () => void
}

const PRICE_GROUPS = ['vip', 'wholesale', 'retail']

export default function CreateCampaignModal({ onClose, onCreated }: Props) {
  // Step 1
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<CampaignType>('europe')
  const [closesAt, setClosesAt] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [description, setDescription] = useState('')
  const [priceGroups, setPriceGroups] = useState<string[]>(['vip', 'wholesale'])

  // Step 2
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [selected, setSelected] = useState<Record<string, ItemState>>({})

  // Shared
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)

  function toggleGroup(g: string) {
    setPriceGroups(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    )
  }

  async function goToStep2() {
    if (!title.trim() || !closesAt || !deliveryDate) {
      setError('Заполните название, дату закрытия и дату поставки')
      return
    }
    setError('')
    setStep(2)
    if (products.length === 0) {
      setLoadingProducts(true)
      try {
        const res = await fetch('/api/products')
        const data = await res.json()
        setProducts(Array.isArray(data) ? data : [])
      } catch {
        // продолжаем с пустым списком
      } finally {
        setLoadingProducts(false)
      }
    }
  }

  function toggleProduct(id: string, currentPrice: number | null) {
    setSelected(prev => {
      if (prev[id]) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return {
        ...prev,
        [id]: {
          price: currentPrice != null ? String(currentPrice) : '',
          pack_size: '1',
          min_qty: '1',
        },
      }
    })
  }

  function updateItem(id: string, field: keyof ItemState, value: string) {
    setSelected(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.variety_name ?? '').toLowerCase().includes(q)
    )
  })

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const items = Object.entries(selected).map(([product_id, s]) => ({
        product_id,
        price: parseFloat(s.price) || 0,
        pack_size: parseInt(s.pack_size) || 1,
        min_qty: parseInt(s.min_qty) || 1,
      }))

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          type,
          closes_at: new Date(closesAt).toISOString(),
          delivery_date: deliveryDate,
          description: description.trim() || undefined,
          allowed_price_groups: priceGroups,
          items,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Ошибка при создании')
        return
      }
      onCreated()
    } catch {
      setError('Сетевая ошибка')
    } finally {
      setLoading(false)
    }
  }

  const selectedCount = Object.keys(selected).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${step === 2 ? 'max-w-2xl' : 'max-w-md'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800">Новая кампания</h2>
            <div className="flex items-center gap-1">
              {[1, 2].map(s => (
                <div
                  key={s}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${
                    s === step
                      ? 'bg-[#7a1c2e] text-white'
                      : s < step
                      ? 'bg-[#7a1c2e]/20 text-[#7a1c2e]'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* ── Шаг 1: основные поля ── */}
        {step === 1 && (
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Название <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Голландия май 2026"
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7a1c2e]/30 focus:border-[#7a1c2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Тип</label>
              <div className="flex gap-2">
                {(['europe', 'china'] as CampaignType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                      type === t
                        ? 'bg-[#7a1c2e] text-white border-[#7a1c2e]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {t === 'europe' ? 'Европа' : 'Китай'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Дата закрытия приёма заказов <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={closesAt}
                min={nowLocal}
                onChange={e => setClosesAt(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7a1c2e]/30 focus:border-[#7a1c2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Дата поставки <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={deliveryDate}
                min={closesAt ? closesAt.slice(0, 10) : undefined}
                onChange={e => setDeliveryDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7a1c2e]/30 focus:border-[#7a1c2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Описание <span className="text-gray-400">(необязательно)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Инвойс от поставщика, условия доставки..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7a1c2e]/30 focus:border-[#7a1c2e] resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ценовые группы</label>
              <div className="flex gap-4">
                {PRICE_GROUPS.map(g => (
                  <label key={g} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={priceGroups.includes(g)}
                      onChange={() => toggleGroup(g)}
                      className="accent-[#7a1c2e]"
                    />
                    <span className="text-sm text-gray-700">{g}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={goToStep2}
                className="flex-1 py-2 text-sm bg-[#7a1c2e] text-white rounded-lg hover:bg-[#621624] transition-colors"
              >
                Далее →
              </button>
            </div>
          </div>
        )}

        {/* ── Шаг 2: товары ── */}
        {step === 2 && (
          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по названию или сорту..."
                autoFocus
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7a1c2e]/30 focus:border-[#7a1c2e]"
              />
              {selectedCount > 0 && (
                <span className="text-xs font-semibold text-[#7a1c2e] whitespace-nowrap">
                  {selectedCount} выбрано
                </span>
              )}
            </div>

            {/* Список товаров */}
            <div className="overflow-y-auto max-h-[420px] border border-gray-100 rounded-lg divide-y divide-gray-50">
              {loadingProducts ? (
                <div className="text-center py-10 text-sm text-gray-400">Загрузка товаров...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 text-sm text-gray-400">Ничего не найдено</div>
              ) : (
                filtered.map(p => {
                  const isChecked = !!selected[p.id]
                  const currentPrice = p.stock?.[0]?.price ?? null
                  const displayName = [p.variety_name || p.name, p.length_str]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <div
                      key={p.id}
                      className={`px-3 py-2.5 ${isChecked ? 'bg-[#7a1c2e]/[0.04]' : 'hover:bg-gray-50'}`}
                    >
                      {/* Строка с чекбоксом */}
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id={`p-${p.id}`}
                          checked={isChecked}
                          onChange={() => toggleProduct(p.id, currentPrice)}
                          className="accent-[#7a1c2e] mt-0.5 flex-shrink-0"
                        />
                        <label htmlFor={`p-${p.id}`} className="flex-1 min-w-0 cursor-pointer">
                          <span className="text-sm text-gray-800 block truncate">{displayName}</span>
                          <span className="text-xs text-gray-400">
                            {p.category ?? ''}
                            {currentPrice != null && (
                              <> · текущая цена: <span className="text-gray-500">{currentPrice} ₽</span></>
                            )}
                          </span>
                        </label>
                      </div>

                      {/* Поля для выбранного товара */}
                      {isChecked && (
                        <div className="mt-2.5 ml-6 grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Цена, ₽</label>
                            <input
                              type="number"
                              value={selected[p.id].price}
                              onChange={e => updateItem(p.id, 'price', e.target.value)}
                              min={0}
                              step={0.01}
                              placeholder="0"
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#7a1c2e]/40 focus:border-[#7a1c2e]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Уп. (шт)</label>
                            <input
                              type="number"
                              value={selected[p.id].pack_size}
                              onChange={e => updateItem(p.id, 'pack_size', e.target.value)}
                              min={1}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#7a1c2e]/40 focus:border-[#7a1c2e]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Мин. кол.</label>
                            <input
                              type="number"
                              value={selected[p.id].min_qty}
                              onChange={e => updateItem(p.id, 'min_qty', e.target.value)}
                              min={1}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#7a1c2e]/40 focus:border-[#7a1c2e]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setStep(1); setError('') }}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ← Назад
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-2 text-sm bg-[#7a1c2e] text-white rounded-lg hover:bg-[#621624] disabled:opacity-60 transition-colors"
              >
                {loading ? 'Создание...' : `Создать кампанию${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
