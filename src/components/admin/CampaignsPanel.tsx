'use client'

import { useEffect, useState } from 'react'
import type { CampaignWithStats, CampaignStatus } from '@/types/campaigns'
import CreateCampaignModal from './CreateCampaignModal'

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликована',
  closed: 'Закрыта',
  delivered: 'Доставлена',
  cancelled: 'Отменена'
}

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-700',
  delivered: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500'
}

export default function CampaignsPanel() {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)

  async function fetchCampaigns() {
    setLoading(true)
    try {
      const url = filter === 'all' ? '/api/campaigns' : `/api/campaigns?status=${filter}`
      const res = await fetch(url)
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [filter])

  function handleCreate() {
    setShowCreateModal(true)
  }

  function handleEdit(id: number) {
    console.log('TODO: edit campaign', id)
  }

  function handleSummary(id: number) {
    console.log('TODO: show summary modal', id)
  }

  function handleConvert(id: number) {
    console.log('TODO: convert campaign orders', id)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function getClosingTimer(closesInHours: number) {
    if (closesInHours <= 0) return 'Закрыта'
    if (closesInHours < 24) return `${Math.floor(closesInHours)} ч`
    const days = Math.floor(closesInHours / 24)
    return `${days} дн`
  }

  const filtered = campaigns

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex gap-2">
          {(['all', 'draft', 'published', 'closed', 'delivered'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                filter === s
                  ? 'bg-[#7a1c2e] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'Все' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <button
          onClick={handleCreate}
          className="px-3 py-1.5 bg-[#7a1c2e] text-white text-sm rounded hover:bg-[#621624] transition-colors"
        >
          + Создать кампанию
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Нет кампаний</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#7a1c2e] text-white sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium">ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium">Название</th>
                <th className="px-4 py-2 text-left text-xs font-medium">Тип</th>
                <th className="px-4 py-2 text-left text-xs font-medium">Закрытие</th>
                <th className="px-4 py-2 text-left text-xs font-medium">Поставка</th>
                <th className="px-4 py-2 text-left text-xs font-medium">Статус</th>
                <th className="px-4 py-2 text-left text-xs font-medium">Статистика</th>
                <th className="px-4 py-2 text-left text-xs font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => (
                <tr
                  key={c.id}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="px-4 py-3 text-sm text-gray-600">#{c.id}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{c.title}</div>
                    {c.status === 'published' && c.stats && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Закрывается через {getClosingTimer(c.stats.closes_in_hours)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {c.type === 'europe' ? 'Европа' : 'Китай'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDateTime(c.closes_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(c.delivery_date)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.stats && (
                      <div className="text-xs text-gray-600">
                        <div>{c.stats.total_orders} заказов</div>
                        <div>{c.stats.total_clients} клиентов</div>
                        <div className="font-medium">
                          {c.stats.total_amount.toLocaleString('ru-RU')} ₸
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(c.id)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Ред.
                      </button>
                      <button
                        onClick={() => handleSummary(c.id)}
                        className="px-2 py-1 text-xs text-[#7a1c2e] hover:bg-red-50 rounded"
                      >
                        Сводка
                      </button>
                      {c.status === 'closed' && (
                        <button
                          onClick={() => handleConvert(c.id)}
                          className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded"
                        >
                          Конверт.
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            fetchCampaigns()
          }}
        />
      )}
    </div>
  )
}
