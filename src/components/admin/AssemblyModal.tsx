'use client'
import { useRef, useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { createClient } from '@/lib/supabase/client'

type AssemblyItem = {
  id: number
  product_id: number
  qty_ordered: number
  qty_actual: number | null
  is_removed: boolean
  price: number
  product: { name: string } | null
}

type Props = {
  orderId: number
  items: AssemblyItem[]
  onClose: () => void
  onSaved: () => void
}

export default function AssemblyModal({ orderId, items, onClose, onSaved }: Props) {
  const { user } = useAuthStore()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState(() =>
    items.map(item => ({
      id: item.id,
      name: item.product?.name ?? `Товар #${item.product_id}`,
      qty_ordered: item.qty_ordered,
      qty_actual: item.qty_actual ?? item.qty_ordered,
      is_removed: item.is_removed,
      price: item.price,
      checked: item.is_removed ? false : (item.qty_actual !== null),
    }))
  )
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const activeRows = rows.filter(r => !r.is_removed)
  const checkedCount = activeRows.filter(r => r.checked).length
  const allChecked = activeRows.length > 0 && checkedCount === activeRows.length
  const canSave = allChecked && !!photoFile && !saving

  const hasChanges = rows.some(r => r.is_removed || r.qty_actual !== r.qty_ordered)
  const newTotal = rows
    .filter(r => !r.is_removed)
    .reduce((sum, r) => sum + r.qty_actual * r.price, 0)

  function setQtyActual(id: number, qty: number) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, qty_actual: Math.max(0, qty) } : r))
  }

  function toggleRemoved(id: number) {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, is_removed: !r.is_removed, checked: r.is_removed ? r.checked : false } : r
    ))
  }

  function toggleChecked(id: number) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, checked: !r.checked } : r))
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setUploadError(null)
  }

  function removePhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadPhoto(file: File): Promise<string | null> {
    const ext = file.type === 'image/png' ? 'png' : 'jpg'
    const path = `orders/${orderId}/assembly_${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('order-photos')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('order-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setUploadError(null)

    const assemblyPhotoUrl = await uploadPhoto(photoFile!)
    if (!assemblyPhotoUrl) {
      setUploadError('Не удалось загрузить фото. Попробуйте ещё раз.')
      setSaving(false)
      return
    }

    await fetch(`/api/orders/${orderId}/assemble`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changed_by: user?.id ?? null,
        assembly_photo_url: assemblyPhotoUrl,
        items: rows.map(r => ({ id: r.id, qty_actual: r.qty_actual, is_removed: r.is_removed })),
      }),
    })
    setSaving(false)
    onSaved()
  }

  const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Сборка заказа #{orderId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4">
          {/* Items */}
          <div className="space-y-1">
            {rows.map(row => (
              <div key={row.id} className={`flex items-center gap-3 py-2.5 border-b last:border-0 ${row.is_removed ? 'opacity-40' : ''}`}>
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={row.is_removed}
                  onChange={() => toggleChecked(row.id)}
                  className="w-4 h-4 accent-green-600 shrink-0 cursor-pointer"
                />
                <span className={`flex-1 text-sm min-w-0 ${row.is_removed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {row.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-gray-400 whitespace-nowrap">из {row.qty_ordered}</span>
                  <input
                    type="number"
                    value={row.qty_actual}
                    disabled={row.is_removed}
                    min={0}
                    onChange={e => setQtyActual(row.id, parseInt(e.target.value) || 0)}
                    className="w-16 text-center border rounded px-1 py-0.5 text-sm disabled:bg-gray-50"
                  />
                </div>
                <button
                  onClick={() => toggleRemoved(row.id)}
                  className={`text-xs px-2 py-1 rounded shrink-0 transition-colors ${
                    row.is_removed
                      ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}>
                  {row.is_removed ? 'Вернуть' : 'Удалить'}
                </button>
              </div>
            ))}
          </div>

          {/* Changes summary */}
          {hasChanges && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-amber-800 mb-1.5">Изменения</p>
              {rows.filter(r => r.is_removed).map(r => (
                <p key={r.id} className="text-amber-700">• {r.name}: позиция снята</p>
              ))}
              {rows.filter(r => !r.is_removed && r.qty_actual !== r.qty_ordered).map(r => (
                <p key={r.id} className="text-amber-700">
                  • {r.name}: заказано {r.qty_ordered}, выдаётся {r.qty_actual}
                </p>
              ))}
              <p className="font-semibold text-amber-800 mt-2 pt-2 border-t border-amber-200">
                Новая сумма: {fmt(newTotal)}
              </p>
            </div>
          )}

          {/* Photo */}
          <div className="border rounded-lg p-3">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Фото сборки <span className="text-red-500">*</span>
            </p>
            {photoPreview ? (
              <div className="flex items-start gap-3">
                <img
                  src={photoPreview}
                  alt="Фото сборки"
                  style={{ width: 200, height: 150, objectFit: 'cover' }}
                  className="rounded border"
                />
                <button
                  onClick={removePhoto}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline mt-1">
                  Удалить фото
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors w-fit">
                <span className="text-lg">📷</span>
                <span className="text-sm text-gray-600">Сфотографировать</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
            )}
            {uploadError && (
              <p className="text-xs text-red-600 mt-2">{uploadError}</p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
          <span className="text-sm text-gray-500">
            Собрано {checkedCount} из {activeRows.length}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors">
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Загрузка...' : 'Завершить сборку'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
