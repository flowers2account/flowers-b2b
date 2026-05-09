'use client'

import { useEffect, useState } from 'react'
import type { CampaignSummaryRow } from '@/types/campaigns'

interface Props {
  campaignId: number
  onClose: () => void
}

export default function CampaignSummaryModal({ campaignId, onClose }: Props) {
  const [rows, setRows] = useState<CampaignSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/summary`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setRows(data.summary ?? [])
        }
      })
      .catch(() => setError('Ошибка загрузки сводки'))
      .finally(() => setLoading(false))
  }, [campaignId])

  function toggleExpanded(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleDownloadExcel() {
    window.open(`/api/campaigns/${campaignId}/summary?format=excel`, '_blank')
  }

  const totalPositions = rows.length
  const totalClients = new Set(
    rows.flatMap(r => (r.orders_breakdown ?? []).map(o => o.client_id ?? o.client_name))
  ).size
  const totalAmount = rows.reduce((sum, r) => sum + r.price * r.total_qty_ordered, 0)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-base font-semibold text-gray-800">
            Сводный заказ поставщику
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col">
          {loading ? (
            <div className="text-center py-16 text-sm text-gray-400">Загрузка...</div>
          ) : error ? (
            <div className="text-center py-16 text-sm text-red-500">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">Нет заказов по кампании</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#7a1c2e] text-white sticky top-[61px] z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium w-8"></th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium">Товар</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium whitespace-nowrap">Цена, ₸</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium whitespace-nowrap">Кратность</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium whitespace-nowrap">Заказано</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium">Клиентов</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => {
                    const isOpen = expanded.has(row.campaign_item_id)
                    const productLabel = [row.variety_name || row.product_name, row.length_str]
                      .filter(Boolean)
                      .join(', ')
                    const subLabel = row.variety_name ? row.product_name : null

                    return (
                      <>
                        <tr
                          key={row.campaign_item_id}
                          className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-[#7a1c2e]/[0.03] transition-colors`}
                        >
                          <td className="px-4 py-3">
                            {(row.orders_breakdown?.length ?? 0) > 0 && (
                              <button
                                onClick={() => toggleExpanded(row.campaign_item_id)}
                                className="w-5 h-5 rounded flex items-center justify-center text-[#7a1c2e] hover:bg-[#7a1c2e]/10 transition-colors text-xs"
                                aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
                              >
                                {isOpen ? '▼' : '▶'}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{productLabel}</div>
                            {subLabel && (
                              <div className="text-xs text-gray-400 mt-0.5">{subLabel}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-700 tabular-nums">
                            {row.price.toLocaleString('ru-RU')}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-700 tabular-nums">
                            {row.pack_size}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 tabular-nums">
                            {row.total_qty_ordered}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600 tabular-nums">
                            {row.orders_breakdown?.length ?? 0}
                          </td>
                        </tr>

                        {/* Аккордеон: разбивка по клиентам */}
                        {isOpen && (row.orders_breakdown?.length ?? 0) > 0 && (
                          <tr key={`${row.campaign_item_id}-breakdown`} className="bg-[#7a1c2e]/[0.03]">
                            <td />
                            <td colSpan={5} className="px-4 py-2 pb-3">
                              <div className="text-xs font-medium text-[#7a1c2e] mb-1.5 uppercase tracking-wide">
                                Разбивка по клиентам
                              </div>
                              <div className="grid gap-1">
                                {(row.orders_breakdown ?? []).map((o, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between text-sm text-gray-700 bg-white rounded px-3 py-1.5 border border-gray-100"
                                  >
                                    <span className="text-gray-800">{o.client_name}</span>
                                    <span className="font-medium tabular-nums">{o.qty} шт.</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Итоги */}
          {!loading && !error && rows.length > 0 && (
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-xl">
              <div className="flex flex-wrap gap-6 text-sm text-gray-700">
                <div>
                  Всего позиций:{' '}
                  <span className="font-semibold text-gray-900">{totalPositions}</span>
                </div>
                <div>
                  Всего клиентов:{' '}
                  <span className="font-semibold text-gray-900">{totalClients}</span>
                </div>
                <div>
                  Общая сумма:{' '}
                  <span className="font-semibold text-[#7a1c2e]">
                    {totalAmount.toLocaleString('ru-RU')} ₸
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleDownloadExcel}
            disabled={loading || !!error || rows.length === 0}
            className="px-4 py-2 text-sm text-[#7a1c2e] border border-[#7a1c2e] rounded-lg hover:bg-[#7a1c2e]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Скачать Excel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-[#7a1c2e] text-white rounded-lg hover:bg-[#621624] transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
