'use client'
import { useEffect, useState } from 'react'
import LegalPage from '@/components/LegalPage'

interface Props {
  open: boolean
  onClose: () => void
}

// Модалка «Условия доставки» поверх чекаута. Текст берётся из /api/legal/delivery —
// тот же docs/legal-content/delivery.md, что рендерит страница /delivery (единый источник).
// Бренд: Rosewood #8B3A5A, фон Blush #F7EEF2. Закрытие по крестику, клику вне окна и Esc.
export default function DeliveryTermsModal({ open, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open || content !== null) return
    fetch('/api/legal/delivery')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setContent(d.content as string))
      .catch(() => setError(true))
  }, [open, content])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(26,12,18,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#F7EEF2',                 // Blush
          borderRadius: 16,
          width: '100%', maxWidth: 640, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(26,12,18,0.35)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #E7D4DC',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#8B3A5A' }}>
            Условия доставки
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 26, lineHeight: 1, color: '#8B3A5A', padding: '0 4px',
            }}
          >×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 4px 12px', background: '#fff' }}>
          {error ? (
            <p style={{ padding: 24, color: '#8B3A5A' }}>Не удалось загрузить условия. Попробуйте позже.</p>
          ) : content === null ? (
            <p style={{ padding: 24, color: '#7a6b72' }}>Загрузка…</p>
          ) : (
            <LegalPage content={content} />
          )}
        </div>
      </div>
    </div>
  )
}
