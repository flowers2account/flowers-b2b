'use client'
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/auth-store'

export default function ImportXLS({ onImported }: { onImported: () => void }) {
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<{ name: string; success: number; errors: number; zeroed?: number }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore(s => s.user)

  async function handleUpload() {
    if (!files.length) return
    const confirmed = confirm(
      `Загрузка файлов обнулит ВСЕ текущие остатки категории перед записью новых данных.\n\nФайлы: ${files.map(f => f.name).join(', ')}\n\nПродолжить?`
    )
    if (!confirmed) return
    setLoading(true)
    setResults([])

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const isLast = i === files.length - 1
      const isFirst = i === 0
      const formData = new FormData()
      formData.append('file', file)
      formData.append('isLast', String(isLast))
      formData.append('isFirst', String(isFirst))
      if (user?.id) formData.append('userId', user.id)

      try {
        const res = await fetch('/api/import-xls', { method: 'POST', body: formData })
        const data = await res.json()
        setResults(prev => [...prev, { name: file.name, success: data.success ?? 0, errors: data.errors ?? 0, zeroed: data.zeroed ?? 0 }])
      } catch (e) {
        setResults(prev => [...prev, { name: file.name, success: 0, errors: 1 }])
      }
    }

    setLoading(false)
    onImported()
  }

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
            onChange={e => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {files.length > 0 && (
          <span className="text-sm text-gray-500">{files.map(f => f.name).join(', ')}</span>
        )}
        <Button onClick={handleUpload} disabled={!files.length || loading} size="sm">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Загрузка...
            </span>
          ) : 'Загрузить'}
        </Button>
      </div>
      <p className="text-xs text-gray-400">Можно выбрать несколько файлов сразу. Zeroed применяется после последнего файла категории.</p>
      {results.length > 0 && (
        <div className="text-sm space-y-1">
          {results.map((r, i) => (
            <div key={i} className="flex gap-3 text-xs">
              <span className="text-gray-500 truncate max-w-[200px]">{r.name}</span>
              <span className="text-green-700">+{r.success}</span>
              {r.errors > 0 && <span className="text-red-600">err:{r.errors}</span>}
              {r.zeroed ? <span className="text-orange-500">обнулено:{r.zeroed}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
