'use client'

import { useState } from 'react'
import type { PreorderItem } from '@/app/admin/preorder-actions'
import { assemblePreorder } from '@/app/admin/preorder-actions'

interface Props {
  orderId: number
  items: PreorderItem[]
  onClose: () => void
  onSaved: () => void
}

interface ItemState {
  id: number
  campaign_item_id: number
  qty_actual: number
  is_removed: boolean
  price: number
  label: string
}

function itemLabel(item: PreorderItem): string {
  const p = item.campaign_items?.products
  return p?.display_name || p?.name || `Позиция #${item.id}`
}

export default function PreorderAssemblyModal({ orderId, items, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<ItemState[]>(
    items.map(item => ({
      id:               item.id,
      campaign_item_id: item.campaign_item_id,
      qty_actual:       item.qty_actual ?? item.qty_ordered,
      is_removed:       item.is_removed,
      price:            item.price,
      label:            itemLabel(item),
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function setQty(id: number, val: number) {
    setRows(r => r.map(row => row.id === id ? { ...row, qty_actual: Math.max(0, val) } : row))
  }

  function toggleRemoved(id: number) {
    setRows(r => r.map(row => row.id === id ? { ...row, is_removed: !row.is_removed } : row))
  }

  const newTotal = rows
    .filter(r => !r.is_removed)
    .reduce((s, r) => s + r.qty_actual * r.price, 0)

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error: err } = await assemblePreorder({
      order_id: orderId,
      items: rows.map(r => ({ id: r.id, qty_actual: r.qty_actual, is_removed: r.is_removed })),
    })
    setSaving(false)
    if (err) { setError(err); return }
    onSaved()
  }

  const activeCount = rows.filter(r => !r.is_removed).length

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Сборка предзаказа #{orderId}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-xl leading-none"
          >×</button>
        </div>

        {/* Items */}
        <div className="divide-y divide-gray-100">
          {rows.map(row => {
            const orig = items.find(i => i.id === row.id)!
            return (
              <div key={row.id} className={`px-6 py-3 flex items-center gap-3 ${row.is_removed ? 'opacity-40' : ''}`}>
                <button
                  onClick={() => toggleRemoved(row.id)}
                  title={row.is_removed ? 'Восстановить' : 'Убрать позицию'}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    row.is_removed
                      ? 'border-red-400 bg-red-50 text-red-500'
                      : 'border-gray-300 hover:border-red-400'
                  }`}
                >
                  {row.is_removed ? '×' : ''}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{row.label}</div>
                  <div className="text-xs text-gray-400">
                    Заказано: {orig.qty_ordered} шт. · {row.price.toLocaleString('ru-RU')} ₸/шт.
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setQty(row.id, row.qty_actual - 1)}
                    disabled={row.is_removed || row.qty_actual <= 0}
                    className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 text-sm"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    value={row.qty_actual}
                    disabled={row.is_removed}
                    onChange={e => setQty(row.id, parseInt(e.target.value) || 0)}
                    className="w-14 text-center text-sm border border-gray-200 rounded py-1 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <button
                    onClick={() => setQty(row.id, row.qty_actual + 1)}
                    disabled={row.is_removed}
                    className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 text-sm"
                  >+</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-sm text-gray-600">
          Позиций: <span className="font-semibold text-gray-800">{activeCount}</span>
          {' · '}Итого: <span className="font-semibold text-[#7a1c2e]">{newTotal.toLocaleString('ru-RU')} ₸</span>
        </div>

        {error && (
          <div className="mx-6 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[#7a1c2e] text-white rounded-lg hover:bg-[#621624] disabled:opacity-40"
          >
            {saving ? 'Сохранение...' : 'Завершить сборку'}
          </button>
        </div>
      </div>
    </div>
  )
}
