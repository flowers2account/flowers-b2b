'use client'

import { ReactNode } from 'react'
import { useIsMobile } from '@/lib/use-mobile'
import { usePfDetail } from '@/lib/pod-zakaz/pf-detail-store'

const HEADER_H = 104 // высота шапки сайта (L1+L2) — как в CatalogLayout.tsx

// Лёгкая версия CatalogLayout.tsx: left (фильтры) + center (тулбар+сетка) + right (детальная
// панель товара). Десктоп — правая колонка ДОКОВАНА третьей колонкой grid (как в боевом
// каталоге), не выезжает поверх. Мобила — bottom-sheet поверх контента, открывается, когда
// в pf-detail-store выбран товар (тот же приём, что мобильный detail-sheet в CatalogLayout).
export default function PfLayout({ left, center, right }: { left: ReactNode; center: ReactNode; right: ReactNode }) {
  const isMobile = useIsMobile()
  const pfOfferId = usePfDetail(s => s.pfOfferId)
  const close = usePfDetail(s => s.close)
  const isDetailOpen = isMobile && pfOfferId != null

  if (isMobile) {
    return (
      <div style={{ background: '#fff', position: 'relative' }}>
        <div style={{ background: '#F6F2EF', borderBottom: '1px solid var(--border-soft, #EFEAE5)' }}>
          {left}
        </div>
        {center}

        {isDetailOpen && (
          <div
            onClick={close}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }}
          />
        )}
        <div style={{
          position: 'fixed', top: HEADER_H, bottom: 0, left: 0, right: 0,
          background: '#fff', borderRadius: '16px 16px 0 0',
          transform: isDetailOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease',
          zIndex: 100, overflowY: 'auto',
        }}>
          {right}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#EDE9E6' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '236px 1fr 372px',
        minHeight: 'calc(100vh - var(--header-h, 104px))',
        maxWidth: 1320, margin: '0 auto', background: '#fff',
      }}>
        <aside style={{ background: '#F6F2EF', borderRight: '1px solid var(--border-soft, #EFEAE5)' }}>
          {left}
        </aside>
        <main style={{ background: '#fff', minWidth: 0 }}>
          {center}
        </main>
        <aside style={{ background: '#fff', borderLeft: '1px solid var(--border)', overflowY: 'auto' }}>
          {right}
        </aside>
      </div>
    </div>
  )
}
