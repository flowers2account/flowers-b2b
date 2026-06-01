'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/auth-store'

export default function ImportXLS({ onImported }: { onImported: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<{
    name: string; matched: number; unmatched: number; total: number; importId?: number
  }[]>([])
  const [lastImportId, setLastImportId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const userId = useAuthStore(s => s.user?.id)

  async function handleUpload() {
    if (!files.length) return
    setLoading(true)
    setResults([])
    setLastImportId(null)

    // One shared importId for all files in this batch
    const importId = Date.now()
    setLastImportId(importId)

    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('importId', String(importId))
      if (userId) formData.append('userId', userId)

      try {
        const res = await fetch('/api/import-xls', { method: 'POST', body: formData })
        const data = await res.json()
        setResults(prev => [...prev, {
          name: file.name,
          matched: data.matched ?? 0,
          unmatched: data.unmatched ?? 0,
          total: data.total ?? 0,
          importId: data.importId,
        }])
      } catch {
        setResults(prev => [...prev, { name: file.name, matched: 0, unmatched: 0, total: 0 }])
      }
    }

    setLoading(false)
  }

  const totalUnmatched = results.reduce((s, r) => s + r.unmatched, 0)
  const totalMatched   = results.reduce((s, r) => s + r.matched,   0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="cursor-pointer px-4 py-2 border rounded-md text-sm hover:bg-gray-50">
          Выбрать файлы
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={e => { setFiles(Array.from(e.target.files ?? [])); setResults([]); setLastImportId(null) }}
          />
        </label>
        {files.length > 0 && (
          <span className="text-sm text-gray-500">{files.map(f => f.name).join(', ')}</span>
        )}
        <Button onClick={handleUpload} disabled={!files.length || loading || results.length > 0} size="sm">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Загрузка…
            </span>
          ) : 'Загрузить'}
        </Button>
      </div>

      <p className="text-xs text-gray-400">
        Файл разбирается в буфер. На следующем шаге привяжите незнакомые позиции и нажмите «Применить».
      </p>

      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((r, i) => (
            <div key={i} className="text-xs flex gap-3 items-center">
              <span className="text-gray-500 truncate max-w-[200px]">{r.name}</span>
              <span className="text-green-700">✓ {r.matched}</span>
              {r.unmatched > 0
                ? <span className="text-red-600">⚠ {r.unmatched} не найдено</span>
                : <span className="text-gray-400">все найдены</span>
              }
              <span className="text-gray-400">/ {r.total}</span>
            </div>
          ))}

          {lastImportId && (
            <div className="pt-2">
              <button
                onClick={() => router.push(`/admin/import/${lastImportId}/mapping`)}
                style={{
                  padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                  background: totalUnmatched > 0 ? '#7a1c2e' : '#16a34a',
                  color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {totalUnmatched > 0
                  ? `→ Привязать ${totalUnmatched} строк и применить`
                  : `→ Применить ${totalMatched} строк`
                }
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
