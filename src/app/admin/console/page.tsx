'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { authHeaders } from '@/lib/api-token'
import {
  Package, Clock, User, ChevronRight, ChevronLeft, Plus, Minus,
  CheckCircle2, AlertCircle, Phone, Building2, MapPin, Calendar, Wallet,
  FileText, QrCode, Banknote, Receipt, Printer, Truck, Search, Camera, X, Save, Gauge,
  Users, ShoppingBag,
} from 'lucide-react'

/* ───────── Бренд ───────── */
const C = {
  wine: '#7a1c2e', blush: '#F7EEF2', blush2: '#F5E8EC', stone: '#6B7570',
  fern: '#3D6B50', ink: '#1C1C1C', line: '#E7E2E4', bg: '#FBFAFA',
  amber: '#B7791F', blue: '#3E6E8E',
}

/* ───────── Стадии (enum order_status) ───────── */
const STAGES = [
  { key: 'pending', label: 'Новый', color: C.stone },
  { key: 'reserved', label: 'В работе', color: '#5B7DB1' },
  { key: 'confirmed', label: 'Подтверждён', color: C.blue },
  { key: 'assembling', label: 'Сборка', color: C.amber },
  { key: 'assembled', label: 'Собран', color: '#7A6A1F' },
  { key: 'delivered', label: 'Выдан', color: C.fern },
] as const
const stageIndex = (k: string) => STAGES.findIndex((s) => s.key === k)
const EXTRA: Record<string, { label: string; color: string }> = {
  cart: { label: 'Корзина', color: C.stone },
  negotiation: { label: 'Согласование', color: '#8a6d3b' },
  in_transit: { label: 'В пути', color: '#5B7DB1' },
  arrived: { label: 'Прибыл', color: C.blue },
  cancelled: { label: 'Отменён', color: '#9a3346' },
}
const statusMeta = (k: string) => STAGES.find((s) => s.key === k) || EXTRA[k] || { label: k, color: C.stone }

/* ───────── Способы оплаты ───────── */
const PAY: Record<string, { label: string; confirm: 'auto' | 'manual'; Icon: any }> = {
  invoice: { label: 'Счёт (безнал)', confirm: 'manual', Icon: Receipt },
  halyk_qr: { label: 'QR Halyk', confirm: 'auto', Icon: QrCode },
  card: { label: 'Карта', confirm: 'auto', Icon: Receipt },
  epay: { label: 'Карта ePay', confirm: 'auto', Icon: Receipt },
  cash: { label: 'Наличные', confirm: 'manual', Icon: Banknote },
  test: { label: 'Тест', confirm: 'manual', Icon: Receipt },
}
const payInfo = (m?: string | null) => PAY[m || ''] || { label: m || 'не выбран', confirm: 'manual' as const, Icon: Receipt }
const LEGAL_METHODS = ['invoice', 'halyk_qr']
const orderIsLegal = (o: any) => LEGAL_METHODS.includes(o.payment_method)

/* способ выдачи */
const HOME_CITY = 'Уральск'
function fulfillmentMeta(o: any) {
  const ft = o.fulfillment_type || 'pickup'
  if (ft !== 'delivery') return { label: 'Самовывоз', Icon: Package, color: C.stone }
  const city = (o.delivery_city || '').trim()
  if (city && city !== HOME_CITY) return { label: 'Межгород · ' + city, Icon: Truck, color: C.wine }
  return { label: 'Доставка', Icon: Truck, color: C.blue }
}
function fulfillCat(o: any) {
  const ft = o.fulfillment_type || 'pickup'
  if (ft !== 'delivery') return 'pickup'
  const city = (o.delivery_city || '').trim()
  return city && city !== HOME_CITY ? 'intercity' : 'delivery'
}

/* ───────── Утилиты ───────── */
const fmtKZT = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)) + ' ₸'
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Asia/Oral', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '—'
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', {
    timeZone: 'Asia/Oral', day: '2-digit', month: '2-digit', year: 'numeric',
  }) : '—'
function fmtDur(ms: number | null) {
  if (ms == null) return '—'
  const m = Math.round(ms / 60000)
  if (m < 60) return m + 'м'
  const hh = Math.floor(m / 60), mm = m % 60
  return mm ? hh + 'ч ' + mm + 'м' : hh + 'ч'
}
// длительность каждой стадии по переходам order_history (по created_at)
function stageDurations(o: any): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  const hist = (o.history || []).filter((h: any) => h.status_from !== h.status_to)
  for (let i = 0; i < hist.length; i++) {
    const start = new Date(hist[i].created_at).getTime()
    const end = i + 1 < hist.length ? new Date(hist[i + 1].created_at).getTime()
      : (o.status === hist[i].status_to && o.status !== 'delivered' && o.status !== 'cancelled' ? Date.now() : null)
    out[hist[i].status_to] = end != null ? end - start : null
  }
  return out
}
const itemName = (it: any) => it.product?.display_name || it.product?.name || `Товар #${it.product_id || it.id}`
const itemPack = (it: any) => Math.max(1, Number(it.product?.pack_size) || 1)
const clientLabel = (o: any) => o.client?.company_name || o.client?.name || o.guest_name || o.guest_phone || 'Гость'
const goodsTotal = (items: any[]) =>
  items.filter((it) => !it.is_removed).reduce((s, it) => s + Number(it.qty) * Number(it.price), 0)

const EDITABLE = new Set(['cart', 'pending', 'reserved', 'negotiation'])

/* ───────── UI атомы ───────── */
function EntityBadge({ company, mini }: { company: boolean; mini?: boolean }) {
  return (
    <span className={'inline-flex items-center gap-1 rounded-full font-semibold ' + (mini ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs')}
      style={company ? { background: C.wine + '14', color: C.wine } : { background: '#EEF1F0', color: C.stone }}>
      {company ? <Building2 size={mini ? 10 : 12} /> : <User size={mini ? 10 : 12} />}
      {company ? 'Юрлицо' : 'Физлицо'}
    </span>
  )
}
function PayBadge({ status }: { status: string }) {
  const paid = status === 'paid'
  const m = paid
    ? { t: 'Оплачен', bg: '#E8F1EC', fg: C.fern, Icon: CheckCircle2 }
    : { t: 'Не оплачен', bg: '#FBF1E3', fg: C.amber, Icon: Clock }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: m.bg, color: m.fg }}>
      <m.Icon size={12} /> {m.t}
    </span>
  )
}
function PayMethodChip({ method }: { method?: string | null }) {
  const info = payInfo(method)
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: C.blush2, color: C.wine }}>
      <info.Icon size={11} /> {info.label}
    </span>
  )
}
function FulfillmentChip({ order }: { order: any }) {
  const m = fulfillmentMeta(order)
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: m.color + '14', color: m.color }}>
      <m.Icon size={11} /> {m.label}
    </span>
  )
}
function StageChip({ k, big }: { k: string; big?: boolean }) {
  const s = statusMeta(k)
  return (
    <span className={'inline-flex items-center rounded-full font-medium ' + (big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs')}
      style={{ background: s.color + '1A', color: s.color }}>{s.label}</span>
  )
}
function MiniTimeline({ order }: { order: any }) {
  const cur = stageIndex(order.status)
  const dur = stageDurations(order)
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const done = i <= cur
        return (
          <div key={s.key} className="flex flex-col items-center" style={{ width: 50 }}>
            <div className="h-1.5 w-full rounded-full" style={{ background: done ? s.color : C.line }} />
            <span className="mt-1 truncate text-[10px]" style={{ color: done ? C.ink : '#B6AEB1' }}>
              {i === cur ? 'сейчас' : fmtDur(dur[s.key] ?? null)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* подтверждение действий */
type ConfirmCfg = { title: string; message?: string; label?: string; color?: string; onConfirm: () => void }
function ConfirmDialog({ cfg, onClose }: { cfg: ConfirmCfg; onClose: () => void }) {
  const color = cfg.color || C.wine
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" style={{ background: 'rgba(28,28,28,0.45)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-bold" style={{ color: C.ink }}>{cfg.title}</div>
        {cfg.message && <div className="mt-1 text-sm" style={{ color: C.stone }}>{cfg.message}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: C.blush, color: C.wine }}>Отмена</button>
          <button onClick={() => { cfg.onConfirm(); onClose() }} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: color }}>
            {cfg.label || 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  )
}
function SlideOver({ children, onClose }: { children: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(28,28,28,0.35)' }} onClick={onClose}>
      <div className="relative h-full w-full max-w-md bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute left-[-40px] top-4 hidden h-9 w-9 items-center justify-center rounded-full md:flex" style={{ background: '#fff', color: C.wine }}>
          <ChevronLeft size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

/* ───────── Страница ───────── */
export default function ConsolePage() {
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()
  const [tab, setTab] = useState<'orders' | 'clients'>('orders')
  const [orders, setOrders] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [clientsLoaded, setClientsLoaded] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [authReady, setAuthReady] = useState(false)

  // Дожидаемся восстановления сессии, прежде чем решать про доступ. Раньше на холодной
  // загрузке / разлогиненным страница возвращала null → пустой белый экран без подсказки.
  useEffect(() => { let m = true; init().finally(() => { if (m) setAuthReady(true) }); return () => { m = false } }, [init])
  useEffect(() => {
    if (!authReady || !isAuthed) return
    if (role !== 'admin' && role !== 'manager') router.replace('/')
  }, [authReady, isAuthed, role, router])

  const reload = useCallback(async () => {
    try {
      const headers = await authHeaders()
      const r = await fetch('/api/admin/console/orders', { headers, cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Не удалось загрузить заказы'); return }
      setOrders(d.orders || [])
      setErr('')
    } catch {
      setErr('Ошибка сети')
    } finally {
      setLoaded(true)
    }
  }, [])

  const reloadClients = useCallback(async () => {
    try {
      const headers = await authHeaders()
      const r = await fetch('/api/admin/console/clients', { headers, cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Не удалось загрузить клиентов'); return }
      setClients(d.clients || [])
      setErr('')
    } catch {
      setErr('Ошибка сети')
    } finally {
      setClientsLoaded(true)
    }
  }, [])

  useEffect(() => { if (isAuthed && (role === 'admin' || role === 'manager')) reload() }, [isAuthed, role, reload])
  useEffect(() => {
    if (tab === 'clients' && isAuthed && (role === 'admin' || role === 'manager') && !clientsLoaded) reloadClients()
  }, [tab, isAuthed, role, clientsLoaded, reloadClients])

  const api = useCallback(async (path: string, body: any) => {
    setBusy(true)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Ошибка операции')
      await reload()
      return d
    } catch (e: any) {
      setErr(e?.message || 'Ошибка операции')
      throw e
    } finally {
      setBusy(false)
    }
  }, [reload])

  const current = openId != null ? orders.find((o) => o.id === openId) : null

  // Вместо пустого белого экрана — внятные состояния: спиннер на гидрации, форма входа
  // гостю, сообщение при нехватке прав.
  const screen = (node: React.ReactNode) => (
    <div style={{ background: C.bg, color: C.ink, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>{node}</div>
    </div>
  )
  if (!authReady) return screen(<span style={{ color: C.stone }}>Загрузка…</span>)
  if (!isAuthed) return screen(
    <>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Пульт оператора</div>
      <div style={{ color: C.stone, marginBottom: 14 }}>Войдите как сотрудник, чтобы открыть пульт.</div>
      <a href="/login" style={{ display: 'inline-block', background: C.wine, color: '#fff', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>Войти</a>
    </>
  )
  if (role !== 'admin' && role !== 'manager') return screen(<span style={{ color: C.stone }}>Недостаточно прав. Перенаправление…</span>)

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: '100vh' }}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" style={{ background: '#fff', borderBottom: '1px solid ' + C.line }}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: C.wine, color: '#fff' }}><Gauge size={18} /></div>
          <div>
            <div style={{ fontWeight: 700, lineHeight: 1 }}>Пульт оператора</div>
            <div className="text-xs" style={{ color: C.stone }}>Цветы Уральска · склад</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => (tab === 'clients' ? reloadClients() : reload())} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: C.blush, color: C.wine }}>Обновить</button>
          <button onClick={() => useAuthStore.getState().logout().then(() => router.replace('/login'))} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: C.blush, color: C.stone }}>Выйти</button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pt-3">
        <div className="flex items-center gap-1">
          {([
            { k: 'orders', label: 'Заказы', Icon: ShoppingBag },
            { k: 'clients', label: 'Клиенты', Icon: Users },
          ] as const).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className="flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-semibold transition"
              style={tab === t.k
                ? { background: '#fff', color: C.wine, borderBottom: '2px solid ' + C.wine }
                : { background: 'transparent', color: C.stone }}>
              <t.Icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="mx-auto max-w-6xl px-5 pt-3">
          <div className="rounded-lg px-3 py-2 text-sm" style={{ background: '#FBEAEC', color: C.wine }}>{err}</div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-5 py-5">
        {tab === 'orders' ? (
          !loaded ? (
            <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ background: '#fff', border: '1px solid ' + C.line, color: C.stone }}>Загрузка…</div>
          ) : (
            <PipelineView orders={orders} onOpen={setOpenId} />
          )
        ) : (
          !clientsLoaded ? (
            <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ background: '#fff', border: '1px solid ' + C.line, color: C.stone }}>Загрузка…</div>
          ) : (
            <ClientsView clients={clients} />
          )
        )}
      </main>

      {current && (
        <SlideOver onClose={() => setOpenId(null)}>
          <OrderDetail
            order={current}
            busy={busy}
            ask={setConfirm}
            onStatus={(to: string) => api('/api/admin/console/status', { order_id: current.id, to })}
            onPaid={() => api('/api/admin/console/pay', { order_id: current.id })}
            onSaveItems={(items: any[]) => api('/api/admin/console/items', { order_id: current.id, items })}
            onPrint={() => window.open(`/print/order/${current.id}`, '_blank')}
          />
        </SlideOver>
      )}
      {confirm && <ConfirmDialog cfg={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}

/* ───────── Пайплайн ───────── */
function PipelineView({ orders, onOpen }: { orders: any[]; onOpen: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [fFulfill, setFFulfill] = useState('all')
  const [fPay, setFPay] = useState('all')

  const match = (o: any) => {
    const text = (String(o.id) + ' ' + clientLabel(o)).toLowerCase()
    if (q.trim() && !text.includes(q.trim().toLowerCase())) return false
    if (fFulfill !== 'all' && fulfillCat(o) !== fFulfill) return false
    if (fPay !== 'all' && (fPay === 'paid' ? o.payment_status !== 'paid' : o.payment_status === 'paid')) return false
    return true
  }
  const filtered = orders.filter(match)
  const active = filtered.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
  const done = filtered.filter((o) => o.status === 'delivered')
  const cancelled = filtered.filter((o) => o.status === 'cancelled')

  const FilterBtn = ({ val, cur, set, children }: any) => (
    <button onClick={() => set(val)} className="rounded-lg px-2.5 py-1 text-xs font-medium transition"
      style={cur === val ? { background: C.wine, color: '#fff' } : { background: C.blush, color: C.wine }}>{children}</button>
  )
  const Row = ({ o }: { o: any }) => {
    const legal = orderIsLegal(o)
    const waiting = legal && o.payment_status !== 'paid'
    const items = o.items || []
    return (
      <button onClick={() => onOpen(o.id)} className="grid w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:shadow-sm"
        style={{ background: '#fff', border: '1px solid ' + (waiting ? C.amber + '66' : C.line), gridTemplateColumns: 'auto 1fr auto auto auto' }}>
        <div className="font-semibold" style={{ color: C.wine, minWidth: 52 }}>#{o.id}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{clientLabel(o)}</span>
            <EntityBadge company={legal} mini />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: C.stone }}>
            <span>{items.length} поз. · {fmtKZT(Number(o.total))}</span>
            <FulfillmentChip order={o} />
            <PayMethodChip method={o.payment_method} />
            {o.operator_name && <span className="inline-flex items-center gap-0.5" style={{ color: C.fern }}><User size={11} /> {o.operator_name}</span>}
          </div>
        </div>
        <div className="hidden md:block"><MiniTimeline order={o} /></div>
        {waiting ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: '#FBF1E3', color: C.amber }}>
            <Receipt size={12} /> Счёт · ждём оплату
          </span>
        ) : <PayBadge status={o.payment_status} />}
        <div className="flex items-center gap-2"><StageChip k={o.status} /><ChevronRight size={16} style={{ color: C.stone }} /></div>
      </button>
    )
  }
  const Empty = () => <div className="rounded-xl px-4 py-6 text-center text-sm" style={{ background: '#fff', border: '1px dashed ' + C.line, color: C.stone }}>Нет заказов по фильтру</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#fff', border: '1px solid ' + C.line }}>
        <div className="flex items-center gap-1.5 rounded-lg px-2 py-1" style={{ background: C.bg }}>
          <Search size={14} style={{ color: C.stone }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: № или клиент"
            className="bg-transparent text-sm outline-none" style={{ width: 170 }} />
        </div>
        <div className="flex items-center gap-1">
          <FilterBtn val="all" cur={fFulfill} set={setFFulfill}>Все</FilterBtn>
          <FilterBtn val="pickup" cur={fFulfill} set={setFFulfill}>Самовывоз</FilterBtn>
          <FilterBtn val="delivery" cur={fFulfill} set={setFFulfill}>Доставка</FilterBtn>
          <FilterBtn val="intercity" cur={fFulfill} set={setFFulfill}>Межгород</FilterBtn>
        </div>
        <div className="flex items-center gap-1">
          <FilterBtn val="all" cur={fPay} set={setFPay}>Любая оплата</FilterBtn>
          <FilterBtn val="unpaid" cur={fPay} set={setFPay}>Не оплачен</FilterBtn>
          <FilterBtn val="paid" cur={fPay} set={setFPay}>Оплачен</FilterBtn>
        </div>
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: C.stone }}><Clock size={14} /> В работе · {active.length}</h3>
        <div className="space-y-2">{active.length ? active.map((o) => <Row key={o.id} o={o} />) : <Empty />}</div>
      </section>
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: C.stone }}><CheckCircle2 size={14} /> Выданы · {done.length}</h3>
        <div className="space-y-2 opacity-80">{done.map((o) => <Row key={o.id} o={o} />)}</div>
      </section>
      {cancelled.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: C.stone }}><AlertCircle size={14} /> Отменены · {cancelled.length}</h3>
          <div className="space-y-2 opacity-60">{cancelled.map((o) => <Row key={o.id} o={o} />)}</div>
        </section>
      )}
    </div>
  )
}

/* ───────── Клиенты ───────── */
const CLIENT_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активен', color: C.fern },
  inactive: { label: 'Неактивен', color: C.stone },
  blocked: { label: 'Заблокирован', color: '#9a3346' },
}
function ClientStatusChip({ status }: { status?: string | null }) {
  const s = CLIENT_STATUS[status || ''] || { label: status || '—', color: C.stone }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: s.color + '1A', color: s.color }}>
      {s.label}
    </span>
  )
}

function ClientsView({ clients }: { clients: any[] }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const filtered = term
    ? clients.filter((c) =>
        [c.name, c.phone, c.company_name].some((v) => String(v || '').toLowerCase().includes(term)))
    : clients

  const Th = ({ children, right }: any) => (
    <th className={'whitespace-nowrap px-3 py-2 text-xs font-semibold ' + (right ? 'text-right' : 'text-left')} style={{ color: C.stone }}>{children}</th>
  )
  const Td = ({ children, right, muted }: any) => (
    <td className={'whitespace-nowrap px-3 py-2 text-sm ' + (right ? 'text-right' : 'text-left')} style={{ color: muted ? C.stone : C.ink }}>{children}</td>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#fff', border: '1px solid ' + C.line }}>
        <div className="flex items-center gap-1.5 rounded-lg px-2 py-1" style={{ background: C.bg }}>
          <Search size={14} style={{ color: C.stone }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: имя, телефон, компания"
            className="bg-transparent text-sm outline-none" style={{ width: 220 }} />
        </div>
        <span className="text-xs" style={{ color: C.stone }}>Всего: {filtered.length}</span>
      </div>

      <div className="overflow-x-auto rounded-xl" style={{ background: '#fff', border: '1px solid ' + C.line }}>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid ' + C.line, background: C.bg }}>
              <Th>Имя</Th>
              <Th>Телефон</Th>
              <Th>Компания</Th>
              <Th>БИН</Th>
              <Th>Город</Th>
              <Th right>Лимит</Th>
              <Th>Статус</Th>
              <Th>Регистрация</Th>
              <Th right>Заказов</Th>
              <Th right>Сумма</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid ' + C.line }}>
                <Td>{c.name || '—'}</Td>
                <Td muted>{c.phone || '—'}</Td>
                <Td>{c.company_name ? <span className="inline-flex items-center gap-1"><Building2 size={12} style={{ color: C.wine }} />{c.company_name}</span> : <span style={{ color: C.stone }}>—</span>}</Td>
                <Td muted>{c.bin || '—'}</Td>
                <Td muted>{c.city || '—'}</Td>
                <Td right muted>{c.credit_limit ? fmtKZT(Number(c.credit_limit)) : '—'}</Td>
                <Td><ClientStatusChip status={c.status} /></Td>
                <Td muted>{fmtDate(c.created_at)}</Td>
                <Td right>{c.order_count}</Td>
                <Td right>{c.order_sum ? fmtKZT(c.order_sum) : '—'}</Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: C.stone }}>Клиенты не найдены</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ───────── Деталь заказа ───────── */
function OrderDetail({ order, busy, ask, onStatus, onPaid, onSaveItems, onPrint }: any) {
  const [draft, setDraft] = useState<any[]>(order.items || [])
  useEffect(() => { setDraft(order.items || []) }, [order.id, order.items])

  const dur = stageDurations(order)
  const inPipeline = stageIndex(order.status) >= 0
  const isLast = order.status === 'delivered'
  const isCancelled = order.status === 'cancelled'
  const nextStage = inPipeline && !isLast ? STAGES[stageIndex(order.status) + 1] : null
  const legal = orderIsLegal(order)
  const info = payInfo(order.payment_method)
  const unpaid = order.payment_status !== 'paid'
  const canEditItems = EDITABLE.has(order.status)

  const draftTotal = goodsTotal(draft)
  const savedTotal = goodsTotal(order.items || [])
  const dirty = JSON.stringify(draft.map((d) => [d.id, d.qty])) !== JSON.stringify((order.items || []).map((d: any) => [d.id, d.qty]))
  const deliveryCost = order.fulfillment_type === 'delivery' ? Number(order.delivery_cost) || 0 : 0
  const editItem = (iid: number, sign: number) => setDraft((p) => p.map((it) =>
    it.id === iid ? { ...it, qty: Math.max(itemPack(it), Number(it.qty) + sign * itemPack(it)) } : it))

  const confirmAdvance = () => {
    const to = order.status === 'pending' ? 'reserved' : nextStage?.key
    if (!to) return
    ask({
      title: order.status === 'pending' ? 'Взять заказ в работу?' : 'Перевести заказ?',
      message: '#' + order.id + ': ' + statusMeta(order.status).label + ' → ' + statusMeta(to).label + '.',
      label: order.status === 'pending' ? 'Взять' : 'Перевести', color: C.wine,
      onConfirm: () => onStatus(to),
    })
  }
  const confirmPaid = () => ask({
    title: 'Подтвердить оплату?',
    message: '#' + order.id + ' на ' + fmtKZT(Number(order.total)) + ' — отметить как оплачен.',
    label: 'Подтвердить оплату', color: C.fern, onConfirm: onPaid,
  })
  const confirmSave = () => ask({
    title: 'Сохранить правки состава?',
    message: 'Новая сумма товаров: ' + fmtKZT(draftTotal) + ' (было ' + fmtKZT(savedTotal) + ').',
    label: 'Сохранить', color: C.wine,
    onConfirm: () => onSaveItems(draft.map((d) => ({ id: d.id, qty: d.qty }))),
  })
  const confirmCancel = () => ask({
    title: 'Отменить заказ?',
    message: '#' + order.id + ' будет отменён, резервы освободятся.' + (!unpaid ? ' Заказ оплачен — потребуется возврат.' : ''),
    label: 'Отменить заказ', color: '#9a3346', onConfirm: () => onStatus('cancelled'),
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: C.line }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold" style={{ color: C.wine }}>Заказ #{order.id}</span>
            <EntityBadge company={legal} />
          </div>
          <div className="text-xs" style={{ color: C.stone }}>
            {clientLabel(order)}
            {order.operator_name && <> · <span style={{ color: C.fern }}>ведёт {order.operator_name}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPrint} title="Лист сборки (печать)" className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold" style={{ background: C.blush, color: C.wine }}>
            <Printer size={14} /> Печать
          </button>
          <StageChip k={order.status} big />
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Оплата */}
        <div className="rounded-xl px-3 py-3" style={{ background: C.blush }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <info.Icon size={15} style={{ color: C.wine }} /><span className="font-medium">{info.label}</span>
              <PayBadge status={order.payment_status} />
            </div>
            {!isCancelled && unpaid && info.confirm === 'manual' && (
              <button onClick={confirmPaid} disabled={busy} className="rounded-lg px-3 py-1 text-xs font-semibold text-white" style={{ background: C.fern }}>Подтвердить оплату</button>
            )}
          </div>
          {unpaid && legal && order.payment_method === 'invoice' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: C.amber }}>
              <Receipt size={12} /> Счёт выставлен — ждём поступление. Подтверждать вручную по выписке.
            </div>
          )}
          {unpaid && info.confirm === 'auto' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: C.blue }}>
              <CheckCircle2 size={12} /> {info.label}: подтвердится автоматически, руками отмечать не нужно.
            </div>
          )}
          {!unpaid && <div className="mt-1 text-xs" style={{ color: C.stone }}>Оплачено {fmtDateTime(order.paid_at)}</div>}
        </div>

        {/* Доставка / выдача */}
        <FulfillmentBlock order={order} />

        {/* Фото сборки */}
        {order.assembly_photo_url && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Camera size={14} /> Фото сборки</h4>
            <a href={order.assembly_photo_url} target="_blank" rel="noreferrer" className="block">
              <img src={order.assembly_photo_url} alt="Фото сборки" className="max-h-48 rounded-lg" style={{ border: '1px solid ' + C.line }} />
            </a>
          </div>
        )}

        {/* Позиции */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Позиции {canEditItems && <span className="font-normal" style={{ color: C.stone }}>· можно скорректировать</span>}</h4>
          </div>
          <div className="space-y-2">
            {draft.map((it) => {
              const orig = (order.items || []).find((x: any) => x.id === it.id)
              const changed = orig && orig.qty !== it.qty
              return (
                <div key={it.id} className={'flex items-center justify-between rounded-lg px-3 py-2 ' + (it.is_removed ? 'line-through opacity-40' : '')} style={{ border: '1px solid ' + (changed ? C.amber + '66' : C.line) }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm">{itemName(it)}{it.color ? ` (${it.color})` : ''}</div>
                    <div className="text-xs" style={{ color: C.stone }}>
                      {fmtKZT(Number(it.price))} · шаг {itemPack(it)}{changed && <span style={{ color: C.amber }}> · оформлено {orig.qty}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditItems && !it.is_removed ? (
                      <>
                        <button onClick={() => editItem(it.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: C.blush, color: C.wine }}><Minus size={14} /></button>
                        <span className="w-10 text-center text-sm font-semibold">{it.qty}</span>
                        <button onClick={() => editItem(it.id, +1)} className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: C.blush, color: C.wine }}><Plus size={14} /></button>
                      </>
                    ) : <span className="w-12 text-center text-sm font-semibold">{order.status === 'assembled' || order.status === 'delivered' ? (it.qty_actual ?? it.qty) : it.qty}</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 space-y-1 border-t pt-2 text-sm" style={{ borderColor: C.line }}>
            <div className="flex justify-between" style={{ color: C.stone }}>
              <span>Товары</span>
              <span>{dirty && <span className="mr-1 line-through" style={{ color: '#B6AEB1' }}>{fmtKZT(savedTotal)}</span>}{fmtKZT(draftTotal)}</span>
            </div>
            {deliveryCost > 0 && (
              <div className="flex justify-between" style={{ color: C.stone }}><span>Доставка</span><span>{fmtKZT(deliveryCost)}</span></div>
            )}
            <div className="flex justify-between font-bold">
              <span>К оплате</span>
              <span style={{ color: C.wine }}>{fmtKZT(draftTotal + deliveryCost)}</span>
            </div>
          </div>
          {dirty && canEditItems && (
            <button onClick={confirmSave} disabled={busy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: C.wine }}>
              <Save size={14} /> Сохранить правки состава
            </button>
          )}
        </div>

        {/* Хронология */}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Хронология</h4>
          <div className="space-y-0">
            {(order.history || []).map((ev: any, i: number) => {
              const isEdit = ev.status_from === ev.status_to
              const s = statusMeta(ev.status_to)
              return (
                <div key={ev.id || i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full" style={{ background: isEdit ? C.amber : s.color }} />
                    {i < (order.history.length - 1) && <div className="w-px flex-1" style={{ background: C.line }} />}
                  </div>
                  <div className="pb-3">
                    <div className="text-sm font-medium">
                      {isEdit ? (ev.note || 'Правка') : s.label}
                      {ev.changed_by_name && <span className="font-normal" style={{ color: C.fern }}> · {ev.changed_by_name}</span>}
                    </div>
                    <div className="text-xs" style={{ color: C.stone }}>
                      {fmtDateTime(ev.created_at)}{!isEdit && dur[ev.status_to] != null && <> · в стадии {fmtDur(dur[ev.status_to])}</>}
                    </div>
                  </div>
                </div>
              )
            })}
            {(!order.history || order.history.length === 0) && <div className="text-xs" style={{ color: C.stone }}>Истории пока нет</div>}
          </div>
        </div>
      </div>

      {!isLast && !isCancelled && (
        <div className="border-t px-5 py-3" style={{ borderColor: C.line }}>
          {legal && unpaid && stageIndex(order.status) >= stageIndex('confirmed') && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs" style={{ background: '#FBF1E3', color: C.amber }}>
              <AlertCircle size={12} /> Юрлицо: рекомендуется собирать после поступления оплаты.
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={confirmCancel} disabled={busy} title="Отменить заказ" className="flex items-center justify-center rounded-xl px-3 py-3" style={{ background: C.blush, color: '#9a3346' }}>
              <X size={16} />
            </button>
            {inPipeline && nextStage && (
              <button onClick={confirmAdvance} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white" style={{ background: C.wine }}>
                {order.status === 'pending' ? 'Взять в работу' : 'Перевести → ' + nextStage.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FulfillmentBlock({ order }: { order: any }) {
  const ft = order.fulfillment_type || 'pickup'
  const Line = ({ Icon, label, value }: any) => value ? (
    <div className="flex items-start gap-2 py-0.5 text-sm">
      <Icon size={13} className="mt-0.5 shrink-0" style={{ color: C.wine }} />
      <span><span style={{ color: C.stone }}>{label}: </span>{value}</span>
    </div>
  ) : null
  const m = fulfillmentMeta(order)
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><m.Icon size={14} /> {m.label}</h4>
      <div className="rounded-lg px-3 py-2" style={{ border: '1px solid ' + C.line }}>
        {ft === 'delivery' ? (
          <>
            <Line Icon={MapPin} label="Адрес" value={[order.delivery_city, order.delivery_address].filter(Boolean).join(', ')} />
            <Line Icon={Calendar} label="Дата" value={order.delivery_date} />
            <Line Icon={User} label="Получатель" value={order.recipient_name} />
            <Line Icon={Phone} label="Тел. получателя" value={order.recipient_phone} />
            <Line Icon={Truck} label="Водитель" value={[order.driver_name, order.driver_car_plate].filter(Boolean).join(' · ')} />
            <Line Icon={Phone} label="Тел. водителя" value={order.driver_phone} />
            <Line Icon={Wallet} label="Стоимость доставки" value={order.delivery_cost ? fmtKZT(Number(order.delivery_cost)) : null} />
            <Line Icon={FileText} label="Курьеру" value={order.courier_comment} />
          </>
        ) : (
          <div className="text-sm" style={{ color: C.stone }}>Клиент забирает со склада.</div>
        )}
        {order.notes && <div className="mt-1 text-xs" style={{ color: C.stone }}>Заметка: {order.notes}</div>}
      </div>
    </div>
  )
}
