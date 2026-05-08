'use client'

import { useState } from 'react'
import type { CampaignType } from '@/types/campaigns'

interface Props {
  onClose: () => void
  onCreated: () => void
}

const PRICE_GROUPS = ['vip', 'wholesale', 'retail']

export default function CreateCampaignModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<CampaignType>('europe')
  const [closesAt, setClosesAt] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [description, setDescription] = useState('')
  const [priceGroups, setPriceGroups] = useState<string[]>(['vip', 'wholesale'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleGroup(g: string) {
    setPriceGroups(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !closesAt || !deliveryDate) {
      setError('Заполните название, дату закрытия и дату поставки')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          type,
          closes_at: new Date(closesAt).toISOString(),
          delivery_date: deliveryDate,
          description: description.trim() || undefined,
          allowed_price_groups: priceGroups,
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

  // Минимальное значение для datetime-local — сейчас
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Новая кампания</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Название <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Голландия май 2026"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7a1c2e]/30 focus:border-[#7a1c2e]"
              autoFocus
            />
          </div>

          {/* Type */}
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

          {/* Closes at */}
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

          {/* Delivery date */}
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

          {/* Description */}
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

          {/* Price groups */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ценовые группы</label>
            <div className="flex gap-2">
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

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 text-sm bg-[#7a1c2e] text-white rounded-lg hover:bg-[#621624] disabled:opacity-60 transition-colors"
            >
              {loading ? 'Создание...' : 'Создать кампанию'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
