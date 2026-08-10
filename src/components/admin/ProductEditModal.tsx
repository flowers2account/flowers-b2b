'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COLORS } from '@/lib/colors'
import { COUNTRY_LABELS } from '@/lib/countries'
import { CATEGORY_OPTIONS, subcatOptionsFor, unitForSubcat, type ProductCategory } from '@/lib/product-subcats'

type ProductEdit = {
  id: number
  name: string
  display_name: string | null
  category: ProductCategory
  subcategory: string | null
  unit: string | null
  variety_type: string | null
  length_cm: number | null
  pot_diameter: number | null
  country_iso: string | null
  farm: string | null
  colors: string[] | null
  tags: string[] | null
  image_url: string | null
  pack_size: number
  price: number | null
  qty: number
  arrival_date: string | null
  is_active: boolean
}

const VARIETY_TYPES = [
  { v: 'single',     l: 'Одноголовые' },
  { v: 'spray',      l: 'Кустовые'    },
  { v: 'pompom',     l: 'Помпонные'   },
  { v: 'decorative', l: 'Пионовидные' },
  { v: 'ot',         l: 'ОТ-гибриды'  },
  { v: 'oriental',   l: 'Восточные'   },
  { v: 'asian',      l: 'Азиатские'   },
]
const PRODUCT_TAGS = [
  { v: 'premium', l: '⭐ Премиум'   },
  { v: 'wedding', l: '💍 Свадебные' },
  { v: 'exotic',  l: '🌿 Экзотика'  },
  { v: 'seasonal',l: '🌸 Сезонные'  },
  { v: 'spring',  l: '🌷 Весна'     },
]
const COUNTRIES = Object.entries(COUNTRY_LABELS)
  .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
  .map(([v, l]) => ({ v, l }))

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inp = 'w-full h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#8B1A1A]'
const sel = inp + ' bg-white'

export default function ProductEditModal({
  productId,
  onClose,
  onSaved,
}: {
  productId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [p, setP] = useState<ProductEdit | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('products')
      .select('id,name,display_name,category,subcategory,unit,variety_type,length_cm,pot_diameter,country_iso,farm,colors,tags,image_url,pack_size,price,qty,arrival_date,is_active')
      .eq('id', productId)
      .single()
      .then(({ data }: { data: ProductEdit | null }) => {
        setP(data)
        setLoading(false)
      })
  }, [productId])

  const isAcc = p?.category === 'accessories'

  async function save() {
    if (!p) return
    if (!p.name.trim()) { setError('Название обязательно'); return }
    if (!p.pack_size || p.pack_size < 1) { setError('Кратность должна быть > 0'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { error: e } = await supabase.from('products').update({
      name: p.name.trim(),
      display_name: p.display_name?.trim() || null,
      category: p.category,
      subcategory: p.subcategory || null,
      unit: p.unit?.trim() || null,
      // поля среза/горшка обнуляем, если карточку перевели в расходку —
      // иначе на витрине остаётся «Стеблей», «Длина», «Ферма» от прошлой категории
      variety_type: isAcc ? null : (p.variety_type || null),
      length_cm: isAcc ? null : p.length_cm,
      pot_diameter: p.category === 'pot' ? p.pot_diameter : null,
      country_iso: isAcc ? null : (p.country_iso || null),
      farm: isAcc ? null : (p.farm?.trim() || null),
      colors: p.colors?.length ? p.colors : null,
      tags: p.tags?.length ? p.tags : null,
      image_url: p.image_url?.trim() || null,
      pack_size: p.pack_size,
      price: p.price,
      qty: p.qty,
      arrival_date: p.arrival_date || null,
      is_active: p.is_active,
    }).eq('id', p.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
    onClose()
  }

  async function deactivate() {
    if (!p || !confirm('Деактивировать товар? Остаток станет 0.')) return
    const supabase = createClient()
    await supabase.from('products').update({ is_active: false, qty: 0 }).eq('id', p.id)
    onSaved()
    onClose()
  }

  function set(field: keyof ProductEdit, value: any) {
    setP(prev => prev ? { ...prev, [field]: value } : prev)
  }

  const subcatOptions = subcatOptionsFor(p?.category ?? 'cut')

  // смена категории: сбрасываем подкатегорию (списки не пересекаются) и
  // подставляем единицу продажи, если подкатегория расходки её задаёт
  function setCategory(next: ProductCategory) {
    setP(prev => prev ? { ...prev, category: next, subcategory: null, unit: null } : prev)
  }
  function setSubcategory(next: string) {
    setP(prev => prev ? {
      ...prev,
      subcategory: next || null,
      unit: prev.category === 'accessories' ? (unitForSubcat(next) ?? prev.unit) : prev.unit,
    } : prev)
  }

  function toggleTag(v: string) {
    setP(prev => {
      if (!prev) return prev
      const cur = prev.tags ?? []
      return { ...prev, tags: cur.includes(v) ? cur.filter(t => t !== v) : [...cur, v] }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <span className="font-semibold text-sm text-gray-700">
            Редактирование #{productId}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {loading && <div className="p-8 text-center text-sm text-gray-400">Загрузка...</div>}

        {p && (
          <div className="p-5 space-y-5">

            {/* Название */}
            <div className="space-y-3">
              <Field label="Название (raw из 1С)">
                <input className={inp} value={p.name} onChange={e => set('name', e.target.value)} />
              </Field>
              <Field label="Отображаемое название (display_name — оставьте пустым для автогенерации)">
                <input className={inp} value={p.display_name ?? ''} onChange={e => set('display_name', e.target.value)} placeholder="Автоматически из триггера" />
              </Field>
            </div>

            {/* Категория + подкатегория + (тип сорта — только срез/горшок) */}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Категория">
                <select className={sel} value={p.category} onChange={e => setCategory(e.target.value as ProductCategory)}>
                  {CATEGORY_OPTIONS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </Field>
              <Field label="Подкатегория">
                <select className={sel} value={p.subcategory ?? ''} onChange={e => setSubcategory(e.target.value)}>
                  <option value="">—</option>
                  {subcatOptions.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </Field>
              {isAcc ? (
                <Field label="Единица продажи">
                  <input className={inp} value={p.unit ?? ''} onChange={e => set('unit', e.target.value)} placeholder="шт / пог. м / рулон / уп" />
                </Field>
              ) : (
                <Field label="Тип сорта">
                  <select className={sel} value={p.variety_type ?? ''} onChange={e => set('variety_type', e.target.value)}>
                    <option value="">—</option>
                    {VARIETY_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </Field>
              )}
            </div>

            {/* Размеры + страна + ферма — характеристики среза/горшка, для расходки не показываем */}
            {!isAcc && (
            <div className="grid grid-cols-4 gap-3">
              {p.category === 'cut' && (
                <Field label="Длина (см)">
                  <input className={inp} type="number" value={p.length_cm ?? ''} onChange={e => set('length_cm', e.target.value ? +e.target.value : null)} placeholder="60" />
                </Field>
              )}
              {p.category === 'pot' && (
                <Field label="Диаметр горшка">
                  <input className={inp} type="number" step="0.1" value={p.pot_diameter ?? ''} onChange={e => set('pot_diameter', e.target.value ? +e.target.value : null)} placeholder="15" />
                </Field>
              )}
              <Field label="Страна">
                <select className={sel} value={p.country_iso ?? ''} onChange={e => set('country_iso', e.target.value || null)}>
                  <option value="">—</option>
                  {COUNTRIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </Field>
              <Field label="Ферма">
                <input className={inp} value={p.farm ?? ''} onChange={e => set('farm', e.target.value || null)} placeholder="Karen Roses" />
              </Field>
            </div>
            )}

            {/* Цвета */}
            <Field label="Цвета">
              <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded min-h-[36px]">
                {COLORS.map(col => {
                  const active = p.colors?.includes(col.key)
                  return (
                    <button
                      key={col.key}
                      title={col.label}
                      onClick={() => {
                        const next = active
                          ? (p.colors ?? []).filter(c => c !== col.key)
                          : [...(p.colors ?? []), col.key]
                        set('colors', next)
                      }}
                      style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: ('gradient' in col ? col.gradient : col.bg) as string,
                        border: active ? '2px solid #8B1A1A' : '2px solid rgba(0,0,0,0.1)',
                        outline: active ? '2px solid #8B1A1A' : 'none',
                        outlineOffset: 1,
                        flexShrink: 0,
                      }}
                    />
                  )
                })}
              </div>
            </Field>

            {/* Теги */}
            <Field label="Теги">
              <div className="flex flex-wrap gap-2 pt-1">
                {PRODUCT_TAGS.map(tag => {
                  const active = p.tags?.includes(tag.v)
                  return (
                    <button
                      key={tag.v}
                      type="button"
                      onClick={() => toggleTag(tag.v)}
                      className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                      style={{
                        background: active ? '#8B1A1A' : '#fff',
                        color: active ? '#fff' : '#6b7280',
                        borderColor: active ? '#8B1A1A' : '#e5e7eb',
                      }}
                    >
                      {tag.l}
                    </button>
                  )
                })}
              </div>
            </Field>

            {/* Склад */}
            <div className="grid grid-cols-4 gap-3">
              <Field label="Остаток">
                <input className={inp} type="number" min="0" value={p.qty} onChange={e => set('qty', +e.target.value)} />
              </Field>
              <Field label="Цена ₸">
                <input className={inp} type="number" value={p.price ?? ''} onChange={e => set('price', e.target.value ? +e.target.value : null)} />
              </Field>
              <Field label="Кратность">
                <input className={inp} type="number" min="1" value={p.pack_size} onChange={e => set('pack_size', +e.target.value)} />
              </Field>
              <Field label="Дата поставки">
                <input className={inp} type="date" value={p.arrival_date ?? ''} onChange={e => set('arrival_date', e.target.value || null)} />
              </Field>
            </div>

            {/* Фото */}
            <Field label="URL фото">
              <input className={inp} type="url" value={p.image_url ?? ''} onChange={e => set('image_url', e.target.value)} placeholder="https://..." />
            </Field>

            {/* Активность */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4" checked={p.is_active} onChange={e => set('is_active', e.target.checked)} />
              <span className="text-sm">Активен</span>
            </label>

            {error && <p className="text-xs text-red-500">{error}</p>}

            {/* Кнопки */}
            <div className="flex justify-between pt-2 border-t">
              <button
                onClick={deactivate}
                className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
              >
                Деактивировать
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
                  Отмена
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-white rounded disabled:opacity-50"
                  style={{ background: '#8B1A1A' }}
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
