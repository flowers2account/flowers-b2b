'use client'

import { useEffect, useState } from 'react'
import type { CampaignWithStats, CampaignStatus } from '@/types/campaigns'

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликована',
  closed: 'Закрыта',
  delivered: 'Доставлена',
  cancelled: 'Отменена',
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-700',
  delivered: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

const TYPE_LABELS: Record<string, string> = {
  europe: 'Европа',
  china: 'Китай',
}

const FILTER_OPTIONS: { value: 'all' | CampaignStatus; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'draft', label: 'Черновик' },
  { value: 'published', label: 'Опубликована' },
  { value: 'closed', label: 'Закрыта' },
  { value: 'delivered', label: 'Доставлена' },
]

function closesInHours(closes_at: string): number {
  return Math.max(0, Math.round((new Date(closes_at).getTime() - Date.now()) / 3_600_000))
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtAmount(n: number) {
  return n.toLocaleString('ru-RU') + ' T'
}

export default function CampaignsPanel() {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | CampaignStatus>('all')

  async function fetchCampaigns() {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      const data = await res.json()
      setCampaigns(Array.isArray(data) ? data : (data.campaigns ?? []))
    } catch (e) {
      console.error('Campaigns fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCampaigns() }, [])

  function handleCreate() {
    console.log('TODO: open create campaign modal')
  }

  function handleEdit(id: number) {
    console.log('TODO: open edit modal for campaign', id)
  }

  function handleSummary(id: number) {
    console.log('TODO: open summary modal for campaign', id)
  }

  function handleConvert(id: number) {
    console.log('TODO: convert campaign orders to regular orders, campaign', id)
  }

  const visible = filter === 'all'
    ? campaigns
    : campaigns.filter(c => c.status === filter)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">Кампании предзаказов</span>
        <button
          onClick={handleCreate}
          className="px-3 py-1.5 bg-[#7a1c2e] text-white text-sm rounded hover:bg-[#621624] transition-colors"
        >
          + Создать кампанию
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filter === opt.value
                ? 'bg-[#7a1c2e] text-white border-[#7a1c2e]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 py-4">Загрузка...</div>
      ) : visible.length === 0 ? (
        <div className="text-sm text-gray-400 py-4">Кампаний нет</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#7a1c2e] text-white text-xs">
                <th className="text-left px-3 py-2.5 font-medium sticky top-0 bg-[#7a1c2e]">ID</th>
                <th className="text-left px-3 py-2.5 font-medium sticky top-0 bg-[#7a1c2e]">Название</th>
                <th className="text-left px-3 py-2.5 font-medium sticky top-0 bg-[#7a1c2e]">Тип</th>
                <th className="text-left px-3 py-2.5 font-medium sticky top-0 bg-[#7a1c2e]">Закрытие</th>
                <th className="text-left px-3 py-2.5 font-medium sticky top-0 bg-[#7a1c2e]">Поставка</th>
                <th className="text-left px-3 py-2.5 font-medium sticky top-0 bg-[#7a1c2e]">Статус</th>
                <th className="text-left px-3 py-2.5 font-medium sticky top-0 bg-[#7a1c2e]">Статистика</th>
                <th className="text-right px-3 py-2.5 font-medium sticky top-0 bg-[#7a1c2e]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c, i) => {
                const hoursLeft = c.status === 'published' ? closesInHours(c.closes_at) : null
                return (
                  <tr
                    key={c.id}
                    className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-rose-50 transition-colors`}
                  >
                    <td className="px-3 py-2.5 text-gray-400 font-mono">#{c.id}</td>

                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{c.title}</div>
                      {hoursLeft !== null && (
                        <div className="text-xs text-orange-600 font-medium mt-0.5">
                          Закрывается через {hoursLeft} ч
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-gray-600">
                      {TYPE_LABELS[c.type] ?? c.type}
                    </td>

                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                      {fmtDate(c.closes_at)}
                    </td>

                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                      {fmtDate(c.delivery_date)}
                    </td>

                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      {c.stats ? (
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <div>{c.stats.total_orders} заказов · {c.stats.total_clients} клиентов</div>
                          <div className="font-medium text-gray-800">{fmtAmount(c.stats.total_amount)}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        <button
                          onClick={() => handleEdit(c.id)}
                          className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleSummary(c.id)}
                          className="px-2.5 py-1 text-xs bg-[#f3e8ea] text-[#7a1c2e] rounded hover:bg-[#e8d0d4] transition-colors"
                        >
                          Сводка
                        </button>
                        {c.status === 'closed' && (
                          <button
                            onClick={() => handleConvert(c.id)}
                            className="px-2.5 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          >
                            Конвертировать
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
