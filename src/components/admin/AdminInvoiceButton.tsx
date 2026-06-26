'use client'

// Кнопка «Сформировать счёт» для админки заказа: создаёт/отдаёт счёт (один заказ = один счёт)
// и открывает PDF. Нет БИН → подсказка заполнить. Тот же роут, что и клиентская развилка.
import { useState } from 'react'
import { authHeaders } from '@/lib/api-token'

export default function AdminInvoiceButton({ orderId }: { orderId: number | string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  async function run() {
    setBusy(true); setMsg(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const r = await fetch(`/api/orders/${orderId}/invoice`, {
        method: 'POST', headers, body: JSON.stringify({ withPdf: true }),
      })
      const data = await r.json()
      if (data?.ok) {
        setUrl(data.downloadUrl)
        if (data.downloadUrl) window.open(data.downloadUrl, '_blank', 'noopener')
        setMsg(`Счёт № ${data.invoice.invoice_number}`)
      } else if (data?.reason === 'NO_BIN') {
        setMsg('Не заполнен БИН клиента (12 цифр)')
      } else {
        setMsg(data?.message ?? 'Ошибка формирования счёта')
      }
    } catch { setMsg('Сеть недоступна') } finally { setBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy}
        className="px-3 py-1.5 bg-slate-700 text-white text-sm rounded hover:bg-slate-800 disabled:opacity-50">
        {busy ? 'Формируем…' : '📄 Сформировать счёт'}
      </button>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 underline">скачать PDF</a>}
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </span>
  )
}
