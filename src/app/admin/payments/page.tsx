'use client'
/**
 * «Платежи» — READ-ONLY экран оплат с сайта (epay postlink). Источник — таблица
 * payments + поля, разложенные из raw_postlink. Никаких списать/вернуть/отменить.
 * Реестр банка /operations здесь НЕ участвует (нет кредов кабинета) — отдельная часть.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { authHeaders } from '@/lib/api-token'

const AMO_BASE = 'https://tropinvladislav1.amocrm.ru/leads/detail'
const PAGE_SIZE = 50

type OrderEmbed = {
  id: number
  status: string | null
  guest_name: string | null
  guest_phone: string | null
  amo_lead_id: number | null
  client: { name: string | null; phone: string | null; company_name: string | null } | null
} | null

type Payment = {
  id: string
  invoice_id: string
  order_id: number | null
  amount: number
  currency: string | null
  status: string | null
  card_mask: string | null
  card_type: string | null
  approval_code: string | null
  reference: string | null
  issuer: string | null
  reason: string | null
  reason_code: number | null
  payer_name: string | null
  payer_phone: string | null
  payer_email: string | null
  bank_datetime: string | null
  created_at: string
  paid_at: string | null
  order: OrderEmbed
}

type Summary = {
  accepted: number
  successCount: number
  failedCount: number
  createdCount: number
  avgCheck: number
}

type ApiData = { rows: Payment[]; total: number; page: number; pageSize: number; summary: Summary }

type DatePreset = '' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'
const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: 'last7', label: '7 дней' },
  { id: 'last30', label: '30 дней' },
  { id: 'custom', label: 'Период' },
]

const STATUS_TABS: { id: string; label: string }[] = [
  { id: '', label: 'Все' },
  { id: 'success', label: '✅ Успешно' },
  { id: 'failed', label: '❌ Отказ' },
  { id: 'created', label: '⏳ Создан' },
]

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  success: { bg: '#dcfce7', fg: '#166534', label: '✅ Успешно' },
  failed: { bg: '#fee2e2', fg: '#991b1b', label: '❌ Отказ' },
  created: { bg: '#fef9c3', fg: '#854d0e', label: '⏳ Создан' },
}

const fmtTenge = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`
const fmtDt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Oral',
      })
    : '—'

function clientLabel(p: Payment): string {
  const o = p.order
  const name = o?.client?.name ?? o?.guest_name ?? p.payer_name ?? null
  const company = o?.client?.company_name ?? null
  const phone = o?.client?.phone ?? o?.guest_phone ?? p.payer_phone ?? null
  const main = company && name ? `${company} / ${name}` : company || name
  return main || phone || '—'
}

function StatusBadge({ status }: { status: string | null }) {
  const s = STATUS_BADGE[status ?? ''] ?? { bg: '#f3f4f6', fg: '#374151', label: status ?? '—' }
  return (
    <span style={{ background: s.bg, color: s.fg }} className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap">
      {s.label}
    </span>
  )
}

function cardLabel(p: Payment): string {
  if (!p.card_mask && !p.card_type) return '—'
  return [p.card_type, p.card_mask].filter(Boolean).join(' ')
}

// presets → {from,to} (YYYY-MM-DD, граница дня по локали)
function presetRange(preset: DatePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const fmt = (d: Date) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const D = 86_400_000
  if (preset === 'today') return { from: fmt(todayStart), to: fmt(todayStart) }
  if (preset === 'yesterday') { const y = new Date(todayStart.getTime() - D); return { from: fmt(y), to: fmt(y) } }
  if (preset === 'last7') return { from: fmt(new Date(todayStart.getTime() - 6 * D)), to: fmt(todayStart) }
  if (preset === 'last30') return { from: fmt(new Date(todayStart.getTime() - 29 * D)), to: fmt(todayStart) }
  if (preset === 'custom') return { from: customFrom, to: customTo }
  return { from: '', to: '' }
}

function SummaryCards({ s }: { s: Summary }) {
  const cards = [
    { label: 'Принято (за период)', value: fmtTenge(s.accepted), hint: 'только успешные оплаты' },
    { label: 'Успешных', value: String(s.successCount), hint: 'status = success' },
    { label: 'Неуспешных', value: String(s.failedCount), hint: 'отказы банка' },
    { label: 'Средний чек', value: s.successCount ? fmtTenge(s.avgCheck) : '—', hint: 'принято / успешных' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{c.label}</div>
          <div className="text-lg font-bold text-[#7a1c2e]">{c.value}</div>
          <div className="text-[11px] text-gray-400">{c.hint}</div>
        </div>
      ))}
    </div>
  )
}

function DetailModal({ p, onClose }: { p: Payment; onClose: () => void }) {
  const amoId = p.order?.amo_lead_id ?? null
  const Field = ({ label, value }: { label: string; value: string | number | null }) => (
    <div className="flex justify-between gap-4 py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 text-right break-all">{value || '—'}</span>
    </div>
  )
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Платёж · invoice {p.invoice_id}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 text-sm space-y-0.5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xl font-bold text-[#7a1c2e]">{fmtTenge(Number(p.amount))}</span>
            <StatusBadge status={p.status} />
          </div>
          <Field label="Invoice" value={p.invoice_id} />
          <Field label="Заказ" value={p.order_id ? `#${p.order_id}` : '—'} />
          <Field label="Валюта" value={p.currency} />
          <Field label="Карта" value={cardLabel(p)} />
          <Field label="Банк-эмитент" value={p.issuer} />
          <Field label="Код авторизации" value={p.approval_code} />
          <Field label="Reference" value={p.reference} />
          <Field label="Код ответа банка" value={p.reason_code != null ? String(p.reason_code) : '—'} />
          {p.reason && <Field label="Причина отказа" value={p.reason} />}
          <Field label="Плательщик" value={p.payer_name} />
          <Field label="Тел. плательщика" value={p.payer_phone} />
          <Field label="E-mail плательщика" value={p.payer_email} />
          <Field label="Создан" value={fmtDt(p.created_at)} />
          <Field label="Оплачен" value={fmtDt(p.paid_at)} />
          <Field label="Время в банке" value={fmtDt(p.bank_datetime)} />
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          {p.order_id && (
            <a href={`/print/order/${p.order_id}`} target="_blank" rel="noreferrer"
              className="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200">
              🛒 Заказ #{p.order_id}
            </a>
          )}
          {amoId && (
            <a href={`${AMO_BASE}/${amoId}`} target="_blank" rel="noreferrer"
              className="px-3 py-1.5 text-sm rounded text-white" style={{ background: '#7a1c2e' }}>
              🔗 Сделка amoCRM
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PaymentsPage() {
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()

  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<Payment | null>(null)

  // фильтры
  const [datePreset, setDatePreset] = useState<DatePreset>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (isAuthed === false) router.replace('/admin')
  }, [isAuthed])

  const range = useMemo(() => presetRange(datePreset, customFrom, customTo), [datePreset, customFrom, customTo])

  useEffect(() => { setPage(0) }, [datePreset, customFrom, customTo, status, q])

  useEffect(() => {
    if (!isAuthed) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const params = new URLSearchParams()
        if (range.from) params.set('from', range.from)
        if (range.to) params.set('to', range.to)
        if (status) params.set('status', status)
        if (q.trim()) params.set('q', q.trim())
        params.set('page', String(page))
        params.set('pageSize', String(PAGE_SIZE))
        const res = await fetch(`/api/admin/payments?${params}`, { headers: await authHeaders() })
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
  }, [isAuthed, range.from, range.to, status, q, page])

  if (!isAuthed || (role !== 'admin' && role !== 'manager')) {
    return <div className="p-10 text-gray-500">Нет доступа</div>
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-xs text-gray-500 cursor-pointer">← Админка</button>
        <h1 className="text-lg font-bold m-0">💳 Платежи</h1>
        <span className="text-xs text-gray-400">read-only · оплаты с сайта (epay)</span>
      </div>

      {err && <div className="mb-3 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{err}</div>}

      {data && <SummaryCards s={data.summary} />}

      {/* ── Фильтры ── */}
      <div className="space-y-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 mb-4">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Период</span>
          {DATE_PRESETS.map(p => (
            <button key={p.id}
              onClick={() => setDatePreset(prev => prev === p.id ? '' : p.id)}
              className="px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
              style={{
                background: datePreset === p.id ? '#7a1c2e' : '#fff',
                color: datePreset === p.id ? '#fff' : '#555',
                borderColor: datePreset === p.id ? '#7a1c2e' : '#e5e7eb',
              }}>{p.label}</button>
          ))}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 mt-1 w-full pl-[72px]">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border rounded px-2 py-1 text-xs" />
              <span className="text-gray-400 text-xs">—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border rounded px-2 py-1 text-xs" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Статус</span>
          {STATUS_TABS.map(s => (
            <button key={s.id}
              onClick={() => setStatus(s.id)}
              className="px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
              style={{
                background: status === s.id ? '#7a1c2e' : '#fff',
                color: status === s.id ? '#fff' : '#555',
                borderColor: status === s.id ? '#7a1c2e' : '#e5e7eb',
              }}>{s.label}</button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Поиск</span>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="🔍 № заказа / invoice / клиент / телефон…"
            className="flex-1 min-w-[180px] px-3 py-1.5 border border-gray-300 rounded text-sm outline-none" />
        </div>
      </div>

      {/* ── Таблица ── */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white">
        <table className="w-full text-sm border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400 text-left">
              <th className="px-3 py-2 font-semibold">Дата</th>
              <th className="px-3 py-2 font-semibold">Invoice</th>
              <th className="px-3 py-2 font-semibold">Заказ</th>
              <th className="px-3 py-2 font-semibold">Клиент</th>
              <th className="px-3 py-2 font-semibold text-right">Сумма</th>
              <th className="px-3 py-2 font-semibold">Карта</th>
              <th className="px-3 py-2 font-semibold text-center">Статус</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map(p => (
              <tr key={p.id} onClick={() => setDetail(p)}
                className="border-t border-gray-100 hover:bg-amber-50 cursor-pointer">
                <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{fmtDt(p.created_at)}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{p.invoice_id}</td>
                <td className="px-3 py-1.5">
                  {p.order_id
                    ? <a href={`/print/order/${p.order_id}`} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">#{p.order_id} ↗</a>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-1.5 text-gray-700 max-w-[220px] truncate">{clientLabel(p)}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{fmtTenge(Number(p.amount))}</td>
                <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{cardLabel(p)}</td>
                <td className="px-3 py-1.5 text-center"><StatusBadge status={p.status} /></td>
              </tr>
            ))}
            {!loading && (data?.rows.length ?? 0) === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Платежей не найдено</td></tr>
            )}
            {loading && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Загрузка…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Пагинация ── */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-500">{data ? `${data.total} платежей` : ''}</span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 rounded border border-gray-200 text-sm disabled:opacity-40 cursor-pointer bg-white">←</button>
            <span className="text-sm text-gray-600">{page + 1} / {pages}</span>
            <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 rounded border border-gray-200 text-sm disabled:opacity-40 cursor-pointer bg-white">→</button>
          </div>
        )}
      </div>

      {detail && <DetailModal p={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
