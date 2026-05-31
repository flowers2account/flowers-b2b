'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { launchCampaign } from '@/app/admin/preorder-actions'

interface StagingRow {
  id: number
  oz_line_id: string | null
  oz_stock_type: string | null
  oz_delivery_date: string | null
  available_stems: number | null
  order_multiple_stems: number | null
  purchase_eur: number | null
  name: string | null
  image_url: string | null
  is_selected: boolean
  product_id: number | null
}

interface AppSettings { markup_percent: number; eur_kzt_rate: number; round_to: number }

function calcPrice(eur: number, markup: number, rate: number, roundTo: number) {
  const raw = eur * rate * (1 + markup / 100)
  return Math.round(raw / roundTo) * roundTo
}

export default function StagingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()
  const supabase = createClient()

  const [rows, setRows]         = useState<StagingRow[]>([])
  const [title, setTitle]       = useState('')
  const [settings, setSettings] = useState<AppSettings>({ markup_percent: 35, eur_kzt_rate: 525, round_to: 1 })
  const [markup, setMarkup]     = useState(35)
  const [rate, setRate]         = useState(525)
  const [loading, setLoading]   = useState(true)
  const [launching, setLaunching] = useState(false)
  const [result, setResult]     = useState<{ access_code?: string; inserted?: number } | null>(null)
  const [error, setError]       = useState('')

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (!isAuthed) return
    if (role !== 'admin' && role !== 'manager') router.replace('/')
  }, [isAuthed, role])

  useEffect(() => {
    if (!isAuthed || (role !== 'admin' && role !== 'manager')) return
    Promise.all([loadStaging(), loadSettings()])
  }, [isAuthed, role])

  async function loadStaging() {
    setLoading(true)
    const { data: campaign } = await supabase
      .from('campaigns').select('title').eq('id', parseInt(id)).single()
    setTitle(campaign?.title ?? '')

    const { data } = await supabase
      .from('campaign_staging')
      .select('id,oz_line_id,oz_stock_type,oz_delivery_date,available_stems,order_multiple_stems,purchase_eur,name,image_url,is_selected,product_id')
      .eq('campaign_id', parseInt(id))
      .order('name')
    setRows(data ?? [])
    setLoading(false)
  }

  async function loadSettings() {
    const { data } = await supabase
      .from('app_settings').select('key,value')
      .in('key', ['preorder_markup_percent', 'preorder_eur_kzt_rate', 'preorder_round_to'])
    if (!data) return
    const m = Object.fromEntries(
      (data as { key: string; value: string }[]).map(s => [s.key, parseFloat(s.value)])
    )
    const s = {
      markup_percent: m.preorder_markup_percent ?? 35,
      eur_kzt_rate:   m.preorder_eur_kzt_rate   ?? 525,
      round_to:       m.preorder_round_to        ?? 1,
    }
    setSettings(s); setMarkup(s.markup_percent); setRate(s.eur_kzt_rate)
  }

  async function toggleSelected(rowId: number, val: boolean) {
    setRows(r => r.map(x => x.id === rowId ? { ...x, is_selected: val } : x))
    await supabase.from('campaign_staging').update({ is_selected: val }).eq('id', rowId)
  }

  async function handleLaunch() {
    setLaunching(true); setError('')
    try {
      const data = await launchCampaign({
        campaign_id: parseInt(id),
        markup_percent: markup,
        eur_kzt_rate: rate,
        round_to: settings.round_to,
      })
      if (data.error) { setError(data.error); return }
      setResult(data)
    } catch {
      setError('Ошибка запуска')
    } finally {
      setLaunching(false)
    }
  }

  const selectedCount = rows.filter(r => r.is_selected).length

  if (!isAuthed || (role !== 'admin' && role !== 'manager')) {
    return <div className="text-center py-16 text-gray-400">Загрузка...</div>
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/campaigns" className="text-sm text-gray-400 hover:text-gray-600">← Кампании</Link>
        <h1 className="text-xl font-semibold">{title || `Кампания #${id}`} — стейджинг</h1>
      </div>

      {result ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#166534', marginBottom: 8 }}>✅ Акция запущена!</div>
          <div style={{ fontSize: 14, color: '#166534' }}>Добавлено позиций: <strong>{result.inserted}</strong></div>
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 13, color: '#555' }}>Код входа для клиентов: </span>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 4, color: '#2d6a4f' }}>{result.access_code}</span>
          </div>
          <Link href={`/preorder/${id}`} target="_blank"
            style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: '#2d6a4f', textDecoration: 'underline' }}>
            Открыть витрину →
          </Link>
        </div>
      ) : null}

      {/* Настройки цены */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>
          <div style={{ color: '#888', marginBottom: 4 }}>Наценка, %</div>
          <input type="number" value={markup} onChange={e => setMarkup(parseFloat(e.target.value))}
            style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          <div style={{ color: '#888', marginBottom: 4 }}>€ → ₸</div>
          <input type="number" value={rate} onChange={e => setRate(parseFloat(e.target.value))}
            style={{ width: 90, padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }} />
        </label>
        <div style={{ fontSize: 12, color: '#888' }}>Цена = €закупка × курс × (1 + наценка%)</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#555' }}>Выбрано: <strong>{selectedCount}</strong> / {rows.length}</span>
          {!result && (
            <button
              onClick={handleLaunch}
              disabled={launching || selectedCount === 0}
              style={{ padding: '8px 20px', borderRadius: 8, background: selectedCount > 0 ? '#2d6a4f' : '#ccc', color: '#fff', border: 'none', fontSize: 14, cursor: selectedCount > 0 ? 'pointer' : 'default' }}
            >
              {launching ? 'Запуск…' : '🚀 Запустить акцию'}
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? <div style={{ color: '#888' }}>Загрузка…</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', color: '#888' }}>
              <th style={{ padding: '8px 4px', width: 32 }}></th>
              <th style={{ padding: '8px 4px', textAlign: 'left' }}>Товар</th>
              <th style={{ padding: '8px 4px', textAlign: 'center' }}>Тип</th>
              <th style={{ padding: '8px 4px', textAlign: 'center' }}>Поставка</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Доступно</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Кратность</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>€ закупка</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>₸ клиент</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const clientPrice = row.purchase_eur
                ? calcPrice(row.purchase_eur, markup, rate, settings.round_to)
                : null
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: row.is_selected ? 1 : 0.45 }}>
                  <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                    <input type="checkbox" checked={row.is_selected}
                      onChange={e => toggleSelected(row.id, e.target.checked)} />
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {row.image_url && <img src={row.image_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />}
                      <span style={{ fontWeight: 500 }}>{row.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'center', color: '#888' }}>{row.oz_stock_type ?? '—'}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                    {row.oz_delivery_date
                      ? new Date(row.oz_delivery_date).toLocaleDateString('ru-RU', { timeZone: 'Asia/Oral' })
                      : '—'}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{row.available_stems ?? '—'}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{row.order_multiple_stems ?? '—'}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', color: '#888' }}>
                    {row.purchase_eur ? `€${row.purchase_eur.toFixed(3)}` : '—'}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600, color: '#2d6a4f' }}>
                    {clientPrice ? `${clientPrice.toLocaleString('ru-RU')} ₸` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}
