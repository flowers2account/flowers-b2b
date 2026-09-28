'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Форма общего пароля на /pod-zakaz — раздел не для клиентов, показ ограниченному кругу по
// ссылке. Проверка на сервере (/api/pod-zakaz/auth), эта страница — только UI. middleware.ts
// пускает сюда без куки (иначе некуда было бы вводить пароль).
function AccessForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/pod-zakaz'

  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/pod-zakaz/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push(next)
        router.refresh()
        return
      }
      const data = await res.json().catch(() => null)
      setError(data?.error || 'Неверный пароль')
    } catch {
      setError('Не удалось проверить пароль. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F6F2EF', padding: 16,
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%', maxWidth: 320, background: '#fff', borderRadius: 12,
          border: '1px solid var(--border)', padding: 24,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ fontFamily: 'var(--font-golos)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          Под заказ
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>
          Раздел доступен по паролю.
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          autoFocus
          style={{
            height: 42, padding: '0 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-input)', fontSize: 14, fontFamily: 'inherit',
          }}
        />
        {error && <div style={{ fontSize: 12, color: '#C62828' }}>{error}</div>}
        <button
          type="submit"
          disabled={submitting || !password}
          style={{
            height: 42, background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-btn)', fontSize: 14, fontWeight: 600,
            cursor: submitting || !password ? 'default' : 'pointer', fontFamily: 'inherit',
            opacity: submitting || !password ? 0.7 : 1,
          }}
        >
          {submitting ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}

export default function PodZakazAccessPage() {
  return (
    <Suspense fallback={null}>
      <AccessForm />
    </Suspense>
  )
}
