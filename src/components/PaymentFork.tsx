'use client'

// Развилка оплаты для юр. лица на неоплаченном заказе: QR Halyk (удобно) + Счёт на оплату (PDF).
// Блокировка: без реквизитов организации (company_name + БИН 12 цифр) счёт/QR не генерим —
// показываем форму ввода реквизитов; сохранение → clients (+ синк в amoCRM) → разблокировка.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { authHeaders } from '@/lib/api-token'
import { isValidBin, HALYK_QR_ENV } from '@/lib/halyk-qr'

type Invoice = { invoice_number: number; qr_link: string | null; pdf_url: string | null; amount: number }

const C = {
  border: '#E6DFD9', accent: '#8B3A5A', bg: '#fff', ink: '#1A1A1F', sub: '#7A7780', text: '#494950',
}

export default function PaymentFork({
  orderId, client,
}: {
  orderId: string | number
  client: { company_name?: string | null; bin?: string | null }
}) {
  // Текущие реквизиты (из заказа/клиента, обновляются после сохранения формы).
  const [reqs, setReqs] = useState({
    company_name: (client?.company_name ?? '').trim(),
    bin: (client?.bin ?? '').trim(),
  })
  const reqsOk = !!reqs.company_name && isValidBin(reqs.bin)

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [qrImg, setQrImg] = useState<string | null>(null)
  const [download, setDownload] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Гарантируем запись счёта (номер + qr_link) при показе развилки — чтобы QR нёс узнаваемый № 90xxxxx.
  // Только когда реквизиты заполнены (иначе генерация заблокирована формой ниже).
  useEffect(() => {
    if (!reqsOk) return
    let alive = true
    ;(async () => {
      try {
        const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
        const r = await fetch(`/api/orders/${orderId}/invoice`, {
          method: 'POST', headers, body: JSON.stringify({ withPdf: false }),
        })
        const data = await r.json()
        if (!alive) return
        if (data?.ok) { setInvoice(data.invoice); if (data.downloadUrl) setDownload(data.downloadUrl) }
        else setErr(data?.message ?? 'Не удалось подготовить счёт')
      } catch { if (alive) setErr('Сеть недоступна') }
    })()
    return () => { alive = false }
  }, [orderId, reqsOk])

  // QR картинка из qr_link
  useEffect(() => {
    let alive = true
    if (!invoice?.qr_link) { setQrImg(null); return }
    QRCode.toDataURL(invoice.qr_link, { width: 220, margin: 1 })
      .then(d => { if (alive) setQrImg(d) }).catch(() => { if (alive) setQrImg(null) })
    return () => { alive = false }
  }, [invoice?.qr_link])

  async function formInvoice() {
    setBusy(true); setErr(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const r = await fetch(`/api/orders/${orderId}/invoice`, {
        method: 'POST', headers, body: JSON.stringify({ withPdf: true }),
      })
      const data = await r.json()
      if (data?.ok) {
        setInvoice(data.invoice)
        setDownload(data.downloadUrl)
        if (data.downloadUrl) window.open(data.downloadUrl, '_blank', 'noopener')
      } else {
        setErr(data?.message ?? 'Не удалось сформировать счёт')
      }
    } catch { setErr('Сеть недоступна') } finally { setBusy(false) }
  }

  const wrap: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.bg }

  // Нет реквизитов организации → форма ввода (блокирует генерацию счёта/QR)
  if (!reqsOk) {
    return (
      <div style={wrap}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px', color: C.ink }}>
          Для счёта укажите реквизиты организации
        </h3>
        <p style={{ fontSize: 12.5, color: C.sub, margin: '0 0 12px', lineHeight: 1.5 }}>
          Нужны для счёта на оплату и QR (Halyk). Сохраним в вашем профиле — менять можно в личном кабинете.
        </p>
        <RequisitesForm
          initialCompany={reqs.company_name}
          initialBin={reqs.bin}
          onSaved={(company_name, bin) => setReqs({ company_name, bin })}
        />
      </div>
    )
  }

  return (
    <div style={wrap}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: C.ink }}>
        Способ оплаты{HALYK_QR_ENV === 'test' && ' · тест'}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── Вариант 1: Halyk QR (удобно) ── */}
        <div style={{ border: `1.5px solid ${C.accent}`, borderRadius: 10, padding: 14, position: 'relative' }}>
          <span style={{
            position: 'absolute', top: -10, left: 12, background: C.accent, color: '#fff',
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
          }}>Удобно</span>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, margin: '2px 0 10px' }}>
            Оплата через OnlineDuken · Halyk Bank
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {qrImg
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qrImg} alt="QR оплаты Halyk" width={180} height={180}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8 }} />
              : <div style={{ width: 180, height: 180, display: 'grid', placeItems: 'center',
                  border: `1px dashed ${C.border}`, borderRadius: 8, color: C.sub, fontSize: 12 }}>
                  {err ? 'QR недоступен' : 'Готовим QR…'}
                </div>}
            <ul style={{ flex: 1, minWidth: 180, margin: 0, padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, color: C.text }}>
              <li>⚡ мгновенно</li>
              <li>💰 0% комиссии</li>
              <li>✅ оплата подтверждается автоматически</li>
              <li>💳 для ИП возможна отсрочка платежа 7–30 дней</li>
            </ul>
          </div>
          <p style={{ fontSize: 12, color: C.sub, margin: '10px 0 0', lineHeight: 1.5 }}>
            Оплата со счёта организации через приложение Onlinebank (OnlineDuken · Halyk Bank).
            {invoice && <> Счёт № {invoice.invoice_number}.</>}
          </p>
        </div>

        {/* ── Вариант 2: Счёт на оплату (PDF) ── */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, margin: '0 0 8px' }}>
            Счёт на оплату
          </div>
          <p style={{ fontSize: 12.5, color: C.text, margin: '0 0 12px', lineHeight: 1.5 }}>
            PDF-счёт с реквизитами для перевода из любого банка. Подтверждение — после поступления оплаты.
          </p>
          {download
            ? <a href={download} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-block', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600,
                padding: '9px 16px', borderRadius: 8, textDecoration: 'none',
              }}>Скачать счёт (PDF){invoice ? ` № ${invoice.invoice_number}` : ''}</a>
            : <button onClick={formInvoice} disabled={busy} style={{
                background: busy ? '#B9889B' : C.accent, color: '#fff', fontSize: 13, fontWeight: 600,
                padding: '9px 16px', borderRadius: 8, border: 'none', cursor: busy ? 'default' : 'pointer',
              }}>{busy ? 'Формируем…' : 'Сформировать счёт'}</button>}
          {download && (
            <button onClick={formInvoice} disabled={busy} style={{
              marginLeft: 10, background: 'transparent', color: C.sub, fontSize: 12.5,
              border: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}>обновить</button>
          )}
        </div>

        {err && <p style={{ fontSize: 12.5, color: '#B0344F', margin: 0 }}>{err}</p>}
      </div>
    </div>
  )
}

// ── Форма реквизитов организации (company_name + БИН) ─────────────────────────
function RequisitesForm({
  initialCompany, initialBin, onSaved,
}: {
  initialCompany: string
  initialBin: string
  onSaved: (company_name: string, bin: string) => void
}) {
  const [company, setCompany] = useState(initialCompany)
  const [bin, setBin] = useState(initialBin)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    width: '100%', border: `1px solid ${C.border}`, borderRadius: 8,
    padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: C.sub, margin: '0 0 4px' }

  async function save() {
    const companyClean = company.trim()
    const binClean = bin.trim()
    if (!companyClean) { setError('Укажите название организации'); return }
    if (!/^\d{12}$/.test(binClean)) { setError('БИН/ИИН — ровно 12 цифр'); return }
    setSaving(true); setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const r = await fetch('/api/client/update-profile', {
        method: 'POST', headers, body: JSON.stringify({ company_name: companyClean, bin: binClean }),
      })
      const data = await r.json()
      if (data?.success) onSaved(companyClean, binClean)
      else setError(data?.error ?? 'Не удалось сохранить')
    } catch { setError('Сеть недоступна') } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={labelStyle}>Название организации <span style={{ color: '#B0344F' }}>*</span></div>
        <input value={company} onChange={e => setCompany(e.target.value)} disabled={saving}
          placeholder="ИП Иванов / ТОО «Ромашка»" style={inputStyle} />
      </div>
      <div>
        <div style={labelStyle}>БИН/ИИН (12 цифр) <span style={{ color: '#B0344F' }}>*</span></div>
        <input value={bin} inputMode="numeric"
          onChange={e => setBin(e.target.value.replace(/\D/g, '').slice(0, 12))}
          disabled={saving} placeholder="12 цифр" style={inputStyle} />
      </div>
      {error && <p style={{ fontSize: 12.5, color: '#B0344F', margin: 0 }}>{error}</p>}
      <button onClick={save} disabled={saving} style={{
        background: saving ? '#B9889B' : C.accent, color: '#fff', fontSize: 13, fontWeight: 600,
        padding: '10px 16px', borderRadius: 8, border: 'none', cursor: saving ? 'default' : 'pointer',
      }}>{saving ? 'Сохраняем…' : 'Сохранить и продолжить'}</button>
    </div>
  )
}
