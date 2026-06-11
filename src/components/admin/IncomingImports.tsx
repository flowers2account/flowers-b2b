'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/api-token'

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
  const [imports, setImports] = useState<PendingImport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/import-xls/pending', { headers })
        const data = await res.json()
        setImports(data.imports ?? [])
      } catch { /* блок просто не показывается */ }
      finally { setLoading(false) }
    })()
  }, [])

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
