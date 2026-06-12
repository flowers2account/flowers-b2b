'use client'
/**
 * «Закуп с ОЗ» — read-only витрина oz_catalog для обкатки ночного парсера цен
 * (docs/OZ_PRICE_REFRESH.md). Никаких правок из UI; единственное действие —
 * открыть карточку на сайте OZ (source_url).
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { authHeaders } from '@/lib/api-token'

type OzRow = {
  id: number
  name: string
  display_name: string | null
  length_cm: number | null
  farm: string | null
  subcategory: string | null
  image_url: string | null
  qty: number | null
  is_active: boolean
  oz_purchase_eur: number | null
  oz_stock_updated_at: string | null
  source_url: string | null
}

type ApiData = {
  products: OzRow[]
  settings: Record<string, { value: string; updated_at: string | null }>
  lastRun: { at: string; updated: number } | null
}

type SortKey = 'eur' | 'kzt' | 'fresh' | 'qty'
type FreshFilter = '' | 'h24' | 'h72' | 'old'

const PAGE_SIZE = 100
const H = 3600_000

function hoursAgo(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / H
}

function fmtDt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Oral',
  })
}

/** Та же формула, что SQL calc_preorder_price_kzt */
function calcKzt(eur: number | null, markup: number, rate: number, roundTo: number): number | null {
  if (eur == null) return null
  const rt = roundTo || 1
  return Math.round((eur * rate * (1 + markup / 100)) / rt) * rt
}

function FreshBadge({ iso }: { iso: string | null }) {
  const h = hoursAgo(iso)
  let bg = '#9ca3af', label = 'нет данных'
  if (h !== null) {
    if (h < 24) { bg = '#16a34a'; label = '<24ч' }
    else if (h < 72) { bg = '#d97706'; label = '<72ч' }
    else { bg = '#dc2626'; label = `${Math.floor(h / 24)}д` }
  }
  return (
    <span style={{ background: bg }} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap">
      {label}
    </span>
  )
}

export default function OzPurchasePage() {
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()

  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // фильтры
  const [search, setSearch] = useState('')
  const [subcat, setSubcat] = useState('')
  const [farm, setFarm] = useState('')
  const [inStock, setInStock] = useState(false)
  const [fresh, setFresh] = useState<FreshFilter>('')
  const [noUrlTab, setNoUrlTab] = useState(false)
  const [sort, setSort] = useState<SortKey>('fresh')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)
  // выбор строк — только state страницы (не БД); переживает фильтры/страницы в рамках сессии
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (isAuthed === false) router.replace('/admin')
  }, [isAuthed])

  useEffect(() => {
    ;(async () => {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/admin/oz-purchase', { headers })
        const json = await res.json()
        if (!res.ok) { setErr(json.error ?? `HTTP ${res.status}`); return }
        setData(json)
      } catch (e) {
        setErr(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const markup = parseFloat(data?.settings?.preorder_markup_percent?.value ?? '35')
  const rate = parseFloat(data?.settings?.preorder_eur_kzt_rate?.value ?? '0')
  const roundTo = parseFloat(data?.settings?.preorder_round_to?.value ?? '1')
  const rateUpdatedAt = data?.settings?.preorder_eur_kzt_rate?.updated_at ?? null

  const noUrlCount = useMemo(
    () => (data?.products ?? []).filter(p => !p.source_url).length,
    [data])

  const subcats = useMemo(() => {
    const s = new Set<string>()
    for (const p of data?.products ?? []) if (p.subcategory) s.add(p.subcategory)
    return [...s].sort()
  }, [data])

  const farms = useMemo(() => {
    const s = new Set<string>()
    for (const p of data?.products ?? []) if (p.farm) s.add(p.farm)
    return [...s].sort()
  }, [data])

  const filtered = useMemo(() => {
    let list = data?.products ?? []
    if (noUrlTab) list = list.filter(p => !p.source_url)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.display_name ?? '').toLowerCase().includes(q))
    }
    if (subcat) list = list.filter(p => p.subcategory === subcat)
    if (farm) list = list.filter(p => p.farm === farm)
    if (inStock) list = list.filter(p => (p.qty ?? 0) > 0)
    if (fresh) {
      list = list.filter(p => {
        const h = hoursAgo(p.oz_stock_updated_at)
        if (fresh === 'h24') return h !== null && h < 24
        if (fresh === 'h72') return h !== null && h >= 24 && h < 72
        return h === null || h >= 72
      })
    }
    const dir = sortAsc ? 1 : -1
    const val = (p: OzRow): number => {
      if (sort === 'eur') return p.oz_purchase_eur ?? -1
      if (sort === 'kzt') return calcKzt(p.oz_purchase_eur, markup, rate, roundTo) ?? -1
      if (sort === 'qty') return p.qty ?? -1
      return p.oz_stock_updated_at ? new Date(p.oz_stock_updated_at).getTime() : 0
    }
    return [...list].sort((a, b) => (val(a) - val(b)) * dir)
  }, [data, noUrlTab, search, subcat, farm, inStock, fresh, sort, sortAsc, markup, rate, roundTo])

  useEffect(() => { setPage(0) }, [noUrlTab, search, subcat, farm, inStock, fresh])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const lastRunH = hoursAgo(data?.lastRun?.at ?? null)
  const sessionWarning = lastRunH !== null && lastRunH > 36

  const toggleRow = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allVisibleSelected = visible.length > 0 && visible.every(p => selected.has(p.id))
  const togglePageAll = () => setSelected(prev => {
    const next = new Set(prev)
    if (allVisibleSelected) visible.forEach(p => next.delete(p.id))
    else visible.forEach(p => next.add(p.id))
    return next
  })
  const selectedSumEur = useMemo(() => {
    let sum = 0
    for (const p of data?.products ?? []) {
      if (selected.has(p.id) && p.oz_purchase_eur != null) sum += Number(p.oz_purchase_eur)
    }
    return sum
  }, [data, selected])

  // admin-only: раздел показывает закупочные цены EUR
  if (!isAuthed || role !== 'admin') {
    return <div className="p-10 text-gray-500">Нет доступа</div>
  }

  const sortBtn = (key: SortKey, label: string) => (
    <button
      key={key}
      onClick={() => { if (sort === key) setSortAsc(a => !a); else { setSort(key); setSortAsc(false) } }}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
        sort === key ? 'bg-[#7a1c2e] text-white border-[#7a1c2e]' : 'bg-white text-gray-600 border-gray-200'}`}
    >
      {label}{sort === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </button>
  )

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-xs text-gray-500 cursor-pointer">← Админка</button>
        <h1 className="text-lg font-bold m-0">💶 Закуп с ОЗ</h1>
        <span className="text-xs text-gray-400">read-only · данные ночного парсера</span>
      </div>

      {loading && <div className="p-10 text-center text-gray-400">Загрузка…</div>}
      {err && <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{err}</div>}

      {data && (
        <>
          {/* ── Шапка-статус ── */}
          {sessionWarning && (
            <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800">
              ⚠️ Последнее обновление цен — {Math.floor((lastRunH ?? 0) / 24)} д {Math.floor((lastRunH ?? 0) % 24)} ч назад (старше 36 часов).
              Вероятно, протухла сессия OZ — нужен <code>oz_login.py</code> на десктопе и scp <code>oz_state.json</code> на VPS
              (см. docs/OZ_PRICE_REFRESH.md).
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Последний прогон парсера</div>
              <div className="text-sm font-semibold">{fmtDt(data.lastRun?.at ?? null)}</div>
              <div className="text-xs text-gray-500">{data.lastRun ? `обновлено карточек: ${data.lastRun.updated}` : 'данных о прогоне нет'}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Курс EUR → KZT</div>
              <div className="text-sm font-semibold">{rate ? `${rate} ₸` : '—'} <span className="text-xs font-normal text-gray-500">(наценка {markup}%)</span></div>
              <div className="text-xs text-gray-500">обновлён: {fmtDt(rateUpdatedAt)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Карточек oz_catalog</div>
              <div className="text-sm font-semibold">{data.products.length}</div>
              <div className="text-xs text-gray-500">без source_url (вне парсера): {noUrlCount}</div>
            </div>
          </div>

          {/* ── Табы: все / без URL ── */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setNoUrlTab(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border cursor-pointer ${!noUrlTab ? 'bg-[#7a1c2e] text-white border-[#7a1c2e]' : 'bg-white text-gray-600 border-gray-200'}`}>
              Все ({data.products.length})
            </button>
            <button onClick={() => setNoUrlTab(true)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border cursor-pointer ${noUrlTab ? 'bg-[#7a1c2e] text-white border-[#7a1c2e]' : 'bg-white text-gray-600 border-gray-200'}`}>
              ⚠ Без source_url ({noUrlCount})
            </button>
          </div>

          {/* ── Фильтры ── */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Поиск по имени…"
              className="flex-1 min-w-[180px] px-3 py-1.5 border border-gray-300 rounded text-sm outline-none"
            />
            <select value={subcat} onChange={e => setSubcat(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
              <option value="">Подкатегория: все</option>
              {subcats.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={farm} onChange={e => setFarm(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white max-w-[180px]">
              <option value="">Ферма: все</option>
              {farms.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={fresh} onChange={e => setFresh(e.target.value as FreshFilter)} className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
              <option value="">Свежесть: все</option>
              <option value="h24">🟢 &lt;24ч</option>
              <option value="h72">🟡 24–72ч</option>
              <option value="old">🔴 старше / нет</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={inStock} onChange={e => setInStock(e.target.checked)} />
              qty &gt; 0
            </label>
          </div>

          {/* ── Сортировки ── */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-gray-400">Сортировка:</span>
            {sortBtn('fresh', 'Свежесть')}
            {sortBtn('eur', 'Цена €')}
            {sortBtn('kzt', 'Цена ₸')}
            {sortBtn('qty', 'Остаток')}
            <span className="ml-auto text-xs text-gray-500">{filtered.length} позиций</span>
          </div>

          {/* ── Таблица ── */}
          <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white">
            <table className="w-full text-sm border-collapse min-w-[860px]">
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400 text-left">
                  <th className="px-3 py-2 font-semibold w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={togglePageAll}
                      title="Выбрать все на странице"
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold w-12"></th>
                  <th className="px-3 py-2 font-semibold">Название</th>
                  <th className="px-2 py-2 font-semibold text-center">Длина</th>
                  <th className="px-2 py-2 font-semibold">Ферма</th>
                  <th className="px-2 py-2 font-semibold text-right">Остаток OZ</th>
                  <th className="px-2 py-2 font-semibold text-right">Закуп €</th>
                  <th className="px-2 py-2 font-semibold text-right">Предзаказ ₸</th>
                  <th className="px-2 py-2 font-semibold text-center">Обновлено</th>
                  <th className="px-2 py-2 font-semibold text-center">OZ</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const kzt = calcKzt(p.oz_purchase_eur, markup, rate, roundTo)
                  return (
                    <tr key={p.id} className={`border-t border-gray-100 ${!p.is_active ? 'opacity-50' : ''} ${selected.has(p.id) ? 'bg-amber-50' : ''}`}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleRow(p.id)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        {p.image_url
                          ? <img src={p.image_url} alt="" width={36} height={36} className="rounded object-cover w-9 h-9" loading="lazy" />
                          : <div className="w-9 h-9 rounded bg-gray-100" />}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-gray-800">{p.display_name || p.name}</div>
                        {p.display_name && <div className="text-[11px] text-gray-400">{p.name}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-center text-gray-600">{p.length_cm ? `${p.length_cm}` : '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600 max-w-[140px] truncate">{p.farm ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{p.qty ?? 0}</td>
                      <td className="px-2 py-1.5 text-right">{p.oz_purchase_eur != null ? `€${Number(p.oz_purchase_eur).toFixed(2)}` : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-[#7a1c2e]">{kzt != null ? `${kzt.toLocaleString('ru-RU')} ₸` : '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <FreshBadge iso={p.oz_stock_updated_at} />
                          <span className="text-[10px] text-gray-400">{fmtDt(p.oz_stock_updated_at)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {p.source_url
                          ? <a href={p.source_url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline">открыть ↗</a>
                          : <span className="text-[10px] text-red-400">нет URL</span>}
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Ничего не найдено</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Пагинация ── */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded border border-gray-200 text-sm disabled:opacity-40 cursor-pointer bg-white">←</button>
              <span className="text-sm text-gray-600">{page + 1} / {pages}</span>
              <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded border border-gray-200 text-sm disabled:opacity-40 cursor-pointer bg-white">→</button>
            </div>
          )}

          {/* ── Плавающая панель выбора (действия — отдельной задачей) ── */}
          {selected.size > 0 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-[#1f2937] text-white rounded-full px-5 py-2.5 shadow-xl">
              <span className="text-sm font-semibold whitespace-nowrap">Выбрано: {selected.size}</span>
              <span className="text-sm text-gray-300 whitespace-nowrap">Σ закуп: €{selectedSumEur.toFixed(2)}</span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
              >
                Сбросить
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
