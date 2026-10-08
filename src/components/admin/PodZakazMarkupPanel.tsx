'use client'

import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/api-token'

interface CategoryRow {
  nomenclature_id: number
  nomenclature_name: string
  percent: number | null
  plus_amount: number | null
}

interface MarkupData {
  global: { percent: number; plus_amount: number }
  categories: CategoryRow[]
}

// Наценка Proflowers (/pod-zakaz) — global + per-категория, с фолбэком категории на общую.
// Витрина (pf_catalog) считает цену на лету из pf_offers.purchase_price × наценка — сохранил
// здесь → сразу видно на /pod-zakaz, пересчитывать отдельно не нужно.
export default function PodZakazMarkupPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [globalPercent, setGlobalPercent] = useState('0')
  const [globalPlus, setGlobalPlus] = useState('0')
  const [categories, setCategories] = useState<CategoryRow[]>([])
  // Текстовые черновики полей категории (строка, не число) — пусто = «нет override, берётся общая».
  const [catPercentDraft, setCatPercentDraft] = useState<Record<number, string>>({})
  const [catPlusDraft, setCatPlusDraft] = useState<Record<number, string>>({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/pod-zakaz/markup', { headers: await authHeaders(), cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error || 'Не удалось загрузить наценку'); return }
      const d = data as MarkupData
      setGlobalPercent(String(d.global.percent))
      setGlobalPlus(String(d.global.plus_amount))
      setCategories(d.categories)
      setCatPercentDraft(Object.fromEntries(d.categories.map(c => [c.nomenclature_id, c.percent === null ? '' : String(c.percent)])))
      setCatPlusDraft(Object.fromEntries(d.categories.map(c => [c.nomenclature_id, c.plus_amount === null ? '' : String(c.plus_amount)])))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const res = await fetch('/api/admin/pod-zakaz/markup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          global: { percent: Number(globalPercent) || 0, plus_amount: Number(globalPlus) || 0 },
          categories: categories.map(c => ({
            nomenclature_id: c.nomenclature_id,
            percent: catPercentDraft[c.nomenclature_id]?.trim() === '' ? null : Number(catPercentDraft[c.nomenclature_id]),
            plus_amount: catPlusDraft[c.nomenclature_id]?.trim() === '' ? 0 : Number(catPlusDraft[c.nomenclature_id]),
          })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error || 'Не удалось сохранить'); return }
      setSuccess(true)
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Загрузка...</div>

  const inputClass = 'w-28 rounded border border-gray-300 px-2 py-1 text-sm'

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-6">
        Наценка на закупочную цену Proflowers (<code>pf_catalog</code> считает цену на лету) —
        изменения применяются сразу на витрине <code>/pod-zakaz</code>, пересчитывать ничего не нужно.
        Категория без своего значения ниже берёт общую наценку.
      </p>

      <div className="rounded border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Категория</th>
              <th className="text-left px-4 py-2 font-medium">Наценка, %</th>
              <th className="text-left px-4 py-2 font-medium">Фикс. надбавка, ₸</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr className="bg-amber-50/50">
              <td className="px-4 py-2 font-medium">Общая (по умолчанию)</td>
              <td className="px-4 py-2">
                <input className={inputClass} type="number" step="0.1" value={globalPercent} onChange={e => setGlobalPercent(e.target.value)} />
              </td>
              <td className="px-4 py-2">
                <input className={inputClass} type="number" step="1" value={globalPlus} onChange={e => setGlobalPlus(e.target.value)} />
              </td>
            </tr>
            {categories.map(c => (
              <tr key={c.nomenclature_id}>
                <td className="px-4 py-2">{c.nomenclature_name}</td>
                <td className="px-4 py-2">
                  <input
                    className={inputClass} type="number" step="0.1"
                    placeholder={`${globalPercent} (общая)`}
                    value={catPercentDraft[c.nomenclature_id] ?? ''}
                    onChange={e => setCatPercentDraft(s => ({ ...s, [c.nomenclature_id]: e.target.value }))}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className={inputClass} type="number" step="1"
                    placeholder={catPercentDraft[c.nomenclature_id]?.trim() ? '0' : `${globalPlus} (общая)`}
                    value={catPlusDraft[c.nomenclature_id] ?? ''}
                    onChange={e => setCatPlusDraft(s => ({ ...s, [c.nomenclature_id]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      {success && <div className="mt-4 text-sm text-green-600">Сохранено — витрина уже считает по новой наценке.</div>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 px-4 py-2 rounded bg-[#7a1c2e] text-white text-sm font-medium disabled:opacity-60"
      >
        {saving ? 'Сохраняем...' : 'Сохранить'}
      </button>
    </div>
  )
}
