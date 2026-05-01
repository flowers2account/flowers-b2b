'use client'
import { useEffect } from 'react'

export default function PrintActions() {
  useEffect(() => { window.print() }, [])

  return (
    <div className="no-print flex gap-3 justify-center mb-6">
      <button
        onClick={() => window.print()}
        className="px-6 py-2 bg-green-700 text-white rounded hover:bg-green-800 text-sm"
      >
        🖨 Распечатать
      </button>
      <button
        onClick={() => window.close()}
        className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
      >
        Закрыть
      </button>
    </div>
  )
}
