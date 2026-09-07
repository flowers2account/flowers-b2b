'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { useSmartKtru, KANBAN_STAGES, KANBAN_TITLES, type KanbanStage } from '@/lib/smart-ktru/store'
import { VerdictTag, fmtMoney } from '@/components/smart-ktru/kit'

const fmtMln = (n: number) => (n >= 1e6 ? `₸ ${(n / 1e6).toFixed(1).replace('.0', '')} млн` : fmtMoney(n))

export default function WorkPage() {
  const working = useSmartKtru((s) => s.working)
  const fromWork = useSmartKtru((s) => s.fromWork)
  const moveWorkStage = useSmartKtru((s) => s.moveWorkStage)
  const [now] = useState(() => Date.now())

  const daysLeft = (endDate: string | null) => {
    if (!endDate) return null
    const t = new Date(endDate.replace(' ', 'T')).getTime()
    return Math.ceil((t - now) / 86_400_000)
  }

  const urgent = working.filter((w) => {
    const d = daysLeft(w.endDate)
    return d != null && d >= 0 && d <= 3
  }).length
  const potential = working.reduce(
    (a, w) => a + (w.amount != null && w.marginRatio != null ? w.amount * w.marginRatio : 0),
    0,
  )
  const hasPotential = working.some((w) => w.amount != null && w.marginRatio != null)

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>В работе</h1>

      {working.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, gap: 10 }}>
          <Inbox size={28} style={{ opacity: 0.5 }} />
          <p className="text-muted" style={{ margin: 0 }}>
            Пока нет закупок в работе. Добавляйте их со страницы «Возможности».
          </p>
          <Link className="btn btn-primary" href="/smart-ktru/procurements">К возможностям</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }} className="skt-three-col">
            <div className="card elev-sm">
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, lineHeight: 1 }}>{working.length}</div>
              <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 2 }}>В работе</div>
            </div>
            {hasPotential && (
              <div className="card elev-sm">
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, lineHeight: 1 }}>{fmtMln(potential)}</div>
                <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 2 }}>Потенциальная прибыль</div>
              </div>
            )}
            <div className="card elev-sm">
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, lineHeight: 1 }}>{urgent}</div>
              <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 2 }}>Срочные</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="skt-three-col">
            {KANBAN_STAGES.map((stage) => {
              const items = working.filter((w) => (w.kanbanStage ?? 'review') === stage)
              return (
                <div key={stage}>
                  <h4 style={{ marginTop: 0 }}>{KANBAN_TITLES[stage as KanbanStage]} · {items.length}</h4>
                  <div style={{ background: 'var(--color-surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200 }}>
                    {items.length === 0 && <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>—</p>}
                    {items.map((w) => {
                      const d = daysLeft(w.endDate)
                      const idx = KANBAN_STAGES.indexOf((w.kanbanStage ?? 'review') as KanbanStage)
                      return (
                        <div key={w.lotId} className="card elev-sm" style={{ gap: 6 }}>
                          <Link
                            className="card-title"
                            style={{ fontSize: 15, textDecoration: 'none', color: 'inherit' }}
                            href={`/smart-ktru/lot/${w.lotId}?product=${w.productId}`}
                          >
                            {w.lotName ?? `Лот ${w.lotId}`}
                          </Link>
                          <div className="card-meta">{w.customerName ?? '—'}</div>
                          <div style={{ fontSize: 13 }}>
                            {fmtMoney(w.amount)}
                            {d != null && ` · ${d > 0 ? `${d} дн.` : 'срок истёк'}`}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {w.verdict && <VerdictTag verdict={w.verdict} />}
                            {w.participationIndex != null && (
                              <span className="text-muted" style={{ fontSize: 12 }}>{w.participationIndex}/100</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            {idx > 0 && (
                              <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => moveWorkStage(w.lotId, -1)}>←</button>
                            )}
                            {idx < KANBAN_STAGES.length - 1 && (
                              <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => moveWorkStage(w.lotId, 1)}>→</button>
                            )}
                            <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => fromWork(w.lotId)}>Убрать</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
