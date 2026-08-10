'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/api-token'
import { useAuthStore } from '@/lib/auth-store'

type PendingImport = {
  import_id: number
  source: string | null
  total: number
  matched: number
  unmatched: number
  last_at: string
}

const SOURCE_LABEL: Record<string, string> = {
  '1c-ip': '1С-ИП',
  '1c-too': '1С-ТОО',
}

function sourceLabel(s: string | null): string {
  if (!s) return 'XLS'
  return SOURCE_LABEL[s] ?? s
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Oral' })
  if (today) return time
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Asia/Oral' }) + ' ' + time
}

/** Незакрытые выгрузки из staging (XLS и 1С) — точка входа в сопоставление */
export default function IncomingImports() {
  const router = useRouter()
  const isAuthed = useAuthStore(s => s.isAuthed)
  const [imports, setImports] = useState<PendingImport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ⚠️ Раньше любая ошибка проглатывалась и блок просто исчезал — снаружи это
  // неотличимо от «выгрузок нет», и починить вслепую невозможно. Показываем причину.
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      if (!headers.Authorization) {
        setError('Сессия истекла — войдите заново, чтобы увидеть входящие выгрузки')
        setImports([])
        return
      }
      const res = await fetch('/api/import-xls/pending', { headers })
      if (res.status === 401 || res.status === 403) {
        setError('Нет доступа к списку выгрузок (403) — сессия истекла, войдите заново')
        setImports([])
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(`Ошибка загрузки выгрузок: ${data.error ?? res.status}`)
        setImports([])
        return
      }
      setImports(data.imports ?? [])
    } catch (e) {
      setError(`Не удалось запросить выгрузки: ${e instanceof Error ? e.message : String(e)}`)
      setImports([])
    } finally {
      setLoading(false)
    }
  }, [])

  // supabase-js восстанавливает сессию из localStorage асинхронно: запрос в момент
  // монтирования может уйти без токена и получить 403. Перезапрашиваем, когда
  // авторизация готова, — иначе блок исчезал навсегда до перезагрузки страницы.
  useEffect(() => { load() }, [load, isAuthed])

  if (error) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span className="shrink-0">📥</span>
        <span>{error}</span>
        <button
          onClick={load}
          className="ml-auto shrink-0 rounded border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
        >
          Повторить
        </button>
      </div>
    )
  }

  if (loading || imports.length === 0) return null

  return (
    <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg p-3">
      <div className="text-sm font-semibold text-amber-900 mb-2">
        📥 Входящие выгрузки — ждут сопоставления
      </div>
      <div className="space-y-1.5">
        {imports.map(im => (
          <div
            key={im.import_id}
            className="flex items-center gap-3 bg-white border border-amber-100 rounded px-3 py-2 text-sm"
          >
            <span className="font-semibold text-gray-800 shrink-0">{sourceLabel(im.source)}</span>
            <span className="text-gray-600">{im.total} позиций</span>
            <span className="text-blue-700">{im.matched} сопоставлено</span>
            {im.unmatched > 0 && <span className="text-red-600 font-medium">{im.unmatched} нет</span>}
            <span className="text-gray-400 ml-auto shrink-0">{fmtTime(im.last_at)}</span>
            <button
              onClick={() => router.push(`/admin/import/${im.import_id}/mapping`)}
              className="shrink-0 px-3 py-1 rounded text-xs font-semibold text-white bg-[#7a1c2e] hover:bg-[#641625] cursor-pointer"
            >
              Открыть сопоставление
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
