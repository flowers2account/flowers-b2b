'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSmartKtru } from '@/lib/smart-ktru/store'
import { effectiveKtruProfile } from '@/lib/smart-ktru/ktru-profile'
import { aggregateOpportunities, type FetchedByCode, type AggLot } from '@/lib/smart-ktru/opportunity-agg'
import type { ProcurementOpportunity, OpportunityMatchReason } from '@/lib/smart-ktru/types'
import { C, fmtMoney } from '@/components/smart-ktru/kit'

type SortKey = 'best' | 'products' | 'deadline'
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'best', label: 'Лучшие' },
  { id: 'products', label: 'Больше товаров' },
  { id: 'deadline', label: 'Скорее заканчиваются' },
]

const REASON_LABEL: Record<OpportunityMatchReason, string> = {
  primary_ktru_match: 'Основной КТРУ',
  alternative_ktru_match: 'Альтернативный КТРУ',
  group_primary_ktru_match: 'Основной КТРУ группы',
  group_alternative_ktru_match: 'Альтернативный КТРУ группы',
  text_match: 'Текстовое совпадение',
}

function FeedInner() {
  const params = useSearchParams()
  const preselectProduct = params.get('product')
  const preselectGroup = params.get('group')

  const products = useSmartKtru((s) => s.products)
  const groups = useSmartKtru((s) => s.groups)

  const [opps, setOpps] = useState<ProcurementOpportunity[] | null>(null)
  const [errs, setErrs] = useState<string[]>([])
  const [sort, setSort] = useState<SortKey>('best')
  const [scope, setScope] = useState<'all' | 'group' | 'product'>(
    preselectGroup ? 'group' : preselectProduct ? 'product' : 'all',
  )
  const [scopeGroup, setScopeGroup] = useState<string>(preselectGroup ?? groups[0]?.id ?? '')
  const [scopeProduct, setScopeProduct] = useState<string>(preselectProduct ?? products[0]?.id ?? '')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const nameById = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products])

  // ── фетч закупок по УНИКАЛЬНЫМ effective-кодам, затем агрегация ──
  useEffect(() => {
    if (products.length === 0) return
    let alive = true

    // code → [{role, origin, productIds}]  (один код может быть primary для p1 и alt/group для p2)
    const meta = new Map<string, { role: 'primary' | 'alternative'; origin: 'product' | 'group'; productIds: Set<string> }>()
    for (const p of products) {
      const grp = p.groupId ? groups.find((g) => g.id === p.groupId) : undefined
      for (const e of effectiveKtruProfile(p, grp).all) {
        const key = `${e.code}|${e.role}|${e.origin}`
        let m = meta.get(key)
        if (!m) { m = { role: e.role, origin: e.origin, productIds: new Set() }; meta.set(key, m) }
        m.productIds.add(p.id)
      }
    }
    const codes = [...new Set([...meta.keys()].map((k) => k.split('|')[0]))]

    Promise.all(
      codes.map(async (code) => {
        try {
          const r = await fetch(`/api/smart-ktru/procurements?ktru=${encodeURIComponent(code)}`)
          const j = await r.json()
          if (!r.ok) return { code, err: (j?.error as string) ?? 'ошибка', lots: [] as AggLot[] }
          const lots: AggLot[] = ((j.lots ?? []) as Record<string, unknown>[]).map((l) => ({
            lotId: l.lotId as number,
            nameRu: (l.nameRu as string | null) ?? null,
            amount: (l.amount as number | null) ?? null,
            count: (l.count as number | null) ?? null,
            customerNameRu: (l.customerNameRu as string | null) ?? null,
            region: (l.region as string | null) ?? null,
            endDate: (l.endDate as string | null) ?? null,
            deadlineDaysLeft: (l.deadlineDaysLeft as number | null) ?? null,
            deadlinePassed: !!l.deadlinePassed,
            trdBuyNumberAnno: (l.trdBuyNumberAnno as string | null) ?? null,
          }))
          return { code, err: null as string | null, lots }
        } catch (e) {
          return { code, err: String(e), lots: [] as AggLot[] }
        }
      }),
    ).then((res) => {
      if (!alive) return
      const lotsByCode = new Map(res.map((r) => [r.code, r.lots]))
      const fetched: FetchedByCode[] = []
      for (const [key, m] of meta) {
        const code = key.split('|')[0]
        fetched.push({ code, role: m.role, origin: m.origin, productIds: [...m.productIds], lots: lotsByCode.get(code) ?? [] })
      }
      const agg = aggregateOpportunities(
        fetched,
        products.map((p) => ({ id: p.id, name: p.name, groupId: p.groupId })),
      )
      setOpps(agg)
      setErrs([...new Set(res.map((r) => (r.err ? `${r.code}: ${r.err}` : '')).filter(Boolean))])
    })
    return () => { alive = false }
  }, [products, groups])

  const visible = useMemo(() => {
    let arr = opps ?? []
    if (scope === 'group' && scopeGroup) arr = arr.filter((o) => o.matchedProductGroupIds.includes(scopeGroup))
    else if (scope === 'product' && scopeProduct) arr = arr.filter((o) => o.matchedProductIds.includes(scopeProduct))
    const s = [...arr]
    if (sort === 'best') s.sort((a, b) => b.matchScore - a.matchScore || b.matchedProductIds.length - a.matchedProductIds.length)
    else if (sort === 'products') s.sort((a, b) => b.matchedProductIds.length - a.matchedProductIds.length)
    else s.sort((a, b) => (a.lot.deadlineDaysLeft ?? 1e9) - (b.lot.deadlineDaysLeft ?? 1e9))
    return s
  }, [opps, scope, scopeGroup, scopeProduct, sort])

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

  const totalProductsMatched = new Set(visible.flatMap((o) => o.matchedProductIds)).size

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 6 }}>Возможности</h1>
      <p className="text-muted" style={{ marginTop: 0 }}>
        {opps == null
          ? 'Ищу живые закупки по КТРУ-профилям товаров…'
          : `Найдено ${visible.length} ${plural(visible.length, 'возможность', 'возможности', 'возможностей')} · ${totalProductsMatched} ${plural(totalProductsMatched, 'товар подходит', 'товара подходят', 'товаров подходят')}`}
      </p>
      <div className="hr" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, margin: '16px 0' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="text-muted" style={{ fontSize: 13 }}>Подходит:</span>
          <button className={`btn ${scope === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScope('all')}>Все товары</button>
          {groups.length > 0 && (
            <>
              <button className={`btn ${scope === 'group' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScope('group')}>Группа</button>
              {scope === 'group' && (
                <select className="input" style={{ width: 'auto' }} value={scopeGroup} onChange={(e) => setScopeGroup(e.target.value)}>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
            </>
          )}
          <button className={`btn ${scope === 'product' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScope('product')}>Товар</button>
          {scope === 'product' && (
            <select className="input" style={{ width: 'auto' }} value={scopeProduct} onChange={(e) => setScopeProduct(e.target.value)}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
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

      {errs.map((e, i) => <div key={i} className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>{e}</div>)}
      {opps != null && visible.length === 0 && <p className="text-muted">По этому фильтру закупок сейчас нет.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {visible.map((o) => {
          const isOpen = expanded.has(o.lotId)
          const names = o.matchedProductIds.map((pid) => nameById.get(pid) ?? pid)
          const shown = isOpen ? names : names.slice(0, 4)
          const topCode = o.matchedKtru[0]?.code ?? o.procurementKtruCodes[0]
          const topProduct = o.matchedProductIds[0]
          const urgent = o.lot.deadlineDaysLeft != null && o.lot.deadlineDaysLeft <= 3 && !o.lot.deadlinePassed
          return (
            <div key={o.lotId} className="card elev-sm" style={{ gap: 10 }}>
              <div>
                <div className="card-title">{o.lot.nameRu ?? 'Лот'}</div>
                <div className="card-meta">{o.lot.customerNameRu ?? '—'}{o.lot.region ? ` · ${o.lot.region}` : ''}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 34, lineHeight: 1 }}>{o.matchedProductIds.length}</div>
                <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>
                  {plural(o.matchedProductIds.length, 'товар подходит', 'товара подходят', 'товаров подходят')}
                </div>
                <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-heading)', fontSize: 22 }}>{Math.round(o.matchScore * 100)}%</div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {o.matchReasons.map((r) => (
                  <span key={r} className="tag tag-outline" style={{ fontSize: 11 }}>{REASON_LABEL[r]}</span>
                ))}
              </div>

              <div style={{ fontSize: 12 }} className="text-muted">
                КТРУ закупки: {o.procurementKtruCodes.map((c) => {
                  const d = o.matchedKtru.find((m) => m.code === c)
                  return (
                    <span key={c} style={{ marginRight: 8 }}>
                      <b style={{ fontFamily: 'ui-monospace, monospace' }}>{c}</b>
                      {d ? ` — ${d.origin === 'group' ? 'КТРУ группы, ' : ''}${d.role === 'primary' ? 'основной' : 'альтернативный'}` : ''}
                    </span>
                  )
                })}
              </div>

              <div style={{ fontSize: 13 }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 2 }}>Подходящие товары</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {shown.map((n) => <li key={n}>{n}</li>)}
                </ul>
                {names.length > 4 && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, paddingInline: 0 }}
                    onClick={() => setExpanded((s) => { const x = new Set(s); if (x.has(o.lotId)) x.delete(o.lotId); else x.add(o.lotId); return x })}>
                    {isOpen ? 'Свернуть' : `Показать все (${names.length})`}
                  </button>
                )}
              </div>

              <div className="hr" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Цена закупки</div>
                  <b>{fmtMoney(o.lot.amount)}</b>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="text-muted" style={{ fontSize: 11 }}>Срок подачи</div>
                  <b style={{ color: urgent ? C.accent : undefined }}>
                    {o.lot.deadlinePassed ? 'истёк' : o.lot.deadlineDaysLeft != null ? `${o.lot.deadlineDaysLeft} дн.` : '—'}
                  </b>
                </div>
              </div>

              <Link
                className="btn btn-primary btn-block"
                style={{ textAlign: 'center', justifyContent: 'center' }}
                href={`/smart-ktru/lot/${o.lotId}?product=${topProduct}&ktru=${topCode}`}
              >
                Анализировать ТЗ →
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export default function ProcurementsPage() {
  return (
    <Suspense fallback={null}>
      <FeedInner />
    </Suspense>
  )
}
