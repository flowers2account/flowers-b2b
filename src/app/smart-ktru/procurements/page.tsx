'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, Check, X, Clock } from 'lucide-react'
import { useSmartKtru } from '@/lib/smart-ktru/store'
import { opportunityFromAnalysis } from '@/lib/smart-ktru/opportunity'
import { C, Card, VerdictTag, fmtMoney } from '@/components/smart-ktru/kit'

interface LotRow {
  lotId: number
  productId: string
  productName: string
  ktru: string
  nameRu: string | null
  amount: number | null
  count: number | null
  customerNameRu: string | null
  trdBuyNumberAnno: string | null
  region: string | null
  endDate: string | null
  deadlineDaysLeft: number | null
  deadlinePassed: boolean
}

function FeedInner() {
  const params = useSearchParams()
  const preselect = params.get('product')
  const products = useSmartKtru((s) => s.products)
  const analysisCache = useSmartKtru((s) => s.analysisCache)

  const [rows, setRows] = useState<LotRow[] | null>(null)
  const [filter, setFilter] = useState<string>(preselect ?? 'all')
  const [errs, setErrs] = useState<string[]>([])

  useEffect(() => {
    if (products.length === 0) return
    let alive = true

    // одна пара (товар × КТРУ) = один запрос к существующему API; если у товара
    // нет кодов — фолбэк на поиск по названию (q=). Результаты потом дедуп по lotId.
    const jobs: { p: (typeof products)[number]; qs: string }[] = []
    for (const p of products) {
      if (p.ktruCodes?.length) {
        for (const code of p.ktruCodes) jobs.push({ p, qs: `ktru=${encodeURIComponent(code)}` })
      } else {
        jobs.push({ p, qs: `q=${encodeURIComponent(p.name)}` })
      }
    }

    Promise.all(
      jobs.map(async ({ p, qs }) => {
        try {
          const r = await fetch(`/api/smart-ktru/procurements?${qs}`)
          const j = await r.json()
          if (!r.ok) return { err: `${p.name}: ${j.error ?? 'ошибка'}`, rows: [] as LotRow[] }
          return {
            err: null as string | null,
            rows: ((j.lots ?? []) as Record<string, unknown>[]).map((l) => ({
              lotId: l.lotId as number,
              productId: p.id,
              productName: p.name,
              ktru: j.ktru as string,
              nameRu: (l.nameRu as string | null) ?? null,
              amount: (l.amount as number | null) ?? null,
              count: (l.count as number | null) ?? null,
              customerNameRu: (l.customerNameRu as string | null) ?? null,
              trdBuyNumberAnno: (l.trdBuyNumberAnno as string | null) ?? null,
              region: (l.region as string | null) ?? null,
              endDate: (l.endDate as string | null) ?? null,
              deadlineDaysLeft: (l.deadlineDaysLeft as number | null) ?? null,
              deadlinePassed: !!l.deadlinePassed,
            })),
          }
        } catch (e) {
          return { err: `${p.name}: ${String(e)}`, rows: [] as LotRow[] }
        }
      }),
    ).then((res) => {
      if (!alive) return
      const all = res.flatMap((x) => x.rows)
      // дедуп по lotId: один лот может числиться под несколькими КТРУ товара
      const seen = new Set<number>()
      const uniq = all.filter((r) => (seen.has(r.lotId) ? false : (seen.add(r.lotId), true)))
      uniq.sort((a, b) => (a.deadlineDaysLeft ?? 1e9) - (b.deadlineDaysLeft ?? 1e9))
      setRows(uniq)
      setErrs([...new Set(res.map((x) => x.err).filter((e): e is string => !!e))])
    })
    return () => {
      alive = false
    }
  }, [products])

  const visible = useMemo(
    () => (rows ?? []).filter((r) => filter === 'all' || r.productId === filter),
    [rows, filter],
  )

  if (products.length === 0) {
    return (
      <div>
        <h1>Закупки</h1>
        <p className="text-muted">
          Сначала добавьте товар на странице <Link href="/smart-ktru/products">«Мои товары»</Link>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1>Закупки</h1>
      <p className="text-muted">Живые государственные закупки, подходящие под ваши товары по КТРУ.</p>

      <div className="seg" style={{ marginBottom: 16 }}>
        <label className="seg-opt">
          <input type="radio" name="feed" checked={filter === 'all'} onChange={() => setFilter('all')} />
          Все
        </label>
        {products.map((p) => (
          <label key={p.id} className="seg-opt">
            <input type="radio" name="feed" checked={filter === p.id} onChange={() => setFilter(p.id)} />
            {p.name}
          </label>
        ))}
      </div>

      {errs.map((e, i) => (
        <div key={i} className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>{e}</div>
      ))}

      {rows === null && <p className="text-muted">Ищу живые закупки по КТРУ…</p>}
      {rows !== null && visible.length === 0 && (
        <p className="text-muted">Живых закупок по этому фильтру сейчас нет.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {visible.map((l) => {
          const cached = analysisCache[l.lotId]?.result
          const opp = cached ? opportunityFromAnalysis(cached, l.ktru) : null
          const urgent = l.deadlineDaysLeft != null && l.deadlineDaysLeft <= 3 && !l.deadlinePassed
          return (
            <Card key={l.lotId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div className="card-kicker">{l.productName}</div>
                  <div className="card-title">{l.nameRu ?? 'Лот'}</div>
                </div>
                {opp?.decision ? (
                  <VerdictTag verdict={opp.decision.verdict} />
                ) : (
                  <span className="tag tag-neutral">Анализ не выполнен</span>
                )}
              </div>

              <div className="card-meta">
                {l.customerNameRu ?? '—'} · {l.region ?? 'регион не указан'}
              </div>
              <div className="card-meta">
                {l.ktru ? `КТРУ ${l.ktru}` : ''} · {l.count ?? '—'} × {fmtMoney(l.amount)}
              </div>
              <div style={{ fontSize: 13 }}>
                <b style={{ color: urgent ? C.accent : undefined }}>
                  Срок подачи: {l.deadlinePassed ? 'истёк' : l.deadlineDaysLeft != null ? `${l.deadlineDaysLeft} дн.` : '—'}
                </b>
              </div>

              {opp?.compatibility ? (
                <div style={{ borderTop: '1px solid rgba(32,30,29,0.35)', borderBottom: '1px solid rgba(32,30,29,0.35)', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20 }}>
                      {opp.compatibility.compatibilityPercent}%
                    </span>
                    <span className="text-muted" style={{ fontSize: 12 }}>совместимость · индекс {opp.decision?.score}/100</span>
                  </div>
                  <div style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span><Check size={12} style={{ verticalAlign: '-2px' }} /> {opp.compatibility.matched} совпадений</span>
                    <span><X size={12} style={{ verticalAlign: '-2px' }} /> {opp.compatibility.mismatched} несоответствий</span>
                    <span><Clock size={12} style={{ verticalAlign: '-2px' }} /> {opp.compatibility.pending} требуют проверки</span>
                    {opp.compatibility.critical > 0 && (
                      <span style={{ color: C.accent }}><AlertTriangle size={12} style={{ verticalAlign: '-2px' }} /> {opp.compatibility.critical} критич.</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {opp.economics?.available
                      ? <>Маржа: <b>{opp.economics.marginPercent}%</b> · Прибыль: <b>{fmtMoney(opp.economics.grossProfit)}</b></>
                      : <span className="text-muted">{opp.economics?.unavailableReason ?? 'экономика не рассчитана'}</span>}
                  </div>
                </div>
              ) : (
                <div style={{ borderTop: '1px solid rgba(32,30,29,0.35)', borderBottom: '1px solid rgba(32,30,29,0.35)', padding: '8px 0', fontSize: 13 }} className="text-muted">
                  Анализ ТЗ не выполнен — совместимость, экономика и рекомендация пока неизвестны.
                </div>
              )}

              {opp?.decision && <p className="text-muted" style={{ fontSize: 13 }}>{opp.decision.summary}</p>}

              <Link className="btn btn-primary btn-block" href={`/smart-ktru/lot/${l.lotId}?product=${l.productId}&ktru=${l.ktru}`}>
                {opp ? 'Открыть закупку →' : 'Анализировать ТЗ →'}
              </Link>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export default function ProcurementsPage() {
  return (
    <Suspense fallback={null}>
      <FeedInner />
    </Suspense>
  )
}
