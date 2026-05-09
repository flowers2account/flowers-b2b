'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Campaign = {
  id: number
  title: string
  type: string
  description: string | null
  closes_at: string
  delivery_date: string
  status: string
}

const TYPE_LABELS: Record<string, string> = {
  europe: 'Европа',
  china: 'Китай',
}

function useCountdown(target: string) {
  const [diff, setDiff] = useState(() => new Date(target).getTime() - Date.now())

  useEffect(() => {
    const update = () => setDiff(new Date(target).getTime() - Date.now())
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [target])

  const total = Math.max(0, Math.floor(diff / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    expired: diff <= 0,
  }
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const countdown = useCountdown(campaign.closes_at)

  const delivery = new Date(campaign.delivery_date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const snippet = campaign.description
    ? campaign.description.slice(0, 100) + (campaign.description.length > 100 ? '…' : '')
    : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Header strip */}
      <div className="px-5 py-4" style={{ backgroundColor: '#7a1c2e' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-white/20 text-white text-xs font-medium px-2.5 py-0.5 rounded-full">
            {TYPE_LABELS[campaign.type] ?? campaign.type}
          </span>
        </div>
        <h2 className="text-base font-bold text-white leading-tight">{campaign.title}</h2>
      </div>

      {/* Body */}
      <div className="px-5 py-4 flex flex-col gap-3 flex-1">
        {/* Countdown */}
        {!countdown.expired ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400 text-xs shrink-0">До закрытия:</span>
            <span className="font-semibold" style={{ color: '#7a1c2e' }}>
              {countdown.days > 0 && `${countdown.days} дн `}
              {countdown.hours} ч {countdown.minutes} мин
            </span>
          </div>
        ) : (
          <span className="text-xs text-yellow-700 bg-yellow-50 px-2.5 py-1 rounded-full self-start">
            Приём завершён
          </span>
        )}

        {/* Delivery */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-400 text-xs">Поставка:</span>
          <span className="font-medium">{delivery}</span>
        </div>

        {/* Description */}
        {snippet && (
          <p className="text-sm text-gray-500 leading-snug">{snippet}</p>
        )}

        {/* CTA */}
        <div className="mt-auto pt-2">
          <Link
            href={`/campaigns/${campaign.id}`}
            className="inline-flex items-center gap-1 text-sm font-semibold no-underline transition-colors"
            style={{ color: '#7a1c2e' }}
          >
            Перейти к заказу →
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/campaigns?status=published')
      .then(r => r.json())
      .then(d => {
        const list: Campaign[] = d.campaigns ?? d ?? []
        // Сортируем по closes_at — ближайшие сверху
        list.sort((a, b) => new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime())
        setCampaigns(list)
      })
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div style={{ backgroundColor: '#7a1c2e' }}>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Предзаказы</h1>
          <p className="text-white/70 text-sm">Оформите заявку до закрытия кампании</p>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-gray-400 text-sm py-20 animate-pulse">Загрузка...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🌸</div>
            <p className="text-gray-500 text-sm">Сейчас нет активных предзаказов</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {campaigns.map(c => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
