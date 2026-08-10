'use client'

import { useState } from 'react'
import { authHeaders } from '@/lib/api-token'
import { CATEGORY_OPTIONS, subcatOptionsFor, unitForSubcat, type ProductCategory } from '@/lib/product-subcats'

export type ImportRowSeed = {
  id: number
  raw_name: string
  qty: number | string | null
  price: number | string | null
  code_1c: string | null
  source: string | null
  file_category: string | null
  enriched_display_name: string | null
  enriched_subcategory: string | null
  enriched_country_iso: string | null
}

export type CreatedProduct = {
  id: number; is_active: boolean; category: string | null; name: string
  display_name: string | null; code_1c: string | null; supplier_ref: string | null
  source: string | null; length_cm: number | null; image_url: string | null
}

/** Категория по контуру выгрузки — 1С не присылает file_category (всегда NULL). */
function guessCategory(row: ImportRowSeed): ProductCategory {
  const fc = row.file_category
  if (fc === 'cut' || fc === 'pot' || fc === 'accessories') return fc
  if (row.source === '1c-ip') return 'accessories'
  if (row.source === '1c-too') return 'pot'
  return 'cut'
}

const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-gray-500'
const sel = inp + ' bg-white'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-gray-500 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400 mt-0.5">{hint}</span>}
    </label>
  )
}

export default function CreateProductModal({
  row, onClose, onCreated,
}: {
  row: ImportRowSeed
  onClose: () => void
  onCreated: (p: CreatedProduct) => void
}) {
  const [category, setCategory] = useState<ProductCategory>(guessCategory(row))
  const [name, setName] = useState(row.raw_name)
  const [displayName, setDisplayName] = useState(row.enriched_display_name ?? '')
  const [subcategory, setSubcategory] = useState(row.enriched_subcategory ?? '')
  const [unit, setUnit] = useState('')
  const [packSize, setPackSize] = useState('1')
  const [qty, setQty] = useState(String(row.qty ?? ''))
  const [price, setPrice] = useState(String(row.price ?? ''))
  const [lengthCm, setLengthCm] = useState('')
  const [potDiameter, setPotDiameter] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAcc = category === 'accessories'
  const subcatOptions = subcatOptionsFor(category)

  function changeCategory(next: ProductCategory) {
    setCategory(next)
    setSubcategory('')   // списки подкатегорий не пересекаются
    setUnit('')
  }
  function changeSubcategory(next: string) {
    setSubcategory(next)
    if (category === 'accessories') setUnit(unitForSubcat(next) ?? '')
  }

  async function submit() {
    if (!name.trim()) { setError('Название обязательно'); return }
    if (!subcategory) { setError('Выберите подкатегорию — без неё товар не попадёт в раздел каталога'); return }
    const packNum = Number(packSize)
    if (!Number.isFinite(packNum) || packNum < 1) { setError('Кратность должна быть ≥ 1'); return }

    setSaving(true); setError('')
    try {
      const res = await fetch('/api/import-xls/create-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          rowId: row.id,
          fields: {
            category, name: name.trim(), display_name: displayName.trim() || null,
            subcategory, unit: unit.trim() || null, pack_size: packNum,
            qty, price, is_active: isActive,
            length_cm: category === 'cut' ? lengthCm : null,
            pot_diameter: category === 'pot' ? potDiameter : null,
            country_iso: row.enriched_country_iso,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Ошибка создания'); return }
      onCreated(data.product as CreatedProduct)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-1 text-base font-semibold text-gray-800">Новая карточка из строки 1С</div>
        <div className="mb-4 text-xs text-gray-500">
          «{row.raw_name}»{row.code_1c && <> · артикул <b>{row.code_1c}</b></>}
          {row.source && <> · выгрузка {row.source}</>}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Категория" hint={row.file_category ? undefined : 'определена по контуру выгрузки — проверьте'}>
              <select className={sel} value={category} onChange={e => changeCategory(e.target.value as ProductCategory)}>
                {CATEGORY_OPTIONS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </Field>
            <Field label="Подкатегория">
              <select className={sel} value={subcategory} onChange={e => changeSubcategory(e.target.value)}>
                <option value="">— выберите —</option>
                {subcatOptions.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </Field>
            {isAcc ? (
              <Field label="Единица продажи" hint="шт / пог. м / рулон / уп">
                <input className={inp} value={unit} onChange={e => setUnit(e.target.value)} placeholder="шт" />
              </Field>
            ) : category === 'cut' ? (
              <Field label="Длина (см)">
                <input className={inp} type="number" value={lengthCm} onChange={e => setLengthCm(e.target.value)} placeholder="60" />
              </Field>
            ) : (
              <Field label="Диаметр горшка (см)">
                <input className={inp} type="number" step="0.1" value={potDiameter} onChange={e => setPotDiameter(e.target.value)} placeholder="12" />
              </Field>
            )}
          </div>

          <Field label="Название (name — как в 1С, ключ для повторного матча)">
            <input className={inp} value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Отображаемое имя (display_name — пусто = автогенерация)">
            <input className={inp} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Автоматически" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Остаток" hint="из выгрузки">
              <input className={inp} type="number" value={qty} onChange={e => setQty(e.target.value)} />
            </Field>
            <Field label="Цена, ₸" hint="из выгрузки">
              <input className={inp} type="number" value={price} onChange={e => setPrice(e.target.value)} />
            </Field>
            <Field label="Кратность заказа" hint="в БД дефолт 5 — ставим 1">
              <input className={inp} type="number" min="1" value={packSize} onChange={e => setPackSize(e.target.value)} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Опубликовать сразу (без фото и описания карточка уже будет видна на сайте)
          </label>

          {error && <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600">Отмена</button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: '#7a1c2e' }}
          >
            {saving ? 'Создаётся…' : 'Создать карточку'}
          </button>
        </div>
      </div>
    </div>
  )
}
