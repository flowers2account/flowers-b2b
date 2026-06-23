'use client'
/**
 * Вкладка «Реестр банка» на /admin/payments. READ-ONLY.
 * Источник — payment_operations (наполняется кнопкой «Синхронизировать с банком»
 * → /api/admin/payments/sync, который тянет ePay /operations client_credentials-токеном).
 * Никаких charge/refund/cancel — только просмотр реестра.
 */
import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/api-token'

const AMO_BASE = 'https://tropinvladislav1.amocrm.ru/leads/detail'
const PAGE_SIZE = 50

type OrderEmbed = {
  id: number
  amo_lead_id: number | null
  guest_name: string | null
  client: { name: string | null; phone: string | null; company_name: string | null } | null
} | null

type Op = {
  id: string
  epay_operation_id: string
  invoice_id: string | null
  order_id: number | null
  status: string | null
  amount: number | null
  org_amount: number | null
  currency: string | null
  reference: string | null
  card_mask: string | null
  card_type: string | null
  issuer: string | null
  approval_code: string | null
  payer_name: string | null
  payer_phone: string | null
  payer_email: string | null
  created_date: string | null
  payout_date: string | null
  payout_amount: number | null
  source: string | null
  synced_at: string | null
  raw: unknown
  order: OrderEmbed
}

type Summary = {
  chargeSum: number
  refundSum: number
  chargeCount: number
  refundCount: number
  registryOnlyCount: number
}

type ApiData = { rows: Op[]; total: number; summary: Summary }

const TYPE_TABS = [
  { id: '', label: 'Все' },
  { id: 'CHARGE', label: 'CHARGE' },
  { id: 'REFUND', label: 'REFUND' },
  { id: 'CANCEL', label: 'CANCEL' },
]

const TYPE_BADGE: Record<string, { bg: string; fg: string }> = {
  CHARGE: { bg: '#dcfce7', fg: '#166534' },
  REFUND: { bg: '#fee2e2', fg: '#991b1b' },
  CANCEL: { bg: '#f3f4f6', fg: '#374151' },
}

const fmtTenge = (n: number | null) => `${Math.round(Number(n || 0)).toLocaleString('ru-RU')} ₸`
const fmtDt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Oral',
      })
    : '—'

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function TypeBadge({ status }: { status: string | null }) {
  const c = TYPE_BADGE[status ?? ''] ?? { bg: '#f3f4f6', fg: '#374151' }
  return (
    <span style={{ background: c.bg, color: c.fg }} className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap">
      {status ?? '—'}
    </span>
  )
}

function cardLabel(o: Op): string {
  if (!o.card_mask && !o.card_type) return '—'
  return [o.card_type, o.card_mask].filter(Boolean).join(' ')
}
function clientLabel(o: Op): string {
  const ord = o.order
  const name = ord?.client?.name ?? ord?.guest_name ?? o.payer_name ?? null
  const company = ord?.client?.company_name ?? null
  return (company && name ? `${company} / ${name}` : company || name) || '—'
}

function DetailModal({ o, onClose }: { o: Op; onClose: () => void }) {
  const amoId = o.order?.amo_lead_id ?? null
  const Field = ({ label, value }: { label: string; value: string | number | null }) => (
    <div className="flex justify-between gap-4 py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 text-right break-all">{value === null || value === '' ? '—' : value}</span>
    </div>
  )
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Операция · invoice {o.invoice_id ?? '—'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 text-sm space-y-0.5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xl font-bold text-[#7a1c2e]">{fmtTenge(o.amount)}</span>
            <TypeBadge status={o.status} />
          </div>
          <Field label="ID операции (банк)" value={o.epay_operation_id} />
          <Field label="Invoice" value={o.invoice_id} />
          <Field label="Заказ" value={o.order_id ? `#${o.order_id}` : 'мимо сайта (registry-only)'} />
          <Field label="Источник" value={o.order_id ? 'сайт' : 'реестр'} />
          <Field label="Сумма / ориг." value={`${fmtTenge(o.amount)} / ${fmtTenge(o.org_amount)}`} />
          <Field label="Валюта" value={o.currency} />
          <Field label="Карта" value={cardLabel(o)} />
          <Field label="Банк-эмитент" value={o.issuer} />
          <Field label="Код авторизации" value={o.approval_code} />
          <Field label="Reference" value={o.reference} />
          <Field label="Плательщик" value={o.payer_name} />
          <Field label="Тел. плательщика" value={o.payer_phone} />
          <Field label="E-mail плательщика" value={o.payer_email} />
          <Field label="Дата операции" value={fmtDt(o.created_date)} />
          <Field label="Выплата" value={o.payout_date ? `${fmtTenge(o.payout_amount)} · ${fmtDt(o.payout_date)}` : 'ожидает'} />
          <Field label="Синхронизировано" value={fmtDt(o.synced_at)} />
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          {o.order_id && (
            <a href={`/print/order/${o.order_id}`} target="_blank" rel="noreferrer"
              className="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200">
              🛒 Заказ #{o.order_id}
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

export default function PaymentsRegistry() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<Op | null>(null)

  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86_400_000)))
  const [to, setTo] = useState(() => ymd(new Date()))
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (status) p.set('status', status)
    if (q.trim()) p.set('q', q.trim())
    p.set('page', String(page))
    p.set('pageSize', String(PAGE_SIZE))
    return p.toString()
  }, [from, to, status, q, page])

  useEffect(() => { setPage(0) }, [from, to, status, q])

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/payments/operations?${params}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? `HTTP ${res.status}`); return }
      setData(json)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [params])

  async function runSync() {
    if (syncing) return
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/admin/payments/sync', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const json = await res.json()
      if (!res.ok) { setSyncMsg(`Ошибка: ${json.error ?? res.status}`); return }
      setSyncMsg(`Подтянуто ${json.fetched}, обновлено ${json.upserted} (с заказом ${json.matched}, мимо сайта ${json.registryOnly}).`)
      await load()
    } catch (e) {
      setSyncMsg(`Ошибка сети: ${e}`)
    } finally {
      setSyncing(false)
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div>
      {/* ── Шапка: синк + период ── */}
      <div className="flex flex-wrap items-end gap-3 mb-4 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Период (дата операции)</div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1 text-xs" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          </div>
        </div>
        <button onClick={runSync} disabled={syncing}
          className="px-4 py-2 text-sm font-medium rounded text-white disabled:opacity-50"
          style={{ background: '#7a1c2e' }}>
          {syncing ? 'Синхронизирую…' : '🔄 Синхронизировать с банком'}
        </button>
        {syncMsg && <span className="text-xs text-gray-600">{syncMsg}</span>}
      </div>

      {/* ── Сводка ── */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Σ CHARGE</div>
            <div className="text-lg font-bold text-[#166534]">{fmtTenge(data.summary.chargeSum)}</div>
            <div className="text-[11px] text-gray-400">{data.summary.chargeCount} операц.</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Σ REFUND</div>
            <div className="text-lg font-bold text-[#991b1b]">{fmtTenge(data.summary.refundSum)}</div>
            <div className="text-[11px] text-gray-400">{data.summary.refundCount} операц.</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Мимо сайта</div>
            <div className="text-lg font-bold text-[#7a1c2e]">{data.summary.registryOnlyCount}</div>
            <div className="text-[11px] text-gray-400">order_id NULL</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Всего в выборке</div>
            <div className="text-lg font-bold">{data.total}</div>
            <div className="text-[11px] text-gray-400">операций</div>
          </div>
        </div>
      )}

      {err && <div className="mb-3 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{err}</div>}

      {/* ── Фильтры ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {TYPE_TABS.map(t => (
          <button key={t.id} onClick={() => setStatus(t.id)}
            className="px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
            style={{
              background: status === t.id ? '#7a1c2e' : '#fff',
              color: status === t.id ? '#fff' : '#555',
              borderColor: status === t.id ? '#7a1c2e' : '#e5e7eb',
            }}>{t.label}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="🔍 invoice / заказ / reference / клиент…"
          className="flex-1 min-w-[180px] px-3 py-1.5 border border-gray-300 rounded text-sm outline-none" />
      </div>

      {/* ── Таблица ── */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white">
        <table className="w-full text-sm border-collapse min-w-[860px]">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400 text-left">
              <th className="px-3 py-2 font-semibold">Дата</th>
              <th className="px-3 py-2 font-semibold">Invoice</th>
              <th className="px-3 py-2 font-semibold">Заказ</th>
              <th className="px-3 py-2 font-semibold">Клиент</th>
              <th className="px-3 py-2 font-semibold text-right">Сумма</th>
              <th className="px-3 py-2 font-semibold text-center">Тип</th>
              <th className="px-3 py-2 font-semibold">Карта</th>
              <th className="px-3 py-2 font-semibold text-center">Выплата</th>
              <th className="px-3 py-2 font-semibold text-center">Источник</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map(o => (
              <tr key={o.id} onClick={() => setDetail(o)} className="border-t border-gray-100 hover:bg-amber-50 cursor-pointer">
                <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{fmtDt(o.created_date)}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{o.invoice_id ?? '—'}</td>
                <td className="px-3 py-1.5">
                  {o.order_id
                    ? <a href={`/print/order/${o.order_id}`} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">#{o.order_id} ↗</a>
                    : <span className="text-[11px] text-amber-700">мимо сайта</span>}
                </td>
                <td className="px-3 py-1.5 text-gray-700 max-w-[180px] truncate">{clientLabel(o)}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{fmtTenge(o.amount)}</td>
                <td className="px-3 py-1.5 text-center"><TypeBadge status={o.status} /></td>
                <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{cardLabel(o)}</td>
                <td className="px-3 py-1.5 text-center text-xs">
                  {o.payout_date
                    ? <span className="text-green-700">выплачено</span>
                    : <span className="text-gray-400">ожидает</span>}
                </td>
                <td className="px-3 py-1.5 text-center text-xs">
                  {o.order_id
                    ? <span className="text-gray-600">сайт</span>
                    : <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">реестр</span>}
                </td>
              </tr>
            ))}
            {!loading && (data?.rows.length ?? 0) === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                Реестр пуст за выбранный период. Нажмите «Синхронизировать с банком».
              </td></tr>
            )}
            {loading && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Загрузка…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Пагинация ── */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-500">{data ? `${data.total} операций` : ''}</span>
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

      {detail && <DetailModal o={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
