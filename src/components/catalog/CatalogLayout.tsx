import { ReactNode } from 'react'

// header L1(58px) + L2(46px) = 104px
const HEADER_H = 104

export default function CatalogLayout({
  left,
  center,
  right,
}: {
  left: ReactNode
  center: ReactNode
  right: ReactNode
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr 280px',
        height: `calc(100vh - ${HEADER_H}px)`,
      }}
    >
      <aside
        className="overflow-y-auto bg-white"
        style={{ borderRight: '1px solid var(--border)' }}
      >
        {left}
      </aside>
      <main className="overflow-y-auto bg-[#fafafa]">
        {center}
      </main>
      <aside
        className="overflow-y-auto bg-white"
        style={{ borderLeft: '1px solid var(--border)' }}
      >
        {right}
      </aside>
    </div>
  )
}
