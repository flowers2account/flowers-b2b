'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ChangePinModal from '@/components/cabinet/ChangePinModal'
import EditProfileModal from '@/components/cabinet/EditProfileModal'
import { createClient } from '@/lib/supabase/client'

type CampaignOrderItem = {
  id: number
  qty: number
  price: number
  name: string
  delivery_date: string | null
}

type CampaignOrder = {
  id: number
  campaign_id: number
  campaign_title: string | null
  campaign_type: string | null
  delivery_date: string | null
  status: string
  total: number
  items_count: number
  converted_to_order_id: number | null
  items: CampaignOrderItem[]
}

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  pending:   'Ожидает поставки',
  confirmed: 'Подтверждён',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
}

const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  pending:   'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  delivered: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
}

type OrderItem = {
  id: string
  qty: number
  qty_ordered: number
  qty_actual: number | null
  is_removed: boolean
  price: number
  product: { name: string; display_name?: string | null } | null
}

type Order = {
  id: string
  status: string
  created_at: string
  assembly_photo_url: string | null
  order_items: OrderItem[]
}

const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Обрабатывается',
  reserved: '⏳ Обрабатывается',
  confirmed: '✅ Подтверждён',
  assembling: '🔧 Собирается на складе',
  assembled: '📦 Готов к выдаче!',
  delivered: '✅ Выдан',
  cancelled: '❌ Отменён',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reserved: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  assembling: 'bg-orange-100 text-orange-800',
  assembled: 'bg-teal-100 text-teal-900 font-bold',
  delivered: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
}

const STEP_ORDER = ['pending', 'confirmed', 'assembling', 'assembled', 'delivered']

const TIMELINE_STEPS = [
  { key: 'pending', label: 'Создан' },
  { key: 'confirmed', label: 'Подтверждён' },
  { key: 'assembling', label: 'Собирается' },
  { key: 'assembled', label: 'Готов' },
  { key: 'delivered', label: 'Выдан' },
]

function normalizeStep(status: string): string {
  if (status === 'reserved') return 'pending'
  return status
}

function StatusTimeline({ status }: { status: string }) {
  if (status === 'cancelled') return null
  const normalized = normalizeStep(status)
  const currentIdx = STEP_ORDER.indexOf(normalized)
  if (currentIdx === -1) return null

  return (
    <div className="flex items-center mt-3 mb-1">
      {TIMELINE_STEPS.map((step, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <span className={`text-base leading-none ${done || active ? 'opacity-100' : 'opacity-25'}`}>
                {done ? '✅' : active ? '🔵' : '⬜'}
              </span>
              <span className={`text-[10px] mt-0.5 whitespace-nowrap ${active ? 'text-gray-800 font-medium' : done ? 'text-gray-500' : 'text-gray-300'}`}>
                {step.label}
              </span>
            </div>
            {idx < TIMELINE_STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 mb-3 ${idx < currentIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function AssemblyChanges({ items }: { items: OrderItem[] }) {
  const removed = items.filter(i => i.is_removed)
  const changed = items.filter(i => !i.is_removed && i.qty_actual !== null && i.qty_actual !== (i.qty_ordered ?? i.qty))
  if (!removed.length && !changed.length) return null

  const actualTotal = items
    .filter(i => !i.is_removed)
    .reduce((s, i) => s + (i.qty_actual ?? i.qty_ordered ?? i.qty) * i.price, 0)

  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
      <p className="font-medium text-amber-800 mb-1.5">Изменения в заказе</p>
      {removed.map(i => (
        <p key={i.id} className="text-amber-700">• {i.product?.name ?? '—'}: позиция снята</p>
      ))}
      {changed.map(i => (
        <p key={i.id} className="text-amber-700">
          • {i.product?.name ?? '—'}: заказано {i.qty_ordered ?? i.qty} шт, выдаётся {i.qty_actual} шт
        </p>
      ))}
      <p className="font-semibold text-amber-800 mt-2 pt-2 border-t border-amber-200">
        Итоговая сумма: {actualTotal.toLocaleString()} ₸
      </p>
    </div>
  )
}

export default function CabinetPage() {
  const { isAuthed, phone, user, init, logout } = useAuthStore()
  const router = useRouter()
  const [tab, setTab] = useState<'orders' | 'profile' | 'security'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [campaignOrders, setCampaignOrders] = useState<CampaignOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [clientInfo, setClientInfo] = useState<{ name: string | null; company_name: string | null } | null>(null)

  useEffect(() => {
    init()
  }, [])

  async function loadClientInfo() {
    if (!phone) return
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('name, company_name')
      .or(`phone.eq.${phone},phone.eq.${phone.replace('+', '')}`)
      .maybeSingle()
    if (data) setClientInfo({ name: data.name, company_name: data.company_name })
  }

  useEffect(() => {
    if (!isAuthed || !phone) {
      router.push('/')
      return
    }

    loadClientInfo()

    const fetches: Promise<void>[] = [
      fetch(`/api/cabinet?phone=${encodeURIComponent(phone)}`)
        .then(r => r.json())
        .then(data => setOrders(data.orders ?? [])),
    ]

    if (phone) {
      fetches.push(
        fetch(`/api/campaigns/orders?phone=${encodeURIComponent(phone)}`)
          .then(r => r.json())
          .then(data => {
            const list: CampaignOrder[] = (data.orders ?? []).map((o: any) => ({
                  ...o, items: o.items ?? [], converted_to_order_id: o.converted_to_order_id ?? null,
                }))
            list.sort((a, b) => {
              if (a.status === 'pending' && b.status !== 'pending') return -1
              if (b.status === 'pending' && a.status !== 'pending') return 1
              return new Date(a.delivery_date ?? 0).getTime() - new Date(b.delivery_date ?? 0).getTime()
            })
            setCampaignOrders(list)
          })
          .catch(() => {})
      )
    }

    Promise.all(fetches).finally(() => setLoading(false))
  }, [isAuthed, phone, user?.id, router])

  if (!isAuthed) return null

  const initials = (clientInfo?.name || '').split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase()).join('') || '👤'

  const MENU = [
    { id: 'orders' as const, label: 'Мои заказы' },
    { id: 'profile' as const, label: 'Профиль и доставка' },
    { id: 'security' as const, label: 'Безопасность · PIN' },
  ]

  const ordersPane = (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-gray-800">Мои заказы</h2>
        {(() => {
          const active = orders.filter(o =>
            (o as any).payment_status === 'paid' &&
            !['cancelled', 'delivered'].includes(o.status)
          )
          if (!active.length) return null
          const sum = active.reduce((s, o) => s + Number((o as any).total ?? 0), 0)
          return (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#F7EEF2', border: '1px solid #C97A92',
              borderRadius: 20, padding: '3px 12px',
              fontSize: 13, fontWeight: 600, color: '#8B3A5A',
            }}>
              {active.length} активн.
              <span style={{ opacity: 0.6, fontSize: 11 }}>·</span>
              {sum.toLocaleString('ru-RU')} ₸
            </span>
          )
        })()}
      </div>
      <p className="text-sm text-gray-500 -mt-2">История заказов и быстрый повтор.</p>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : orders.length === 0 && campaignOrders.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🌸</p>
          <p>У вас пока нет заказов</p>
          <Link href="/" className="mt-4 inline-block text-pink-500 hover:underline">Перейти в каталог</Link>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Предзаказы */}
          {campaignOrders.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide pt-2">
                📅 Мои предзаказы
              </h2>
              {campaignOrders.map(co => {
                const delivery = co.delivery_date
                  ? new Date(co.delivery_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
                  : null
                return (
                  <div key={co.id} className="border rounded-xl p-4 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg shrink-0">📅</span>
                        <span className="font-medium text-gray-800 leading-tight">
                          {co.campaign_title ?? `Предзаказ #${co.id}`}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${CAMPAIGN_STATUS_COLORS[co.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {CAMPAIGN_STATUS_LABELS[co.status] ?? co.status}
                      </span>
                    </div>

                    {delivery && (
                      <p className="text-sm text-gray-500 mb-2">Поставка: {delivery}</p>
                    )}

                    {/* Позиции */}
                    {co.items.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {co.items.map(item => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span className="text-gray-700 truncate flex-1 mr-2">{item.name}</span>
                            <span className="text-gray-500 shrink-0">
                              {item.qty} шт · {(item.qty * item.price).toLocaleString()} ₸
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {co.converted_to_order_id && (
                      <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 mb-2">
                        ✅ Переведён в заказ #{co.converted_to_order_id}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm text-gray-500">{co.items_count} поз.</span>
                      <span className="font-semibold text-sm">{co.total.toLocaleString()} ₸</span>
                    </div>
                  </div>
                )
              })}
              {orders.length > 0 && (
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide pt-2">
                  Обычные заказы
                </h2>
              )}
            </>
          )}

          {orders.map(order => {
            const visibleItems = order.order_items.filter(i => !i.is_removed)
            const total = visibleItems.reduce((s, i) => s + (i.qty_actual ?? i.qty_ordered ?? i.qty) * i.price, 0)
            const date = new Date(order.created_at).toLocaleString('ru-RU', {
              timeZone: 'Asia/Oral', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
            })
            const isAssembled = order.status === 'assembled'
            const hasChanges = order.order_items.some(
              i => i.is_removed || (i.qty_actual !== null && i.qty_actual !== (i.qty_ordered ?? i.qty))
            )

            return (
              <div key={order.id} className={`border rounded-xl p-4 bg-white shadow-sm ${isAssembled ? 'border-teal-400 ring-1 ring-teal-300' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{date}</span>
                  <div className="flex items-center gap-2">
                    {(order as any).payment_status === 'paid' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                        ✅ Оплачен
                      </span>
                    )}
                    {(order as any).payment_status === 'unpaid' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                        💳 Не оплачен
                      </span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                </div>

                {isAssembled && (
                  <div className="mt-2 mb-1 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                    <p className="text-sm text-teal-800 font-medium">Ваш заказ собран и готов к выдаче</p>
                    {order.assembly_photo_url && (
                      <a href={order.assembly_photo_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2">
                        <img
                          src={order.assembly_photo_url}
                          alt="Фото заказа"
                          style={{ width: 200, height: 150, objectFit: 'cover' }}
                          className="rounded border border-teal-300 hover:opacity-90 transition-opacity"
                        />
                      </a>
                    )}
                  </div>
                )}

                <StatusTimeline status={order.status} />

                <div className="space-y-1 mt-2">
                  {visibleItems.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {(item.product?.display_name || item.product?.name) ?? '—'} × {item.qty_actual ?? item.qty_ordered ?? item.qty}
                      </span>
                      <span className="text-gray-500">
                        {((item.qty_actual ?? item.qty_ordered ?? item.qty) * item.price).toLocaleString()} ₸
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t mt-3 pt-2 flex justify-between text-sm font-semibold">
                  <span>Итого</span>
                  <span>{total.toLocaleString()} ₸</span>
                </div>

                {(isAssembled || order.status === 'delivered') && hasChanges && (
                  <AssemblyChanges items={order.order_items} />
                )}

                <Link href={`/order/${order.id}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#8B3A5A] hover:underline">
                  Подробнее →
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const profilePane = (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Профиль и доставка</h2>
        <p className="text-sm text-gray-500 mt-0.5">Контакты и реквизиты для документов и доставки.</p>
      </div>
      <div className="border rounded-xl bg-white p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Контактные данные</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-1">Имя / организация</div>
            <div className="text-sm text-gray-800">{clientInfo?.name || '—'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-1">Телефон (логин)</div>
            <div className="text-sm text-gray-800">{phone || '—'}</div>
            <div className="text-xs text-gray-400 mt-1">Номер — ваш логин. Для смены обратитесь к менеджеру.</div>
          </div>
        </div>
        {clientInfo?.company_name && (
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-1">Реквизиты / организация</div>
            <div className="text-sm text-gray-800">{clientInfo.company_name}</div>
          </div>
        )}
        <button onClick={() => setEditProfileOpen(true)}
          className="h-10 px-5 rounded-lg bg-[#8B3A5A] hover:bg-[#6E2A45] text-white text-sm font-semibold transition-colors">
          Редактировать профиль
        </button>
      </div>
    </div>
  )

  const securityPane = (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Безопасность · PIN-код</h2>
        <p className="text-sm text-gray-500 mt-0.5">PIN-код используется для входа в магазин по номеру телефона.</p>
      </div>
      <div className="border rounded-xl bg-white p-5 space-y-4">
        <div className="flex gap-2 items-start bg-[#F7EEF2] border border-[#E6DFD9] rounded-lg p-3 text-sm text-[#8B3A5A]">
          <span>🔑</span>
          <span>При регистрации менеджер прислал вам PIN-код. Здесь его можно сменить на удобный — минимум 4 цифры.</span>
        </div>
        <button onClick={() => setPinModalOpen(true)}
          className="h-10 px-5 rounded-lg bg-[#8B3A5A] hover:bg-[#6E2A45] text-white text-sm font-semibold transition-colors">
          Сменить PIN
        </button>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full bg-[#8B3A5A] text-white flex items-center justify-center font-semibold shrink-0">{initials}</span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-800 truncate">{clientInfo?.name || 'Личный кабинет'}</h1>
            <p className="text-sm text-gray-500 truncate">📞 {phone}</p>
          </div>
        </div>
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 shrink-0">← Каталог</Link>
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-6 items-start">
        <aside className="border rounded-xl bg-white p-2 flex md:flex-col gap-1 overflow-x-auto">
          {MENU.map(m => (
            <button key={m.id} onClick={() => setTab(m.id)}
              className={`px-3.5 py-2.5 rounded-lg text-sm font-medium text-left whitespace-nowrap transition-colors ${tab === m.id ? 'bg-[#8B3A5A] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {m.label}
            </button>
          ))}
          <button onClick={() => { logout(); router.push('/') }}
            className="px-3.5 py-2.5 rounded-lg text-sm font-medium text-left whitespace-nowrap text-gray-400 hover:bg-gray-50 md:mt-1 md:border-t md:pt-3">
            Выйти
          </button>
        </aside>

        <main className="min-w-0">
          {tab === 'orders' && ordersPane}
          {tab === 'profile' && profilePane}
          {tab === 'security' && securityPane}
        </main>
      </div>

      <ChangePinModal isOpen={pinModalOpen} onClose={() => setPinModalOpen(false)} />
      <EditProfileModal
        isOpen={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        currentName={clientInfo?.name || ''}
        currentCompany={clientInfo?.company_name || ''}
        onSuccess={() => { loadClientInfo(); setEditProfileOpen(false) }}
      />
    </div>
  )
}
