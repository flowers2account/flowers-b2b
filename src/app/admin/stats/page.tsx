'use client'
/**
 * «Статистика» (/admin/stats) — READ-ONLY экран для владельца. Три блока за период:
 * воронка заказов, оплаты (с failed rate), топ товаров/клиентов. Стиль — Rosewood,
 * как /admin/payments. Никаких действий, только просмотр. Считает из Supabase через
 * GET /api/admin/stats?from&to (Asia/Oral), под админ-авторизацией.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { authHeaders } from '@/lib/api-token'

const ACCENT = '#7a1c2e'

type Funnel = {
  created: number; paid: number; assembled: number; delivered: number
  paidPct: number; assembledPct: number; deliveredPct: number
}
type Payments = {
  totalAttempts: number; successCount: number; failedCount: number; createdCount: number
  successSum: number; failedSum: number; createdSum: number
  successRate: number; failedRate: number
}
type TopProduct = { name: string; orders: number; qty: number }
type TopClient = { label: string; phone: string | null; total: number; count: number }
type ApiData = {
  range: { from: string; to: string }
  funnel: Funnel
  payments: Payments
  topProducts: TopProduct[]
  topClients: TopClient[]
}

type DatePreset = 'today' | 'last7' | 'last30' | 'custom'
const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'last7', label: '7 дней' },
  { id: 'last30', label: '30 дней' },
  { id: 'custom', label: 'Период' },
]

const fmtTenge = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`
const fmtPct = (n: number) => `${n.toLocaleString('ru-RU')}%`

function presetRange(preset: DatePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const D = 86_400_000
  if (preset === 'today') return { from: fmt(todayStart), to: fmt(todayStart) }
  if (preset === 'last7') return { from: fmt(new Date(todayStart.getTime() - 6 * D)), to: fmt(todayStart) }
  if (preset === 'last30') return { from: fmt(new Date(todayStart.getTime() - 29 * D)), to: fmt(todayStart) }
  if (preset === 'custom') return { from: customFrom, to: customTo }
  return { from: '', to: '' }
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-bold text-gray-800 m-0">{title}</h2>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Воронка: 4 этапа, число + % перехода от предыдущего ──
function FunnelBlock({ f }: { f: Funnel }) {
  const stages = [
    { label: 'Создано', value: f.created, pct: null as number | null, hint: 'все заказы периода' },
    { label: 'Оплачено', value: f.paid, pct: f.paidPct, hint: 'payment_status = paid' },
    { label: 'Собрано', value: f.assembled, pct: f.assembledPct, hint: 'assembled + delivered' },
    { label: 'Выдано', value: f.delivered, pct: f.deliveredPct, hint: 'delivered' },
  ]
  const max = Math.max(1, f.created)
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <div className="w-20 text-xs text-gray-500 shrink-0">{s.label}</div>
          <div className="flex-1 bg-gray-100 rounded h-8 relative overflow-hidden">
            <div className="h-full rounded transition-all"
              style={{ width: `${Math.round((s.value / max) * 100)}%`, background: ACCENT, minWidth: s.value ? 2 : 0 }} />
            <div className="absolute inset-0 flex items-center px-3 gap-2">
              <span className="text-sm font-bold text-gray-800">{s.value.toLocaleString('ru-RU')}</span>
              <span className="text-[11px] text-gray-400">{s.hint}</span>
            </div>
          </div>
          <div className="w-24 text-right shrink-0">
            {i === 0
              ? <span className="text-[11px] text-gray-300">старт</span>
              : <span className="text-xs font-semibold" style={{ color: ACCENT }}>
                  → {fmtPct(s.pct ?? 0)}
                </span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function MiniCard({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="bg-white border rounded-lg p-3" style={{ borderColor: danger ? '#fecaca' : '#e5e7eb' }}>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{label}</div>
      <div className="text-lg font-bold" style={{ color: danger ? '#991b1b' : ACCENT }}>{value}</div>
      {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
    </div>
  )
}

function PaymentsBlock({ p }: { p: Payments }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniCard label="Успешных" value={String(p.successCount)} hint={fmtTenge(p.successSum)} />
        <MiniCard label="Неуспешных" value={String(p.failedCount)} hint={fmtTenge(p.failedSum)} danger />
        <MiniCard label="Создан (не завершён)" value={String(p.createdCount)} hint={fmtTenge(p.createdSum)} />
        <MiniCard label="Всего попыток" value={String(p.totalAttempts)} hint="success + failed + created" />
      </div>
      {/* Ключевые метрики: % успешных и failed rate (выделен) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-green-700/70 mb-1">% успешных</div>
          <div className="text-2xl font-bold text-green-700">{fmtPct(p.successRate)}</div>
          <div className="text-[11px] text-green-700/60">success / все попытки</div>
        </div>
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-red-700/70 mb-1">⚠️ Failed rate</div>
          <div className="text-2xl font-bold text-red-700">{fmtPct(p.failedRate)}</div>
          <div className="text-[11px] text-red-700/60">failed / все попытки — следить</div>
        </div>
      </div>
    </div>
  )
}

function TopProductsBlock({ rows }: { rows: TopProduct[] }) {
  if (!rows.length) return <div className="text-sm text-gray-400 py-4 text-center">Нет данных за период</div>
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-gray-400 text-left">
          <th className="px-2 py-1.5 font-semibold w-8">#</th>
          <th className="px-2 py-1.5 font-semibold">Товар</th>
          <th className="px-2 py-1.5 font-semibold text-right">Заказов</th>
          <th className="px-2 py-1.5 font-semibold text-right">Штук</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.name} className="border-t border-gray-100">
            <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
            <td className="px-2 py-1.5 text-gray-800">{r.name}</td>
            <td className="px-2 py-1.5 text-right font-semibold" style={{ color: ACCENT }}>{r.orders}</td>
            <td className="px-2 py-1.5 text-right text-gray-600">{r.qty.toLocaleString('ru-RU')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TopClientsBlock({ rows }: { rows: TopClient[] }) {
  if (!rows.length) return <div className="text-sm text-gray-400 py-4 text-center">Нет данных за период</div>
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-gray-400 text-left">
          <th className="px-2 py-1.5 font-semibold w-8">#</th>
          <th className="px-2 py-1.5 font-semibold">Клиент</th>
          <th className="px-2 py-1.5 font-semibold text-right">Заказов</th>
          <th className="px-2 py-1.5 font-semibold text-right">Сумма</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.label}-${i}`} className="border-t border-gray-100">
            <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
            <td className="px-2 py-1.5 text-gray-800">
              {r.label}
              {r.phone && <span className="text-gray-400 text-xs ml-1">{r.phone}</span>}
            </td>
            <td className="px-2 py-1.5 text-right text-gray-600">{r.count}</td>
            <td className="px-2 py-1.5 text-right font-semibold" style={{ color: ACCENT }}>{fmtTenge(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function StatsPage() {
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()

  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [datePreset, setDatePreset] = useState<DatePreset>('last7')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => { init() }, [])
  useEffect(() => { if (isAuthed === false) router.replace('/admin') }, [isAuthed])

  const range = useMemo(() => presetRange(datePreset, customFrom, customTo), [datePreset, customFrom, customTo])

  useEffect(() => {
    if (!isAuthed) return
    if (datePreset === 'custom' && (!customFrom || !customTo)) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const params = new URLSearchParams()
        if (range.from) params.set('from', range.from)
        if (range.to) params.set('to', range.to)
        const res = await fetch(`/api/admin/stats?${params}`, { headers: await authHeaders() })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) { setErr(json.error ?? `HTTP ${res.status}`); return }
        setData(json)
      } catch (e) {
        if (!cancelled) setErr(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isAuthed, range.from, range.to, datePreset])

  if (!isAuthed || (role !== 'admin' && role !== 'manager')) {
    return <div className="p-10 text-gray-500">Нет доступа</div>
  }

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-xs text-gray-500 cursor-pointer">← Админка</button>
        <h1 className="text-lg font-bold m-0">📊 Статистика</h1>
        <span className="text-xs text-gray-400">read-only · считается из базы</span>
      </div>

      {err && <div className="mb-3 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{err}</div>}

      {/* ── Период ── */}
      <div className="flex flex-wrap gap-1.5 items-center px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 mb-4">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Период</span>
        {DATE_PRESETS.map(p => (
          <button key={p.id}
            onClick={() => setDatePreset(p.id)}
            className="px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
            style={{
              background: datePreset === p.id ? ACCENT : '#fff',
              color: datePreset === p.id ? '#fff' : '#555',
              borderColor: datePreset === p.id ? ACCENT : '#e5e7eb',
            }}>{p.label}</button>
        ))}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-1.5 mt-1 w-full pl-[72px]">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border rounded px-2 py-1 text-xs" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          </div>
        )}
        {data && (
          <span className="text-[11px] text-gray-400 ml-auto">
            {data.range.from} — {data.range.to}{loading ? ' · обновляю…' : ''}
          </span>
        )}
      </div>

      {!data && loading && <div className="text-gray-400 text-sm py-10 text-center">Загрузка…</div>}

      {data && (
        <>
          <Section title="1. Воронка заказов" hint="где отваливаются клиенты">
            <FunnelBlock f={data.funnel} />
          </Section>

          <Section title="2. Оплаты" hint="success / failed / created с сайта (epay)">
            <PaymentsBlock p={data.payments} />
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="3a. Топ-10 товаров" hint="по числу заказов">
              <TopProductsBlock rows={data.topProducts} />
            </Section>
            <Section title="3b. Топ-10 клиентов" hint="по сумме заказов">
              <TopClientsBlock rows={data.topClients} />
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
