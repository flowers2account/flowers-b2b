'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'

export default function ImportXLS({ onImported }: { onImported: () => void }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: number; errorLog: string[] } | null>(null)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/import-xls', { method: 'POST', body: formData })
      const data = await res.json()
      setResult(data)
      if (data.success > 0) onImported()
    } catch (e) {
      setResult({ success: 0, errors: 1, errorLog: [String(e)] })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="cursor-pointer px-4 py-2 border rounded-md text-sm hover:bg-gray-50">
          Выбрать файл
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden"
            onChange={e => setFileName(e.target.files?.[0]?.name ?? '')} />
        </label>
        {fileName && <span className="text-sm text-gray-500">{fileName}</span>}
        <Button onClick={handleUpload} disabled={!fileName || loading} size="sm">
          {loading ? 'Загружаю...' : 'Загрузить'}
        </Button>
      </div>
      <p className="text-xs text-gray-400">Формат: A — Наименование, B — Количество, C — Цена</p>
      {result && (
        <div className="text-sm space-y-1">
          <p className="text-green-700">Импортировано: {result.success}</p>
          {result.errors > 0 && <p className="text-red-600">Ошибок: {result.errors}</p>}
          {result.errorLog?.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-gray-500">Показать ошибки</summary>
              <ul className="mt-1 text-xs text-red-500 pl-3 list-disc">
                {result.errorLog.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
