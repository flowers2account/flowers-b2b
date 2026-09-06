'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSmartKtru } from '@/lib/smart-ktru/store'
import { Card, VerdictTag, fmtMoney } from '@/components/smart-ktru/kit'

interface Row {
  productId: string
  productName: string
  live: number | null
  soonest: { lotId: number; nameRu: string | null; daysLeft: number | null; amount: number | null; ktru: string } | null
  error?: string
}

export default function DigestPage() {
  const products = useSmartKtru((s) => s.products)
  const analysisCache = useSmartKtru((s) => s.analysisCache)
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    if (products.length === 0) return
    let alive = true
    Promise.all(
      products.map(async (p): Promise<Row> => {
        const qs = p.ktruCodes?.[0] ? `ktru=${encodeURIComponent(p.ktruCodes[0])}` : `q=${encodeURIComponent(p.name)}`
        try {
          const r = await fetch(`/api/smart-ktru/procurements?${qs}`)
          const j = await r.json()
          if (!r.ok) return { productId: p.id, productName: p.name, live: null, soonest: null, error: j.error }
          const live = (j.lots ?? []).filter((l: Record<string, unknown>) => !l.deadlinePassed)
          live.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            ((a.deadlineDaysLeft as number) ?? 999) - ((b.deadlineDaysLeft as number) ?? 999))
          const s = live[0] as Record<string, unknown> | undefined
          return {
            productId: p.id, productName: p.name,
            live: j.counts?.liveLots ?? j.counts?.activeLots ?? live.length,
            soonest: s
              ? { lotId: s.lotId as number, nameRu: s.nameRu as string | null, daysLeft: s.deadlineDaysLeft as number | null, amount: s.amount as number | null, ktru: j.ktru as string }
              : null,
          }
        } catch (e) {
          return { productId: p.id, productName: p.name, live: null, soonest: null, error: String(e) }
        }
      }),
    ).then((rs) => alive && setRows(rs))
    return () => {
      alive = false
    }
  }, [products])

  const totalLive = (rows ?? []).reduce((a, r) => a + (r.live ?? 0), 0)

  // честная статистика: только по реально проанализированным лотам (кэш)
  const analyzed = useMemo(() => Object.values(analysisCache).map((c) => c.result), [analysisCache])
  const byVerdict = useMemo(() => {
    const g: Record<string, number> = { recommend: 0, consider: 0, unlikely: 0, unsuitable: 0 }
    analyzed.forEach((a) => { g[a.score.verdict] = (g[a.score.verdict] ?? 0) + 1 })
    return g
  }, [analyzed])
  const topRecommend = useMemo(
    () => analyzed.filter((a) => a.score.verdict === 'recommend').sort((x, y) => y.score.participationIndex - x.score.participationIndex).slice(0, 5),
    [analyzed],
  )

  const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1>Дайджест</h1>
      <p className="text-muted">{date}</p>

      {products.length === 0 ? (
        <p className="text-muted">Добавьте товары — здесь появится обзор.</p>
      ) : (
        <>
          <p style={{ fontSize: 15 }}>
            Сейчас по вашим товарам <b>{rows === null ? '…' : totalLive}</b> живых закупок.
          </p>

          {analyzed.length > 0 && (
            <div
              style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                borderTop: '2px solid rgba(32,30,29,0.35)', borderBottom: '2px solid rgba(32,30,29,0.35)',
                margin: '16px 0',
              }}
            >
              {[
                ['Рекомендуем', byVerdict.recommend],
                ['Рассмотреть', byVerdict.consider],
                ['Скорее нет / Не подходит', byVerdict.unlikely + byVerdict.unsuitable],
              ].map(([label, n], i) => (
                <div key={i} style={{ padding: 16, borderLeft: i > 0 ? '2px solid rgba(32,30,29,0.35)' : undefined }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32 }}>{n}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {topRecommend.length > 0 && (
            <>
              <h3>Стоит посмотреть в первую очередь</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {topRecommend.map((a) => (
                  <Card key={a.facts.lotId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <b style={{ fontFamily: 'var(--font-heading)' }}>{a.score.participationIndex}/100</b>
                          <VerdictTag verdict={a.score.verdict} />
                        </div>
                        <div className="card-title" style={{ marginTop: 4 }}>{a.facts.nameRu}</div>
                        <div className="card-meta">{a.facts.customerNameRu} · {fmtMoney(a.facts.amount)}</div>
                      </div>
                      <Link className="btn btn-secondary" href={`/smart-ktru/lot/${a.facts.lotId}?product=${a.productId}`}>
                        Открыть
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          <h3>По товарам</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(rows ?? []).map((r) => (
              <Card key={r.productId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Link className="card-title" href={`/smart-ktru/procurements?product=${r.productId}`}>{r.productName}</Link>
                  <span className="tag tag-neutral">{r.live ?? '?'} живых</span>
                </div>
                {r.error && <div className="text-muted" style={{ fontSize: 12 }}>{r.error}</div>}
                {r.soonest && (
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    ближайший срок: {r.soonest.nameRu} · {fmtMoney(r.soonest.amount)} ·{' '}
                    <Link href={`/smart-ktru/lot/${r.soonest.lotId}?product=${r.productId}&ktru=${r.soonest.ktru}`}>
                      {r.soonest.daysLeft} дн. →
                    </Link>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <p className="text-muted" style={{ fontSize: 12, marginTop: 16 }}>
            Показываем только действительно важное — без потока лишних уведомлений.
          </p>
        </>
      )}
    </div>
  )
}
