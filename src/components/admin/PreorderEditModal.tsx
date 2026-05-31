'use client'

import { useEffect, useState } from 'react'
import type { PreorderItem, CampaignItemOption } from '@/app/admin/preorder-actions'
import { savePreorderEdits, getCampaignItemsForOrder } from '@/app/admin/preorder-actions'

interface Props {
  orderId:    number
  campaignId: number
  items:      PreorderItem[]
  onClose:    () => void
  onSaved:    () => void
}

interface RowState {
  id:         number
  label:      string
  price:      number
  pack_size:  number
  qty_ordered: number
  is_removed: boolean
}

interface NewRow {
  key:              number
  campaign_item_id: number
  qty:              number
  label:            string
  price:            number
  pack_size:        number
}

function itemLabel(item: PreorderItem): string {
  const p = item.campaign_items?.products
  return p?.display_name || p?.name || `Позиция #${item.id}`
}

function optionLabel(opt: CampaignItemOption): string {
  return opt.display_name || opt.name || `Позиция #${opt.id}`
}

export default function PreorderEditModal({ orderId, campaignId, items, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<RowState[]>(
    items.map(item => ({
      id:          item.id,
      label:       itemLabel(item),
      price:       item.price,
      pack_size:   1,
      qty_ordered: item.qty_ordered,
      is_removed:  item.is_removed,
    }))
  )
  const [newRows, setNewRows]     = useState<NewRow[]>([])
  const [note, setNote]           = useState('')
  const [options, setOptions]     = useState<CampaignItemOption[]>([])
  const [optsLoading, setOptsLoading] = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [nextKey, setNextKey]     = useState(0)

  useEffect(() => {
    getCampaignItemsForOrder(campaignId)
      .then(({ items: opts }) => setOptions(opts ?? []))
      .finally(() => setOptsLoading(false))
  }, [campaignId])

  function setQty(id: number, val: number) {
    setRows(r => r.map(row => row.id === id ? { ...row, qty_ordered: Math.max(1, val) } : row))
  }

  function toggleRemoved(id: number) {
    setRows(r => r.map(row => row.id === id ? { ...row, is_removed: !row.is_removed } : row))
  }

  function addItem(optId: number) {
    const opt = options.find(o => o.id === optId)
    if (!opt) return
    const pack = opt.pack_size ?? 1
    setNewRows(r => [...r, {
      key:              nextKey,
      campaign_item_id: opt.id,
      qty:              opt.min_qty ?? pack,
      label:            optionLabel(opt),
      price:            opt.price,
      pack_size:        pack,
    }])
    setNextKey(k => k + 1)
  }

  function setNewQty(key: number, val: number) {
    setNewRows(r => r.map(row => row.key === key ? { ...row, qty: Math.max(row.pack_size, val) } : row))
  }

  function removeNewRow(key: number) {
    setNewRows(r => r.filter(row => row.key !== key))
  }

  const activeExisting = rows.filter(r => !r.is_removed)
  const newTotal = [
    ...activeExisting.map(r => r.qty_ordered * r.price),
    ...newRows.map(r => r.qty * r.price),
  ].reduce((s, v) => s + v, 0)

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error: err } = await savePreorderEdits({
      order_id:  orderId,
      updates:   rows.map(r => ({ id: r.id, qty_ordered: r.qty_ordered, is_removed: r.is_removed })),
      new_items: newRows.map(r => ({ campaign_item_id: r.campaign_item_id, qty: r.qty })),
      note:      note.trim() || undefined,
    })
    setSaving(false)
    if (err) { setError(err); return }
    onSaved()
  }

  const alreadyInOrder = new Set([
    ...items.map(i => i.campaign_item_id),
    ...newRows.map(r => r.campaign_item_id),
  ])
  const availableOptions = options.filter(o => !alreadyInOrder.has(o.id))

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Корректировка предзаказа #{orderId}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-xl leading-none"
          >×</button>
        </div>

        {/* Existing items */}
        <div className="divide-y divide-gray-100">
          {rows.map(row => (
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
                <div className={`text-sm font-medium truncate ${row.is_removed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {row.label}
                </div>
                <div className="text-xs text-gray-400">{row.price.toLocaleString('ru-RU')} ₸/шт.</div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setQty(row.id, row.qty_ordered - row.pack_size)}
                  disabled={row.is_removed || row.qty_ordered <= row.pack_size}
                  className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 text-sm"
                >−</button>
                <input
                  type="number"
                  min={row.pack_size}
                  step={row.pack_size}
                  value={row.qty_ordered}
                  disabled={row.is_removed}
                  onChange={e => setQty(row.id, parseInt(e.target.value) || row.pack_size)}
                  className="w-16 text-center text-sm border border-gray-200 rounded py-1 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <button
                  onClick={() => setQty(row.id, row.qty_ordered + row.pack_size)}
                  disabled={row.is_removed}
                  className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 text-sm"
                >+</button>
              </div>
            </div>
          ))}

          {/* New rows */}
          {newRows.map(row => (
            <div key={row.key} className="px-6 py-3 flex items-center gap-3 bg-green-50/60">
              <button
                onClick={() => removeNewRow(row.key)}
                title="Удалить"
                className="w-5 h-5 rounded border-2 border-red-400 bg-red-50 text-red-500 flex items-center justify-center shrink-0 text-sm"
              >×</button>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{row.label}</div>
                <div className="text-xs text-green-600">Новая · {row.price.toLocaleString('ru-RU')} ₸/шт.</div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setNewQty(row.key, row.qty - row.pack_size)}
                  disabled={row.qty <= row.pack_size}
                  className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 text-sm"
                >−</button>
                <input
                  type="number"
                  min={row.pack_size}
                  step={row.pack_size}
                  value={row.qty}
                  onChange={e => setNewQty(row.key, parseInt(e.target.value) || row.pack_size)}
                  className="w-16 text-center text-sm border border-gray-200 rounded py-1"
                />
                <button
                  onClick={() => setNewQty(row.key, row.qty + row.pack_size)}
                  className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                >+</button>
              </div>
            </div>
          ))}
        </div>

        {/* Add item */}
        <div className="px-6 py-3 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Добавить позицию из акции</div>
          {optsLoading ? (
            <div className="text-sm text-gray-400">Загрузка...</div>
          ) : availableOptions.length === 0 ? (
            <div className="text-sm text-gray-400">Все позиции акции уже в заказе</div>
          ) : (
            <select
              defaultValue=""
              onChange={e => { if (e.target.value) { addItem(parseInt(e.target.value)); e.target.value = '' } }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white"
            >
              <option value="" disabled>— выбрать позицию —</option>
              {availableOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {optionLabel(opt)} · {opt.price.toLocaleString('ru-RU')} ₸
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Note */}
        <div className="px-6 py-3 border-t border-gray-100">
          <textarea
            placeholder="Комментарий к корректировке (необязательно)"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 placeholder-gray-400 resize-none"
          />
        </div>

        {/* Summary */}
        <div className="px-6 py-2 bg-gray-50 border-t border-gray-100 text-sm text-gray-600">
          Позиций: <span className="font-semibold text-gray-800">{activeExisting.length + newRows.length}</span>
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
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
