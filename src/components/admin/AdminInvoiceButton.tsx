'use client'

// Счёт в админке заказа: сформировать/скачать PDF + ручное подтверждение оплаты.
// Один заказ = один счёт. Тот же роут, что и клиентская развилка.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/api-token'

type Inv = { invoice_number: number; status: string; paid_source: string | null; pdf_url: string | null }

export default function AdminInvoiceButton({ orderId }: { orderId: number | string }) {
  const [inv, setInv] = useState<Inv | null | undefined>(undefined) // undefined = грузим
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    try {
      const r = await fetch(`/api/orders/${orderId}/invoice`, { headers: await authHeaders() })
      const d = await r.json()
      if (d?.ok && d.invoice) { setInv(d.invoice); setUrl(d.downloadUrl ?? null) } else setInv(null)
    } catch { setInv(null) }
  }
  useEffect(() => { load() }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function form() {
    setBusy(true); setMsg(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const r = await fetch(`/api/orders/${orderId}/invoice`, { method: 'POST', headers, body: JSON.stringify({ withPdf: true }) })
      const d = await r.json()
      if (d?.ok) {
        setInv(d.invoice); setUrl(d.downloadUrl)
        if (d.downloadUrl) window.open(d.downloadUrl, '_blank', 'noopener')
      } else if (d?.reason === 'NO_BIN') setMsg('Не заполнен БИН клиента (12 цифр)')
      else setMsg(d?.message ?? 'Ошибка формирования счёта')
    } catch { setMsg('Сеть недоступна') } finally { setBusy(false) }
  }

  async function markPaid() {
    setBusy(true); setMsg(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const r = await fetch(`/api/orders/${orderId}/invoice`, { method: 'PATCH', headers, body: JSON.stringify({ action: 'mark-paid' }) })
      const d = await r.json()
      if (d?.ok) { setInv(d.invoice); setMsg(d.alreadyPaid ? 'Счёт уже был оплачен' : 'Отмечен оплаченным') }
      else setMsg(d?.error ?? d?.message ?? 'Ошибка')
    } catch { setMsg('Сеть недоступна') } finally { setBusy(false) }
  }

  if (inv === undefined) return <span className="text-xs text-gray-400">счёт…</span>

  const isPaid = inv?.status === 'paid'

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      {!inv && (
        <button onClick={form} disabled={busy}
          className="px-3 py-1.5 bg-slate-700 text-white text-sm rounded hover:bg-slate-800 disabled:opacity-50">
          {busy ? 'Формируем…' : '📄 Сформировать счёт'}
        </button>
      )}

      {inv && (
        <>
          {url
            ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 underline">📄 Счёт № {inv.invoice_number} (PDF)</a>
            : <button onClick={form} disabled={busy} className="text-sm text-blue-700 underline">📄 Счёт № {inv.invoice_number}</button>}

          {isPaid ? (
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
              ✓ Оплачен{inv.paid_source === 'manual' ? ' (вручную)' : inv.paid_source === 'onlineduken_api' ? ' (OnlineDuken)' : ''}
            </span>
          ) : (
            <button onClick={markPaid} disabled={busy}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50">
              {busy ? '…' : '💰 Отметить оплаченным'}
            </button>
          )}
        </>
      )}

      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </span>
  )
}
