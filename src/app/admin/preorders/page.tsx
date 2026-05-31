'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/auth-store'
import {
  updatePreorderStatus,
  bulkPreorderStatus,
  getPreorders,
  type PreorderOrder,
} from '@/app/admin/preorder-actions'
import PreorderAssemblyModal from '@/components/admin/PreorderAssemblyModal'
import PreorderEditModal from '@/components/admin/PreorderEditModal'
import { COLORS } from '@/lib/colors'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending:    'Оформлен',
  confirmed:  'Подтверждён',
  in_transit: 'В пути',
  arrived:    'На складе',
  assembling: 'Собирается',
  assembled:  'Собран',
  delivered:  'Выдан',
  cancelled:  'Отменён',
}

const STATUS_COLOR: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  confirmed:  'bg-green-100 text-green-800',
  in_transit: 'bg-blue-100 text-blue-800',
  arrived:    'bg-teal-100 text-teal-800',
  assembling: 'bg-orange-100 text-orange-800',
  assembled:  'bg-purple-100 text-purple-800',
  delivered:  'bg-gray-100 text-gray-600',
  cancelled:  'bg-red-100 text-red-700',
}

// next possible statuses from each state
const NEXT_STATUSES: Record<string, string[]> = {
  pending:    ['confirmed'],
  confirmed:  ['in_transit'],
  in_transit: ['arrived'],
  arrived:    ['assembling'],
  assembling: ['assembled'],
  assembled:  ['delivered'],
  delivered:  [],
  cancelled:  [],
}

const ALL_STATUSES = ['pending', 'confirmed', 'in_transit', 'arrived', 'assembling', 'assembled', 'delivered', 'cancelled']

const SUBCATEGORY_LABELS: Record<string, string> = {
  roses: 'Розы', chrysanthemums: 'Хризантемы', lilies: 'Лилии',
  orchids: 'Орхидеи', anthuriums: 'Антуриумы', proteas: 'Протеи',
  peonies: 'Пионы', tulips: 'Тюльпаны', ranunculus: 'Ранункулюсы',
  anemones: 'Анемоны', lisianthus: 'Лизиантусы', hydrangeas: 'Гортензии',
  carnations: 'Гвоздики', gerberas: 'Герберы', irises: 'Ирисы',
  sunflowers: 'Подсолнухи', alstroemeria: 'Альстромерии',
  gypsophila: 'Гипсофила', freesia: 'Фрезия', statice: 'Статице',
}

const NEXT_LABELS: Record<string, string> = {
  confirmed:  '✅ Подтвердить',
  in_transit: '🚚 Отправить в путь',
  arrived:    '📦 Прибыл на склад',
  assembling: '🔧 Начать сборку',
  assembled:  '✅ Сборка готова',
  delivered:  '🎉 Выдан',
}

type DatePreset = '' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today',     label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера'   },
  { id: 'last7',     label: '7 дней'  },
  { id: 'last30',    label: '30 дней' },
  { id: 'custom',    label: 'Период'  },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Asia/Oral', day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Oral', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PreordersPage() {
  const { role } = useAuthStore()

  const [orders, setOrders] = useState<PreorderOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [statusError, setStatusError] = useState<{ id: number; msg: string } | null>(null)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [assemblyOrder, setAssemblyOrder] = useState<PreorderOrder | null>(null)
  const [editingOrder, setEditingOrder] = useState<PreorderOrder | null>(null)

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<number | ''>('')
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [selectedSubcats, setSelectedSubcats] = useState<string[]>([])

  // Auth guard
  if (role && role !== 'admin' && role !== 'manager') {
    return <div className="p-8 text-sm text-gray-400">Нет доступа</div>
  }

  async function loadOrders() {
    setLoading(true)
    setLoadError(null)
    const { orders: data, error } = await getPreorders()
    if (error) setLoadError(error)
    setOrders(data)
    setLoading(false)
  }

  useEffect(() => { loadOrders() }, [])

  // Unique campaigns for filter dropdown
  const campaigns = useMemo(() => {
    const seen = new Map<number, string>()
    for (const o of orders) {
      if (!seen.has(o.campaign_id)) {
        seen.set(o.campaign_id, o.campaigns?.title ?? `Акция #${o.campaign_id}`)
      }
    }
    return Array.from(seen.entries()).map(([id, title]) => ({ id, title }))
  }, [orders])

  // Unique colors and subcategories present in the loaded orders
  const availableColors = useMemo(() => {
    const keys = new Set<string>()
    for (const o of orders)
      for (const item of o.campaign_order_items)
        for (const c of (item.campaign_items?.products?.colors ?? []))
          keys.add(c)
    return COLORS.filter(c => keys.has(c.key))
  }, [orders])

  const availableSubcats = useMemo(() => {
    const keys = new Set<string>()
    for (const o of orders)
      for (const item of o.campaign_order_items)
        if (item.campaign_items?.products?.subcategory)
          keys.add(item.campaign_items.products.subcategory)
    return Array.from(keys).sort()
  }, [orders])

  // Filtered list
  const filtered = useMemo(() => {
    let result = orders

    if (datePreset) {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      let fromDate: Date | null = null
      let toDate: Date | null = null
      if (datePreset === 'today')     { fromDate = todayStart }
      if (datePreset === 'yesterday') { fromDate = new Date(todayStart.getTime() - 86_400_000); toDate = todayStart }
      if (datePreset === 'last7')     { fromDate = new Date(todayStart.getTime() - 6 * 86_400_000) }
      if (datePreset === 'last30')    { fromDate = new Date(todayStart.getTime() - 29 * 86_400_000) }
      if (datePreset === 'custom') {
        if (customFrom) fromDate = new Date(customFrom)
        if (customTo)   toDate   = new Date(customTo + 'T23:59:59')
      }
      if (fromDate) result = result.filter(o => new Date(o.created_at) >= fromDate!)
      if (toDate)   result = result.filter(o => new Date(o.created_at) <= toDate!)
    }

    if (selectedStatuses.length > 0) {
      result = result.filter(o => selectedStatuses.includes(o.status))
    }

    if (selectedCampaign !== '') {
      result = result.filter(o => o.campaign_id === selectedCampaign)
    }

    if (selectedColors.length > 0) {
      result = result.filter(o =>
        o.campaign_order_items.some(item =>
          (item.campaign_items?.products?.colors ?? []).some(c => selectedColors.includes(c))
        )
      )
    }

    if (selectedSubcats.length > 0) {
      result = result.filter(o =>
        o.campaign_order_items.some(item => {
          const sub = item.campaign_items?.products?.subcategory
          return sub && selectedSubcats.includes(sub)
        })
      )
    }

    return result
  }, [orders, datePreset, customFrom, customTo, selectedStatuses, selectedCampaign, selectedColors, selectedSubcats])

  const hasFilters = datePreset !== '' || selectedStatuses.length > 0 || selectedCampaign !== '' ||
    selectedColors.length > 0 || selectedSubcats.length > 0

  // Bulk action counts — from all orders of selected campaign (ignore status filter)
  const campaignOrders = selectedCampaign !== '' ? orders.filter(o => o.campaign_id === selectedCampaign) : []
  const confirmedCount  = campaignOrders.filter(o => o.status === 'confirmed').length
  const inTransitCount  = campaignOrders.filter(o => o.status === 'in_transit').length
  const selectedTitle   = campaigns.find(c => c.id === selectedCampaign)?.title ?? `Акция #${selectedCampaign}`

  function toggleStatus(s: string) {
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function resetFilters() {
    setDatePreset(''); setCustomFrom(''); setCustomTo('')
    setSelectedStatuses([]); setSelectedCampaign('')
    setSelectedColors([]); setSelectedSubcats([])
  }

  async function handleBulkStatus(from: string, to: string, count: number) {
    const toLabel = STATUS_LABELS[to] ?? to
    if (!window.confirm(`Перевести ${count} заказов акции «${selectedTitle}» в статус «${toLabel}»?`)) return
    setBulkUpdating(true)
    setBulkMsg(null)
    const { updated, error } = await bulkPreorderStatus({ campaign_id: selectedCampaign as number, from, to })
    setBulkUpdating(false)
    if (error) {
      setBulkMsg({ text: `Ошибка: ${error}`, ok: false })
    } else {
      setBulkMsg({ text: `Обновлено ${updated} заказов`, ok: true })
      await loadOrders()
    }
  }

  async function handleStatusChange(orderId: number, newStatus: string) {
    if (updatingId === orderId) return
    setUpdatingId(orderId)
    setStatusError(null)
    const result = await updatePreorderStatus({ order_id: orderId, status: newStatus })
    setUpdatingId(null)
    if (result.error) {
      setStatusError({ id: orderId, msg: result.error })
      return
    }
    await loadOrders()
  }

  function clientLabel(o: PreorderOrder) {
    const name    = o.clients?.name    ?? o.guest_name    ?? null
    const company = o.clients?.company_name               ?? null
    const phone   = o.clients?.phone   ?? o.guest_phone   ?? null
    const isGuest = !o.client_id
    const display = company && name ? `${company} / ${name}` : company || name
    return { display, phone, isGuest }
  }

  if (loading) return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 text-sm text-gray-400">Загрузка…</div>
  )

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600">← Админка</Link>
        <h1 className="text-xl font-bold text-gray-800">Предзаказы</h1>
        <span className="text-sm text-gray-400">({filtered.length})</span>
      </div>

      {/* Filter bar */}
      <div className="space-y-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 mb-5">
        {/* Date */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Период</span>
          {DATE_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setDatePreset(prev => prev === p.id ? '' : p.id)}
              className="px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
              style={{
                background:  datePreset === p.id ? '#8B3A5A' : '#fff',
                color:       datePreset === p.id ? '#fff' : '#555',
                borderColor: datePreset === p.id ? '#8B3A5A' : '#e5e7eb',
              }}
            >{p.label}</button>
          ))}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 mt-1 w-full pl-[72px]">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border rounded px-2 py-1 text-xs" />
              <span className="text-gray-400 text-xs">—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border rounded px-2 py-1 text-xs" />
            </div>
          )}
        </div>

        {/* Status */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Статус</span>
          {ALL_STATUSES.map(s => {
            const active = selectedStatuses.includes(s)
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className="px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
                style={{
                  background:  active ? '#8B3A5A' : '#fff',
                  color:       active ? '#fff' : '#555',
                  borderColor: active ? '#8B3A5A' : '#e5e7eb',
                }}
              >
                {STATUS_LABELS[s] ?? s}
              </button>
            )
          })}
        </div>

        {/* Campaign */}
        {campaigns.length >= 1 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Акция</span>
            <select
              value={selectedCampaign}
              onChange={e => setSelectedCampaign(e.target.value === '' ? '' : parseInt(e.target.value))}
              className="border rounded px-2 py-1 text-xs bg-white"
            >
              <option value="">Все акции</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Subcategory */}
        {availableSubcats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Категория</span>
            {availableSubcats.map(sub => {
              const active = selectedSubcats.includes(sub)
              return (
                <button
                  key={sub}
                  onClick={() => setSelectedSubcats(prev =>
                    prev.includes(sub) ? prev.filter(x => x !== sub) : [...prev, sub]
                  )}
                  className="px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
                  style={{
                    background:  active ? '#8B3A5A' : '#fff',
                    color:       active ? '#fff' : '#555',
                    borderColor: active ? '#8B3A5A' : '#e5e7eb',
                  }}
                >
                  {SUBCATEGORY_LABELS[sub] ?? sub}
                </button>
              )
            })}
          </div>
        )}

        {/* Colors */}
        {availableColors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Цвет</span>
            {availableColors.map(c => {
              const active = selectedColors.includes(c.key)
              const colorDef = c as Record<string, string>
              const bg = colorDef.gradient ?? colorDef.bg
              const borderColor = colorDef.border ?? 'transparent'
              return (
                <button
                  key={c.key}
                  title={c.label}
                  onClick={() => setSelectedColors(prev =>
                    prev.includes(c.key) ? prev.filter(x => x !== c.key) : [...prev, c.key]
                  )}
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    border: `2px solid ${borderColor}`,
                    background: bg,
                    outline: active ? '2px solid #8B3A5A' : 'none',
                    outlineOffset: 2,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />
              )
            })}
          </div>
        )}

        {/* Counter + reset */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Показано <span className="font-semibold text-gray-700">{filtered.length}</span> из{' '}
            <span className="font-semibold text-gray-700">{orders.length}</span>
          </span>
          {hasFilters && (
            <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600">
              Сбросить
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar — shown when a campaign is selected and has actionable orders */}
      {selectedCampaign !== '' && (confirmedCount > 0 || inTransitCount > 0) && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-blue-700 shrink-0">Вся партия:</span>
          {confirmedCount > 0 && (
            <button
              onClick={() => handleBulkStatus('confirmed', 'in_transit', confirmedCount)}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium rounded text-white disabled:opacity-50 transition-opacity"
              style={{ background: '#2563eb' }}
            >
              🚚 В пути ({confirmedCount})
            </button>
          )}
          {inTransitCount > 0 && (
            <button
              onClick={() => handleBulkStatus('in_transit', 'arrived', inTransitCount)}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium rounded text-white disabled:opacity-50 transition-opacity"
              style={{ background: '#0f766e' }}
            >
              📦 На складе ({inTransitCount})
            </button>
          )}
          {bulkUpdating && <span className="text-xs text-blue-600">Обновляем…</span>}
          {bulkMsg && (
            <span className={`text-xs font-medium ${bulkMsg.ok ? 'text-green-700' : 'text-red-600'}`}>
              {bulkMsg.ok ? '✓' : '⚠'} {bulkMsg.text}
            </span>
          )}
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ Ошибка загрузки: {loadError}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">
          {orders.length === 0 ? 'Предзаказов пока нет' : 'Нет предзаказов по выбранным фильтрам'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const { display, phone, isGuest } = clientLabel(order)
            const isExpanded = expandedId === order.id
            const nextStatuses = NEXT_STATUSES[order.status] ?? []
            const canCancel = !['delivered', 'cancelled'].includes(order.status)

            return (
              <div key={order.id} className="border rounded-lg bg-white shadow-sm overflow-hidden">
                {/* Row header */}
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                >
                  {/* Left: id + meta */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-800">#{order.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDateTime(order.created_at)}</span>
                      {order.converted_to_order_id && (
                        <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          → Заказ #{order.converted_to_order_id}
                        </span>
                      )}
                    </div>

                    {/* Campaign */}
                    <div className="text-xs text-gray-600">
                      <span className="font-medium" style={{ color: '#8B3A5A' }}>
                        {order.campaigns?.title ?? `Акция #${order.campaign_id}`}
                      </span>
                      {order.campaigns?.delivery_date && (
                        <span className="text-gray-400 ml-1.5">· Поставка: {fmtDate(order.campaigns.delivery_date)}</span>
                      )}
                    </div>

                    {/* Client */}
                    <div className="text-xs text-gray-600 flex items-center gap-2">
                      {display && <span>👤 {display}</span>}
                      {phone && <span>📞 {phone}</span>}
                      {isGuest && <span className="bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 text-[10px]">гость</span>}
                    </div>
                  </div>

                  {/* Right: total + expand */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-gray-800">
                      {order.total.toLocaleString('ru-RU')} ₸
                    </span>
                    <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 px-4 py-3 space-y-3">
                    {/* Items table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b">
                          <th className="text-left py-1">Товар</th>
                          <th className="text-center py-1 w-20">Срезка</th>
                          <th className="text-center py-1 w-16">Склад</th>
                          <th className="text-center py-1 w-16">Стеблей</th>
                          <th className="text-right py-1 w-24">₸/стебель</th>
                          <th className="text-right py-1 w-24">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.campaign_order_items.map(item => {
                          const ci = item.campaign_items
                          const name = ci?.products?.display_name ?? ci?.products?.name ?? `Позиция #${item.id}`
                          const isAssembled = ['assembled', 'delivered'].includes(order.status)
                          const displayQty = isAssembled
                            ? (item.qty_actual ?? item.qty_ordered)
                            : item.qty_ordered
                          return (
                            <tr key={item.id} className={`border-b last:border-0 text-xs ${item.is_removed ? 'opacity-40' : ''}`}>
                              <td className={`py-1.5 font-medium ${item.is_removed ? 'line-through' : ''}`}>{name}</td>
                              <td className="py-1.5 text-center text-gray-500">{ci?.oz_delivery_date ? fmtDate(ci.oz_delivery_date) : '—'}</td>
                              <td className="py-1.5 text-center text-gray-500">{ci?.oz_stock_type ?? '—'}</td>
                              <td className="py-1.5 text-center">
                                {item.is_removed ? <span className="text-red-400">—</span> : displayQty}
                              </td>
                              <td className="py-1.5 text-right text-gray-600">{item.price.toLocaleString('ru-RU')}</td>
                              <td className="py-1.5 text-right font-semibold">
                                {item.is_removed
                                  ? <span className="text-gray-400">—</span>
                                  : `${(displayQty * item.price).toLocaleString('ru-RU')} ₸`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {order.notes && (
                      <div className="text-xs text-gray-500 bg-white border rounded p-2">{order.notes}</div>
                    )}

                    {/* Status actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {nextStatuses.map(s => {
                        // Override assembling→assembled to open assembly modal
                        if (s === 'assembled') {
                          return (
                            <button
                              key={s}
                              onClick={() => { setAssemblyOrder(order); setExpandedId(null) }}
                              disabled={updatingId === order.id}
                              className="px-3 py-1.5 text-sm rounded text-white font-medium disabled:opacity-50 transition-opacity"
                              style={{ background: '#8B3A5A' }}
                            >
                              📋 Завершить сборку
                            </button>
                          )
                        }
                        return (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(order.id, s)}
                            disabled={updatingId === order.id}
                            className="px-3 py-1.5 text-sm rounded text-white font-medium disabled:opacity-50 transition-opacity"
                            style={{ background: '#8B3A5A' }}
                          >
                            {updatingId === order.id ? 'Сохраняем…' : (NEXT_LABELS[s] ?? STATUS_LABELS[s])}
                          </button>
                        )
                      })}

                      {/* Assembly shortcut available from arrived status */}
                      {order.status === 'arrived' && (
                        <button
                          onClick={() => { setAssemblyOrder(order); setExpandedId(null) }}
                          className="px-3 py-1.5 text-sm rounded border font-medium transition-colors"
                          style={{ borderColor: '#8B3A5A', color: '#8B3A5A' }}
                        >
                          📋 Собрать
                        </button>
                      )}

                      {/* Correction available for non-terminal statuses */}
                      {!['delivered', 'cancelled'].includes(order.status) && (
                        <button
                          onClick={() => { setEditingOrder(order); setExpandedId(null) }}
                          className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-100 font-medium"
                        >
                          ✏️ Корректировка
                        </button>
                      )}

                      {canCancel && (
                        <button
                          onClick={() => handleStatusChange(order.id, 'cancelled')}
                          disabled={updatingId === order.id}
                          className="px-3 py-1.5 text-sm rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                        >
                          ❌ Отменить
                        </button>
                      )}
                    </div>

                    {statusError?.id === order.id && (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                        ⚠️ {statusError.msg}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Assembly modal */}
      {assemblyOrder && (
        <PreorderAssemblyModal
          orderId={assemblyOrder.id}
          items={assemblyOrder.campaign_order_items}
          onClose={() => setAssemblyOrder(null)}
          onSaved={() => { setAssemblyOrder(null); loadOrders() }}
        />
      )}

      {/* Edit / correction modal */}
      {editingOrder && (
        <PreorderEditModal
          orderId={editingOrder.id}
          campaignId={editingOrder.campaign_id}
          items={editingOrder.campaign_order_items}
          onClose={() => setEditingOrder(null)}
          onSaved={() => { setEditingOrder(null); loadOrders() }}
        />
      )}
    </div>
  )
}
