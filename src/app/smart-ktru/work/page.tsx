'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { useSmartKtru } from '@/lib/smart-ktru/store'
import { Card, VerdictTag, fmtMoney } from '@/components/smart-ktru/kit'

export default function WorkPage() {
  const working = useSmartKtru((s) => s.working)
  const fromWork = useSmartKtru((s) => s.fromWork)
  const [now] = useState(() => Date.now())

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1>В работе</h1>

      {working.length === 0 ? (
        <Card style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <Inbox size={28} />
          <p className="text-muted" style={{ margin: '8px 0 0' }}>
            Здесь появятся закупки, которые вы решили проработать.
          </p>
          <Link className="btn btn-secondary" href="/smart-ktru/procurements" style={{ marginTop: 8 }}>
            К закупкам
          </Link>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {working.map((w) => {
            const end = w.endDate ? new Date(w.endDate.replace(' ', 'T')).getTime() : null
            const daysLeft = end ? Math.ceil((end - now) / 86_400_000) : null
            return (
              <Card key={w.lotId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {w.participationIndex != null && (
                        <b style={{ fontFamily: 'var(--font-heading)' }}>{w.participationIndex}/100</b>
                      )}
                      {w.verdict && <VerdictTag verdict={w.verdict} />}
                    </div>
                    <div className="card-title" style={{ marginTop: 4 }}>
                      <Link href={`/smart-ktru/lot/${w.lotId}?product=${w.productId}`}>
                        {w.lotName ?? `Лот ${w.lotId}`}
                      </Link>
                    </div>
                    <div className="card-meta">{w.customerName ?? '—'}</div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>
                      {fmtMoney(w.amount)}
                      {daysLeft != null && ` · срок ${daysLeft > 0 ? `${daysLeft} дн.` : 'истёк'}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Link className="btn btn-secondary" href={`/smart-ktru/lot/${w.lotId}?product=${w.productId}`}>
                      Открыть
                    </Link>
                    <button className="btn btn-ghost" onClick={() => fromWork(w.lotId)}>Убрать</button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
