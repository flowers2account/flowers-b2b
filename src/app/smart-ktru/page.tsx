'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Sparkles, Clock } from 'lucide-react'
import { useSmartKtru } from '@/lib/smart-ktru/store'
import { opportunityFromAnalysis } from '@/lib/smart-ktru/opportunity'
import { VerdictTag, fmtMoney } from '@/components/smart-ktru/kit'

const fmtMln = (n: number) => (n >= 1e6 ? `₸ ${(n / 1e6).toFixed(1).replace('.0', '')} млн` : fmtMoney(n))

interface ProdAgg {
  productId: string
  productName: string
  liveLots: number
  volume: number
  urgent: number
  ktru: string | null
}

function KpiCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card elev-sm">
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, lineHeight: 1, fontSize: 44 }}>{value}</div>
      <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 4 }}>
        {label}
      </div>
    </div>
  )
}
function BarRow({ label, count, pct }: { label: string; count: number; pct: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span><b>{count}</b>
      </div>
      <div style={{ height: 12, background: 'var(--color-neutral-200)', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--color-accent)', width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  )
}

export default function OverviewPage() {
  const products = useSmartKtru((s) => s.products)
  const analysisCache = useSmartKtru((s) => s.analysisCache)
  const ensureDemoSeed = useSmartKtru((s) => s.ensureDemoSeed)

  const [aggFetched, setAggFetched] = useState<ProdAgg[] | null>(null)
  const agg = products.length === 0 ? [] : aggFetched

  useEffect(() => {
    ensureDemoSeed()
  }, [ensureDemoSeed])

  useEffect(() => {
    if (products.length === 0) return
    let alive = true
    Promise.all(
      products.map(async (p): Promise<ProdAgg> => {
        const code = p.ktruCodes?.[0]
        const qs = code ? `ktru=${encodeURIComponent(code)}` : `q=${encodeURIComponent(p.name)}`
        try {
          const r = await fetch(`/api/smart-ktru/procurements?${qs}`)
          const j = r.ok ? await r.json() : null
          const lots: { amount?: number; deadlineDaysLeft?: number | null; deadlinePassed?: boolean }[] = j?.lots ?? []
          return {
            productId: p.id,
            productName: p.name,
            ktru: code ?? null,
            liveLots: j?.counts?.liveLots ?? lots.length,
            volume: lots.reduce((a, l) => a + (l.amount ?? 0), 0),
            urgent: lots.filter((l) => !l.deadlinePassed && l.deadlineDaysLeft != null && l.deadlineDaysLeft <= 3).length,
          }
        } catch {
          return { productId: p.id, productName: p.name, ktru: code ?? null, liveLots: 0, volume: 0, urgent: 0 }
        }
      }),
    ).then((res) => { if (alive) setAggFetched(res) })
    return () => { alive = false }
  }, [products])

  // проанализированные закупки — только реальные результаты из кэша
  const analyzed = useMemo(
    () => Object.values(analysisCache).map((c) => {
      const code = products.find((p) => p.id === c.result.productId)?.ktruCodes?.[0] ?? null
      return opportunityFromAnalysis(c.result, code)
    }),
    [analysisCache, products],
  )
  const byVerdict = useMemo(() => {
    const g = { recommend: 0, consider: 0, unlikely: 0, unsuitable: 0 }
    analyzed.forEach((o) => { if (o.decision) g[o.decision.verdict] += 1 })
    return g
  }, [analyzed])
  const fits = byVerdict.recommend
  const review = byVerdict.consider
  const no = byVerdict.unlikely + byVerdict.unsuitable

  const potentialProfit = useMemo(
    () => analyzed.reduce((a, o) => a + (o.economics?.available ? (o.economics.grossProfit ?? 0) : 0), 0),
    [analyzed],
  )
  const hasProfit = analyzed.some((o) => o.economics?.available && (o.economics.grossProfit ?? 0) > 0)

  const totalLots = (agg ?? []).reduce((a, p) => a + p.liveLots, 0)
  const totalVolume = (agg ?? []).reduce((a, p) => a + p.volume, 0)
  const totalUrgent = (agg ?? []).reduce((a, p) => a + p.urgent, 0)
  const bestAnalyzed = analyzed.filter((o) => o.decision && o.decision.score >= 85).length

  const top = useMemo(
    () => [...analyzed]
      .filter((o) => o.decision)
      .sort((a, b) => (b.decision!.score) - (a.decision!.score))
      .slice(0, 5),
    [analyzed],
  )
  const maxVolProd = Math.max(1, ...(agg ?? []).map((p) => p.volume))

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>Обзор</h1>

      {products.length === 0 ? (
        <p className="text-muted">
          Добавьте товар на странице <Link href="/smart-ktru/products">«Мои товары»</Link> — здесь появится сводка возможностей.
        </p>
      ) : (
        <>
          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
            <KpiCard value={agg == null ? '…' : totalLots} label="Возможности" />
            <KpiCard value={agg == null ? '…' : fmtMln(totalVolume)} label="Объём рынка" />
            <KpiCard value={review} label="Стоит проверить" />
            {hasProfit && <KpiCard value={fmtMln(potentialProfit)} label="Потенциальная прибыль" />}
          </div>

          {/* распределение + объём по товарам */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }} className="skt-two-col">
            <div className="card elev-sm">
              <h4 style={{ marginTop: 0 }}>Возможности по статусу</h4>
              {analyzed.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>
                  Пока ни одна закупка не проанализирована. Откройте закупку и запустите анализ ТЗ —
                  распределение появится здесь.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <BarRow label="Подходят" count={fits} pct={(fits / Math.max(1, analyzed.length)) * 100} />
                  <BarRow label="Проверить" count={review} pct={(review / Math.max(1, analyzed.length)) * 100} />
                  <BarRow label="Не подходят" count={no} pct={(no / Math.max(1, analyzed.length)) * 100} />
                </div>
              )}
            </div>
            <div className="card elev-sm">
              <h4 style={{ marginTop: 0 }}>Объём рынка по товарам</h4>
              {agg == null ? (
                <p className="text-muted" style={{ fontSize: 13 }}>Считаем…</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {agg.map((p) => (
                    <div key={p.productId}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.productName}</span>
                        <b>{fmtMln(p.volume)}</b>
                      </div>
                      <div style={{ height: 12, background: 'var(--color-neutral-200)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--color-accent)', width: `${(p.volume / maxVolProd) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
                Динамика спроса появится по мере накопления исторических данных.
              </p>
            </div>
          </div>

          {/* Сегодня */}
          <h4>Сегодня</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }} className="skt-three-col">
            <Link className="card elev-sm" href="/smart-ktru/procurements?f=urgent" style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 34, lineHeight: 1 }}>{agg == null ? '…' : totalUrgent}</div>
              <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 2 }}>Срочно</div>
              <p className="card-body" style={{ margin: '6px 0 0', display: 'flex', gap: 6, alignItems: 'center' }}><Clock size={13} /> Срок подачи ≤ 3 дней</p>
            </Link>
            <Link className="card elev-sm" href="/smart-ktru/procurements" style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 34, lineHeight: 1 }}>{agg == null ? '…' : totalLots}</div>
              <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 2 }}>Все</div>
              <p className="card-body" style={{ margin: '6px 0 0' }}>Живых закупок по вашим товарам</p>
            </Link>
            <Link className="card elev-sm" href="/smart-ktru/procurements?f=fits" style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 34, lineHeight: 1 }}>{bestAnalyzed}</div>
              <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 2 }}>Лучшие</div>
              <p className="card-body" style={{ margin: '6px 0 0', display: 'flex', gap: 6, alignItems: 'center' }}><Sparkles size={13} /> Индекс участия ≥ 85</p>
            </Link>
          </div>

          {/* Лучшие возможности */}
          {top.length > 0 && (
            <>
              <h4>Лучшие возможности</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
                {top.map((o) => (
                  <Link
                    key={o.lotId}
                    href={`/smart-ktru/lot/${o.lotId}?product=${o.productId ?? ''}${o.ktruCode ? `&ktru=${o.ktruCode}` : ''}`}
                    className="card elev-sm"
                    style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center', textAlign: 'center', gap: 10 }}
                  >
                    <div className="card-title" style={{ textAlign: 'center' }}>{o.title}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 40, lineHeight: 1 }}>
                      {o.compatibility?.compatibilityPercent ?? o.decision?.score}%
                    </div>
                    <div style={{ height: 12, background: 'var(--color-neutral-200)', overflow: 'hidden', width: '100%' }}>
                      <div style={{ height: '100%', background: 'var(--color-accent)', width: `${o.compatibility?.compatibilityPercent ?? o.decision?.score ?? 0}%` }} />
                    </div>
                    {o.economics?.available && (
                      <div style={{ fontSize: 13 }}><b>{fmtMoney(o.economics.grossProfit)}</b> прибыль</div>
                    )}
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {o.deadlinePassed ? 'срок истёк' : o.deadlineDaysLeft != null ? `${o.deadlineDaysLeft} дн. до подачи` : '—'}
                    </div>
                    {o.decision && <VerdictTag verdict={o.decision.verdict} />}
                  </Link>
                ))}
              </div>
            </>
          )}

          {analyzed.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, marginTop: 24, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <AlertTriangle size={14} style={{ flex: 'none', marginTop: 2 }} />
              Прибыль, маржа и распределение считаются только по реально проанализированным закупкам.
              Откройте вкладку «Возможности» и запустите анализ интересующих ТЗ.
            </p>
          )}
        </>
      )}
    </div>
  )
}
