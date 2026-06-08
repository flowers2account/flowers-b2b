'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Поиск в герое страницы «Категории» → каталог с применённым запросом (/?search=…). */
export default function CategorySearch({ className }: { className?: string }) {
  const [q, setQ] = useState('')
  const router = useRouter()

  const go = () => {
    const v = q.trim()
    router.push(v ? `/?search=${encodeURIComponent(v)}` : '/')
  }

  return (
    <div className={className} style={{
      display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 8px 0 18px',
      background: '#fff', border: '1px solid var(--border, #E6DFD9)', borderRadius: 999,
      boxShadow: '0 1px 2px rgba(40,20,30,.04), 0 2px 6px rgba(40,20,30,.04)',
      minWidth: 320, flex: 1, maxWidth: 480,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A8A4AD" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') go() }}
        placeholder="Поиск: плёнка, кашпо, лента, грунт…"
        style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 15, color: 'var(--ink, #1A1A1F)', background: 'transparent', flex: 1 }}
      />
      <button
        onClick={go}
        style={{ height: 38, padding: '0 20px', border: 'none', borderRadius: 999, background: 'var(--accent, #8B3A5A)', color: '#fff', fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', flex: 'none' }}
      >
        Найти
      </button>
    </div>
  )
}
