'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSmartKtru } from '@/lib/smart-ktru/store'
import { opportunityFromAnalysis, opportunityFromLot, type OpportunitySummary } from '@/lib/smart-ktru/opportunity'
import { C, VerdictTag, fmtMoney } from '@/components/smart-ktru/kit'

interface LotRow {
  lotId: number
  productId: string
  productName: string
  ktru: string
  nameRu: string | null
  amount: number | null
  count: number | null
  customerNameRu: string | null
  region: string | null
  endDate: string | null
  deadlineDaysLeft: number | null
  deadlinePassed: boolean
}

type StatusFilter = 'all' | 'fits' | 'review' | 'profit' | 'urgent'
type SortKey = 'best' | 'profit' | 'deadline'

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'fits', label: 'Подходят' },
  { id: 'review', label: 'Проверить' },
  { id: 'profit', label: 'Есть прибыль' },
  { id: 'urgent', label: 'Срочно' },
]
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'best', label: 'Лучшие' },
  { id: 'profit', label: 'Больше прибыли' },
  { id: 'deadline', label: 'Скорее заканчиваются' },
]

function FeedInner() {
  const params = useSearchParams()
  const preselect = params.get('product')
  const fParam = params.get('f') as StatusFilter | null
  const products = useSmartKtru((s) => s.products)
  const analysisCache = useSmartKtru((s) => s.analysisCache)

  const [rows, setRows] = useState<LotRow[] | null>(null)
  const [productFilter, setProductFilter] = useState<string>(preselect ?? 'all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(fParam && FILTERS.some((f) => f.id === fParam) ? fParam : 'all')
  const [sort, setSort] = useState<SortKey>('best')
  const [errs, setErrs] = useState<string[]>([])

  useEffect(() => {
    if (products.length === 0) return
    let alive = true
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
      const seen = new Set<number>()
      const uniq = all.filter((r) => (seen.has(r.lotId) ? false : (seen.add(r.lotId), true)))
      setRows(uniq)
      setErrs([...new Set(res.map((x) => x.err).filter((e): e is string => !!e))])
    })
    return () => { alive = false }
  }, [products])

  // строка → Opportunity (из кэша анализа, если есть)
  const opps = useMemo(() => {
    return (rows ?? []).map((l) => {
      const cached = analysisCache[l.lotId]?.result
      const opp: OpportunitySummary = cached
        ? opportunityFromAnalysis(cached, l.ktru)
        : opportunityFromLot({
            lotId: l.lotId, nameRu: l.nameRu, customerNameRu: l.customerNameRu, region: l.region,
            count: l.count, amount: l.amount, endDate: l.endDate,
            deadlineDaysLeft: l.deadlineDaysLeft, deadlinePassed: l.deadlinePassed, ktru: l.ktru,
          })
      return { l, opp }
    })
  }, [rows, analysisCache])

  const kpi = useMemo(() => {
    const an = opps.filter((x) => x.opp.decision)
    return {
      all: opps.length,
      fits: an.filter((x) => x.opp.decision!.verdict === 'recommend').length,
      review: an.filter((x) => x.opp.decision!.verdict === 'consider').length,
      no: an.filter((x) => ['unlikely', 'unsuitable'].includes(x.opp.decision!.verdict)).length,
    }
  }, [opps])

  const visible = useMemo(() => {
    let arr = opps.filter(({ l }) => productFilter === 'all' || l.productId === productFilter)
    if (statusFilter === 'fits') arr = arr.filter(({ opp }) => opp.decision?.verdict === 'recommend')
    else if (statusFilter === 'review') arr = arr.filter(({ opp }) => opp.decision?.verdict === 'consider')
    else if (statusFilter === 'profit') arr = arr.filter(({ opp }) => opp.economics?.available && (opp.economics.grossProfit ?? 0) > 0)
    else if (statusFilter === 'urgent') arr = arr.filter(({ l }) => !l.deadlinePassed && l.deadlineDaysLeft != null && l.deadlineDaysLeft <= 5)

    const s = [...arr]
    if (sort === 'best') s.sort((a, b) => (b.opp.compatibility?.compatibilityPercent ?? b.opp.decision?.score ?? -1) - (a.opp.compatibility?.compatibilityPercent ?? a.opp.decision?.score ?? -1))
    else if (sort === 'profit') s.sort((a, b) => (b.opp.economics?.grossProfit ?? -1) - (a.opp.economics?.grossProfit ?? -1))
    else if (sort === 'deadline') s.sort((a, b) => (a.l.deadlineDaysLeft ?? 1e9) - (b.l.deadlineDaysLeft ?? 1e9))
    return s
  }, [opps, productFilter, statusFilter, sort])

  if (products.length === 0) {
    return (
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <h1>Возможности</h1>
        <p className="text-muted">
          Сначала добавьте товар на странице <Link href="/smart-ktru/products">«Мои товары»</Link>.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>Возможности</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }} className="skt-four-col">
        {([['Все', kpi.all], ['Подходят', kpi.fits], ['Проверить', kpi.review], ['Не подходят', kpi.no]] as const).map(([label, v]) => (
          <div key={label} className="card elev-sm">
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, lineHeight: 1 }}>{rows == null ? '…' : v}</div>
            <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)', marginTop: 0 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`btn ${statusFilter === f.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="seg">
          {SORTS.map((so) => (
            <label key={so.id} className="seg-opt">
              <input type="radio" name="sort" checked={sort === so.id} onChange={() => setSort(so.id)} />
              {so.label}
            </label>
          ))}
        </div>
      </div>

      {products.length > 1 && (
        <div className="seg" style={{ marginBottom: 16 }}>
          <label className="seg-opt">
            <input type="radio" name="feedp" checked={productFilter === 'all'} onChange={() => setProductFilter('all')} />
            Все товары
          </label>
          {products.map((p) => (
            <label key={p.id} className="seg-opt">
              <input type="radio" name="feedp" checked={productFilter === p.id} onChange={() => setProductFilter(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
      )}

      {errs.map((e, i) => (
        <div key={i} className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>{e}</div>
      ))}
      {rows === null && <p className="text-muted">Ищу живые закупки по КТРУ…</p>}
      {rows !== null && visible.length === 0 && (
        <p className="text-muted">По этому фильтру закупок сейчас нет.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {visible.map(({ l, opp }) => {
          const urgent = l.deadlineDaysLeft != null && l.deadlineDaysLeft <= 3 && !l.deadlinePassed
          const pct = opp.compatibility?.compatibilityPercent ?? null
          return (
            <div key={l.lotId} className="card elev-sm" style={{ gap: 10 }}>
              <div>
                <div className="card-kicker">{l.productName}</div>
                <div className="card-title">{l.nameRu ?? 'Лот'}</div>
                <div className="card-meta">{l.customerNameRu ?? '—'}{l.region ? ` · ${l.region}` : ''}</div>
              </div>

              {pct != null ? (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 40, lineHeight: 1 }}>{pct}%</div>
                  <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>Совместимость</div>
                  <div style={{ height: 12, background: 'var(--color-neutral-200)', overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ height: '100%', background: 'var(--color-accent)', width: `${pct}%` }} />
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13 }} className="text-muted">Анализ ТЗ не выполнен</div>
              )}

              {opp.compatibility && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 14, fontSize: 13 }}>
                  <span>✓ {opp.compatibility.matched}</span>
                  <span>✗ {opp.compatibility.mismatched}</span>
                  <span>? {opp.compatibility.pending}</span>
                  {opp.compatibility.critical > 0 && <span style={{ color: C.accent }}>⚠ {opp.compatibility.critical}</span>}
                </div>
              )}

              <div className="hr" />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8 }}>
                <div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Цена закупки</div>
                  <b>{fmtMoney(l.amount)}</b>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="text-muted" style={{ fontSize: 11 }}>Прибыль / маржа</div>
                  {opp.economics?.available
                    ? <b>{fmtMoney(opp.economics.grossProfit)} · {opp.economics.marginPercent}%</b>
                    : <span className="text-muted">—</span>}
                </div>
              </div>

              <div className="text-muted" style={{ fontSize: 12, textAlign: 'center' }}>
                <b style={{ color: urgent ? C.accent : undefined }}>
                  {l.deadlinePassed ? 'срок подачи истёк' : l.deadlineDaysLeft != null ? `${l.deadlineDaysLeft} дн. до подачи` : 'срок —'}
                </b>
              </div>

              <Link
                className={`btn btn-block ${opp.decision ? 'btn-secondary' : 'btn-primary'}`}
                style={{ textAlign: 'center', justifyContent: 'center' }}
                href={`/smart-ktru/lot/${l.lotId}?product=${l.productId}&ktru=${l.ktru}`}
              >
                {opp.decision ? <><VerdictTag verdict={opp.decision.verdict} /> →</> : 'Анализировать ТЗ →'}
              </Link>
            </div>
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
