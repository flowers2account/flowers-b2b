'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { getAccessRequests, admitRequest, type AccessRow } from '@/app/admin/preorder-actions'

type FilterStatus = 'all' | 'pending' | 'approved' | 'denied'

const STATUS_LABEL: Record<string, string> = {
  pending:  'Ожидает',
  approved: 'Впущен',
  denied:   'Отклонён',
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  pending:  { background: '#fef3c7', color: '#92400e' },
  approved: { background: '#d1fae5', color: '#065f46' },
  denied:   { background: '#fee2e2', color: '#991b1b' },
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Asia/Oral',
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function RequestsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()
  const supabase = createClient()

  const [rows, setRows]     = useState<AccessRow[]>([])
  const [title, setTitle]   = useState('')
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<number | null>(null)
  const [err, setErr]       = useState('')

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!isAuthed) return
    if (role !== 'admin' && role !== 'manager') router.replace('/')
  }, [isAuthed, role])

  const loadRequests = useCallback(async () => {
    const result = await getAccessRequests(parseInt(id))
    if (result.error) { setErr(result.error); return }
    setRows(result.rows)
    setLoading(false)
  }, [id])

  useEffect(() => {
    if (!isAuthed || (role !== 'admin' && role !== 'manager')) return
    supabase.from('campaigns').select('title').eq('id', parseInt(id)).single()
      .then(({ data }: { data: { title: string } | null }) => setTitle(data?.title ?? ''))
    loadRequests()
    const iv = setInterval(loadRequests, 10000)
    return () => clearInterval(iv)
  }, [isAuthed, role, loadRequests])

  async function handleAdmit(accessId: number, action: 'approve' | 'deny') {
    setActing(accessId)
    setErr('')
    // Optimistic update
    setRows(prev => prev.map(r =>
      r.id === accessId ? { ...r, status: action === 'approve' ? 'approved' : 'denied' } : r
    ))
    const result = await admitRequest({ campaign_id: parseInt(id), access_id: accessId, action })
    if (result.error) {
      setErr(result.error)
      await loadRequests() // revert optimistic
    }
    setActing(null)
  }

  const pendingCount = rows.filter(r => r.status === 'pending').length
  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter)

  if (!isAuthed || (role !== 'admin' && role !== 'manager')) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Загрузка...</div>
  }

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/admin/campaigns" style={{ fontSize: 13, color: '#aaa' }}>← Кампании</Link>
        <span style={{ color: '#ddd' }}>·</span>
        <Link href={`/admin/campaigns/${id}/staging`} style={{ fontSize: 13, color: '#aaa' }}>Стейджинг</Link>
        <span style={{ color: '#ddd' }}>·</span>
        <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>Заявки</span>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 0 4px', flexBasis: '100%' }}>
          {title || `Кампания #${id}`}
          {pendingCount > 0 && (
            <span style={{
              marginLeft: 10, background: '#ef4444', color: '#fff',
              borderRadius: 99, fontSize: 12, padding: '2px 9px', fontWeight: 700,
            }}>
              {pendingCount} ждут
            </span>
          )}
        </h1>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['all', 'pending', 'approved', 'denied'] as FilterStatus[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', borderRadius: 99, fontSize: 12, border: 'none', cursor: 'pointer',
            background: filter === f ? '#7a1c2e' : '#f0f0f0',
            color: filter === f ? '#fff' : '#555',
            fontWeight: filter === f ? 600 : 400,
          }}>
            {f === 'all' ? 'Все' : STATUS_LABEL[f]}
            {f !== 'all' && ` (${rows.filter(r => r.status === f).length})`}
          </button>
        ))}
      </div>

      {err && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ color: '#aaa', padding: 48, textAlign: 'center' }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#aaa', padding: 48, textAlign: 'center' }}>Нет заявок</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(row => (
            <div key={row.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 10,
              background: row.status === 'pending' ? '#fffbf0' : '#fafafa',
              border: `1px solid ${row.status === 'pending' ? '#fde68a' : '#ebebeb'}`,
            }}>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                  {row.guest_name
                    ? <>{row.guest_name} <span style={{ fontWeight: 400, color: '#777' }}>{row.guest_phone}</span></>
                    : <span style={{ color: '#555' }}>{row.guest_phone}</span>
                  }
                </div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{fmtTime(row.requested_at)}</div>
              </div>

              {/* Status badge */}
              <span style={{
                ...STATUS_STYLE[row.status],
                borderRadius: 99, fontSize: 11, padding: '3px 10px', fontWeight: 600,
                whiteSpace: 'nowrap',
              }}>
                {STATUS_LABEL[row.status]}
              </span>

              {/* Action buttons — only for pending */}
              {row.status === 'pending' && (
                <>
                  <button
                    disabled={acting === row.id}
                    onClick={() => handleAdmit(row.id, 'approve')}
                    style={{
                      padding: '6px 16px', borderRadius: 8,
                      background: '#2d6a4f', color: '#fff', border: 'none',
                      fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                      opacity: acting === row.id ? 0.5 : 1,
                    }}
                  >
                    Впустить
                  </button>
                  <button
                    disabled={acting === row.id}
                    onClick={() => handleAdmit(row.id, 'deny')}
                    style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: '#fff', color: '#ef4444', border: '1px solid #ef4444',
                      fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                      opacity: acting === row.id ? 0.5 : 1,
                    }}
                  >
                    Отклонить
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: '#bbb', textAlign: 'right' }}>
        Обновляется автоматически каждые 10 сек
      </div>
    </main>
  )
}
