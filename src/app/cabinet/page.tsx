'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ChangePinModal from '@/components/cabinet/ChangePinModal'
import EditProfileModal from '@/components/cabinet/EditProfileModal'
import { createClient } from '@/lib/supabase/client'
import { authHeaders } from '@/lib/api-token'
import { useCart } from '@/lib/cart-store'
import s from './cabinet.module.css'

type CampaignOrderItem = { id: number; qty: number; price: number; name: string; delivery_date: string | null }
type CampaignOrder = {
  id: number; campaign_id: number; campaign_title: string | null; campaign_type: string | null
  delivery_date: string | null; status: string; total: number; items_count: number
  converted_to_order_id: number | null; items: CampaignOrderItem[]
}
type OrderItem = {
  id: string; qty: number; qty_ordered: number; qty_actual: number | null; is_removed: boolean
  price: number; product: { id: number; name: string; display_name?: string | null } | null
}
type Order = {
  id: string; status: string; created_at: string; payment_status?: string | null; total?: number | null
  assembly_photo_url: string | null; order_items: OrderItem[]
}

const CAMPAIGN_STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Ожидает поставки', cls: 'proc' },
  confirmed: { label: 'Подтверждён', cls: 'new' },
  delivered: { label: 'Доставлен', cls: 'done' },
  cancelled: { label: 'Отменён', cls: 'cancelled' },
}
const ORDER_ST: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'В обработке', cls: 'proc' },
  reserved:  { label: 'В обработке', cls: 'proc' },
  confirmed: { label: 'Подтверждён', cls: 'new' },
  assembling:{ label: 'Собирается', cls: 'proc' },
  assembled: { label: 'Готов к выдаче', cls: 'new' },
  delivered: { label: 'Выдан', cls: 'done' },
  cancelled: { label: 'Отменён', cls: 'cancelled' },
}

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'
const dateFmt = (v: string) => new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const THUMB = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" /></svg>

const MENU = [
  { id: 'orders' as const, label: 'Мои заказы', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg> },
  { id: 'profile' as const, label: 'Профиль и доставка', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
  { id: 'security' as const, label: 'Безопасность · PIN', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> },
]

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

  useEffect(() => { init() }, [])

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
    if (!isAuthed || !phone) { router.push('/'); return }
    loadClientInfo()
    ;(async () => {
      const headers = await authHeaders()
      await Promise.allSettled([
        fetch('/api/cabinet', { headers }).then(r => r.json()).then(d => setOrders(d.orders ?? [])).catch(() => {}),
        fetch('/api/campaigns/orders', { headers }).then(r => r.json()).then(d => {
          const list: CampaignOrder[] = (d.orders ?? []).map((o: any) => ({ ...o, items: o.items ?? [], converted_to_order_id: o.converted_to_order_id ?? null }))
          list.sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1
            if (b.status === 'pending' && a.status !== 'pending') return 1
            return new Date(a.delivery_date ?? 0).getTime() - new Date(b.delivery_date ?? 0).getTime()
          })
          setCampaignOrders(list)
        }).catch(() => {}),
      ])
      setLoading(false)
    })()
  }, [isAuthed, phone, user?.id, router])

  if (!isAuthed) return null

  const initials = (clientInfo?.name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '👤'
  const totalOrders = orders.length + campaignOrders.length

  function repeat(order: Order) {
    const cart = useCart.getState()
    for (const it of order.order_items) {
      if (it.is_removed || !it.product) continue
      const q = it.qty_actual ?? it.qty_ordered ?? it.qty
      cart.add({ id: it.product.id, name: it.product.display_name || it.product.name, price: it.price, available: Math.max(q, 1), category: 'accessories' })
      cart.update(it.product.id, q)
    }
    router.push('/cart')
  }

  // ── ORDERS ──────────────────────────────────────────────────────────────
  const ordersPane = (
    <>
      <div className={s.secTitle}>Мои заказы</div>
      <div className={s.secSub}>История заказов и быстрый повтор. Документы и детали — внутри заказа.</div>

      {loading ? (
        <div className={s.empty}>Загрузка…</div>
      ) : totalOrders === 0 ? (
        <div className={s.empty}>
          <p>У вас пока нет заказов</p>
          <Link href="/catalog" className={s.go}>Перейти в каталог →</Link>
        </div>
      ) : (
        <>
          {orders.map(order => {
            const visible = order.order_items.filter(i => !i.is_removed)
            const qtyTotal = visible.reduce((sum, i) => sum + (i.qty_actual ?? i.qty_ordered ?? i.qty), 0)
            const total = Number(order.total ?? visible.reduce((sum, i) => sum + (i.qty_actual ?? i.qty_ordered ?? i.qty) * i.price, 0))
            const st = ORDER_ST[order.status] ?? { label: order.status, cls: 'proc' }
            const shown = Math.min(visible.length, 4)
            const more = visible.length - shown
            const hasChanges = order.order_items.some(i => i.is_removed || (i.qty_actual !== null && i.qty_actual !== (i.qty_ordered ?? i.qty)))
            return (
              <div key={order.id} className={s.order}>
                <div className={s.oHead}>
                  <span className={s.num}>№ {order.id}</span>
                  <span className={s.date}>от {dateFmt(order.created_at)}</span>
                  {order.payment_status === 'unpaid' && <span className={s.unpaid}>💳 Не оплачен</span>}
                  <span className={`${s.st} ${s[st.cls]}`}><span className={s.d} />{st.label}</span>
                  <span className={s.sum}>{fmt(total)}</span>
                </div>
                <div className={s.oBody}>
                  <div className={s.oThumbs}>
                    {Array.from({ length: shown }).map((_, i) => <span key={i} className={s.t}>{THUMB}</span>)}
                    {more > 0 && <span className={s.more}>+{more}</span>}
                  </div>
                  <div className={s.oInfo}><b>{visible.length}</b> наимен. · <b>{qtyTotal}</b> шт</div>
                  <div className={s.oActs}>
                    <Link href={`/order/${order.id}`} className={s.btn}>Подробнее</Link>
                    <button className={`${s.btn} ${s.solid}`} onClick={() => repeat(order)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15" /></svg>
                      Повторить
                    </button>
                  </div>
                </div>
                {(order.status === 'assembled' || order.status === 'delivered') && hasChanges && (
                  <div className={s.changes}>Часть позиций скорректирована при сборке — подробности в заказе.</div>
                )}
              </div>
            )
          })}

          {campaignOrders.length > 0 && (
            <>
              <div className={s.subhead}>Предзаказы</div>
              {campaignOrders.map(co => {
                const cst = CAMPAIGN_STATUS[co.status] ?? { label: co.status, cls: 'proc' }
                return (
                  <div key={co.id} className={s.order}>
                    <div className={s.oHead}>
                      <span className={s.num}>{co.campaign_title ?? `Предзаказ #${co.id}`}</span>
                      {co.delivery_date && <span className={s.date}>поставка {dateFmt(co.delivery_date)}</span>}
                      <span className={`${s.st} ${s[cst.cls]}`}><span className={s.d} />{cst.label}</span>
                      <span className={s.sum}>{fmt(co.total)}</span>
                    </div>
                    <div className={s.oBody}>
                      <div className={s.oInfo}><b>{co.items_count}</b> поз.{co.converted_to_order_id ? ` · переведён в заказ №${co.converted_to_order_id}` : ''}</div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </>
      )}
    </>
  )

  // ── PROFILE ─────────────────────────────────────────────────────────────
  const profilePane = (
    <>
      <div className={s.secTitle}>Профиль и доставка</div>
      <div className={s.secSub}>Контакты и реквизиты для документов и доставки.</div>
      <div className={s.cardBox}>
        <h3>Контактные данные</h3>
        <div className={s.kv}><div className={s.k}>Имя / организация</div><div className={s.v}>{clientInfo?.name || '—'}</div></div>
        <div className={s.kv}>
          <div className={s.k}>Телефон (логин)</div>
          <div className={s.v}>{phone || '—'}</div>
          <div className={s.hint}>Номер — ваш логин. Для смены обратитесь к менеджеру.</div>
        </div>
        {clientInfo?.company_name && (
          <div className={s.kv}><div className={s.k}>Реквизиты / организация</div><div className={s.v}>{clientInfo.company_name}</div></div>
        )}
        <button className={s.save} onClick={() => setEditProfileOpen(true)}>Редактировать профиль</button>
      </div>
    </>
  )

  // ── SECURITY ────────────────────────────────────────────────────────────
  const securityPane = (
    <>
      <div className={s.secTitle}>Безопасность · PIN-код</div>
      <div className={s.secSub}>PIN-код используется для входа в магазин по номеру телефона.</div>
      <div className={s.cardBox}>
        <div className={s.pininfo}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span>При регистрации менеджер прислал вам PIN-код. Здесь его можно сменить на удобный — минимум 4 цифры.</span>
        </div>
        <button className={s.save} onClick={() => setPinModalOpen(true)}>Сменить PIN</button>
      </div>
    </>
  )

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.frame}>
          <div className={s.lk}>
            <aside className={s.side}>
              <div className={s.user}>
                <span className={s.ava}>{initials}</span>
                <span className={s.who}>
                  <span className={s.nm}>{clientInfo?.name || 'Личный кабинет'}</span>
                  <span className={s.ph}>{phone}</span>
                </span>
              </div>
              <div className={s.menu}>
                {MENU.map(m => (
                  <button key={m.id} className={`${s.mi} ${tab === m.id ? s.on : ''}`} onClick={() => setTab(m.id)}>
                    {m.icon}{m.label}
                    {m.id === 'orders' && totalOrders > 0 && <span className={s.badge}>{totalOrders}</span>}
                  </button>
                ))}
                <button className={`${s.mi} ${s.exit}`} onClick={() => { logout(); router.push('/') }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                  Выйти
                </button>
              </div>
            </aside>

            <main className={s.content}>
              {tab === 'orders' && ordersPane}
              {tab === 'profile' && profilePane}
              {tab === 'security' && securityPane}
            </main>
          </div>
        </div>
      </div>

      <ChangePinModal isOpen={pinModalOpen} onClose={() => setPinModalOpen(false)} />
      <EditProfileModal
        isOpen={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        currentName={clientInfo?.name || ''}
        currentCompany={clientInfo?.company_name || ''}
        onSuccess={() => { loadClientInfo(); setEditProfileOpen(false) }}
      />
    </main>
  )
}
