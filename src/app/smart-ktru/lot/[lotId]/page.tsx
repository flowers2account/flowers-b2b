'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Check, X, Clock, AlertTriangle, CheckCircle2, FileText, Loader2,
  ShieldCheck, ShieldAlert, HelpCircle, Sparkles, Pencil, Flag, Trash2,
  Bookmark, Share2, ExternalLink, Package, FileSearch, RefreshCw,
} from 'lucide-react'
import { useSmartKtru } from '@/lib/smart-ktru/store'
import type { AnalysisResult } from '@/lib/smart-ktru/types'
import { opportunityFromAnalysis, isAnalysisStale } from '@/lib/smart-ktru/opportunity'
import type { OppRequirementRow } from '@/lib/smart-ktru/opportunity'
import {
  C, Card, Tabs, BreakdownBar, VerdictTag, Btn, Dialog, Divider,
  fmtMoney, fmtPct, fmtDate,
} from '@/components/smart-ktru/kit'

const TYPE_LABEL: Record<string, string> = {
  exact: 'точное значение', min: 'минимум', max: 'максимум', range: 'диапазон',
  text: 'текст / список', document: 'документ', presence: 'наличие',
}
const CONF: Record<string, { label: string; Icon: typeof ShieldCheck }> = {
  high: { label: 'высокая', Icon: ShieldCheck },
  medium: { label: 'средняя', Icon: ShieldAlert },
  low: { label: 'низкая', Icon: HelpCircle },
  none: { label: 'недостаточно данных', Icon: HelpCircle },
}
type ReqStatus = 'ai' | 'confirmed' | 'edited' | 'rejected'
const STATUS_META: Record<ReqStatus, { label: string; Icon: typeof Sparkles }> = {
  ai: { label: 'AI определил', Icon: Sparkles },
  confirmed: { label: 'Проверено', Icon: Check },
  edited: { label: 'Изменено', Icon: Pencil },
  rejected: { label: 'Неверно', Icon: Flag },
}

const STAGES = [
  'Получаем техническую спецификацию',
  'Извлекаем требования (AI)',
  'Сравниваем с профилем товара',
  'Рассчитываем экономику и рейтинг',
]

interface LotMeta {
  nameRu: string | null
  customerNameRu: string | null
  region: string | null
  amount: number | null
  count: number | null
  endDate: string | null
  deadlineDaysLeft: number | null
  deadlinePassed: boolean
  trdBuyNumberAnno: string | null
}


function LotCardInner() {
  const { lotId: lotIdStr } = useParams<{ lotId: string }>()
  const lotId = Number(lotIdStr)
  const params = useSearchParams()
  const productId = params.get('product') ?? ''
  const ktru = params.get('ktru') ?? ''

  const { getProduct, toWork, fromWork, isInWork, cacheAnalysis, getCachedAnalysis } = useSmartKtru()
  const product = getProduct(productId)

  const [res, setRes] = useState<AnalysisResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [started, setStarted] = useState(false)
  const [lotMeta, setLotMeta] = useState<LotMeta | null>(null)
  const [stage, setStage] = useState(0)
  const [tab, setTab] = useState<'overview' | 'ts' | 'compare' | 'econ'>('overview')
  const [pkgOpen, setPkgOpen] = useState(false)
  const [addedMsg, setAddedMsg] = useState(false)

  const [reqStatus, setReqStatus] = useState<Record<number, ReqStatus>>({})
  const [reqValue, setReqValue] = useState<Record<number, string>>({})
  const [editing, setEditing] = useState<number | null>(null)
  const [deleted, setDeleted] = useState<Set<number>>(new Set())
  const [selReq, setSelReq] = useState<number | null>(null)

  const cachedRef = useRef(false)

  // Лёгкие данные закупки для шапки «ещё не анализировали» — без Gemini,
  // тот же endpoint, что и лента.
  useEffect(() => {
    if (!Number.isFinite(lotId) || !ktru) return
    let alive = true
    fetch(`/api/smart-ktru/procurements?ktru=${encodeURIComponent(ktru)}&includePassed=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return
        const l = (j.lots ?? []).find((x: Record<string, unknown>) => x.lotId === lotId)
        if (l) {
          setLotMeta({
            nameRu: (l.nameRu as string) ?? null,
            customerNameRu: (l.customerNameRu as string) ?? null,
            region: (l.region as string) ?? null,
            amount: (l.amount as number) ?? null,
            count: (l.count as number) ?? null,
            endDate: (l.endDate as string) ?? null,
            deadlineDaysLeft: (l.deadlineDaysLeft as number) ?? null,
            deadlinePassed: !!l.deadlinePassed,
            trdBuyNumberAnno: (l.trdBuyNumberAnno as string) ?? null,
          })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [lotId, ktru])

  useEffect(() => {
    if (!product || !Number.isFinite(lotId)) return
    let alive = true
    setRes(null)
    setErr(null)
    setStage(0)

    const cached = getCachedAnalysis(lotId)
    if (cached && reloadKey === 0) {
      cachedRef.current = true
      setRes(cached.result)
      return
    }
    cachedRef.current = false

    // §4/§11: анализ ТЗ (Gemini) запускается ТОЛЬКО по кнопке «Анализировать ТЗ»
    if (!started && reloadKey === 0) return

    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2500)

    fetch('/api/smart-ktru/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId, product, ktruCode: ktru || undefined, taxRatio: 0.03, taxLabel: 'УСН 3%' }),
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return
        if (ok) {
          setRes(j)
          cacheAnalysis(lotId, j)
        } else setErr(j.error ?? 'Не удалось завершить анализ')
      })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => clearInterval(timer))

    return () => {
      alive = false
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId, productId, ktru, reloadKey, started])

  if (!product) {
    return (
      <div className="skt-panel">
        <div className="skt-panel-body text-muted" style={{ textAlign: 'center', padding: 24 }}>
          Товар не найден. Откройте закупку из{' '}
          <Link href="/smart-ktru/products">списка товаров</Link>.
        </div>
      </div>
    )
  }

  if (err) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href={`/smart-ktru/procurements${productId ? `?product=${productId}` : ''}`} className="btn btn-ghost" style={{ marginBottom: 16 }}>
          <ArrowLeft size={14} /> Все закупки
        </Link>
        <h3>Не удалось выполнить анализ</h3>
        <p className="text-muted">{err}</p>
        <p className="text-muted" style={{ fontSize: 12 }}>Профиль товара сохранён — данные не потеряны.</p>
        <Btn variant="primary" onClick={() => setReloadKey((k) => k + 1)}>Повторить</Btn>
      </div>
    )
  }

  const backLink = (
    <Link
      href={`/smart-ktru/procurements${productId ? `?product=${productId}` : ''}`}
      className="btn btn-ghost"
      style={{ marginBottom: 16 }}
    >
      <ArrowLeft size={14} /> Все закупки
    </Link>
  )

  // §11: ТЗ ещё не анализировалось — показываем данные закупки + CTA.
  // (если в кэше есть результат — не мигаем этим экраном, ждём применения res)
  if (!res && !started && !getCachedAnalysis(lotId)) {
    const md = lotMeta
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {backLink}
        <div className="skt-panel" style={{ padding: 0 }}>
          <div style={{ padding: 16 }}>
            <div className="text-muted" style={{ fontSize: 12, letterSpacing: '0.04em' }}>ЗАКУПКА</div>
            <h2 style={{ margin: '4px 0 10px' }}>{md?.nameRu ?? `Лот ${lotId}`}</h2>
            <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 12px', fontSize: 13, margin: 0 }}>
              <dt className="text-muted">Заказчик</dt><dd>{md?.customerNameRu ?? '—'}</dd>
              <dt className="text-muted">Регион</dt><dd>{md?.region ?? 'не указан'}</dd>
              <dt className="text-muted">Количество</dt><dd>{md?.count ?? '—'} {md?.count != null ? 'шт' : ''}</dd>
              <dt className="text-muted">Цена закупки</dt><dd>{fmtMoney(md?.amount)}</dd>
              <dt className="text-muted">КТРУ</dt><dd style={{ fontFamily: 'ui-monospace, monospace' }}>{ktru || '—'}</dd>
              <dt className="text-muted">Срок подачи</dt>
              <dd>{md?.deadlinePassed ? 'срок истёк' : md?.deadlineDaysLeft != null ? `${md.deadlineDaysLeft} дн.` : '—'}</dd>
            </dl>
          </div>
          <Divider />
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <FileSearch size={16} /> <b>ТЗ ещё не анализировалось</b>
            </div>
            <p className="text-muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
              Сравнение вашего товара с требованиями, экономика и рекомендация появятся после разбора
              технической спецификации. Это единственный шаг, использующий AI.
            </p>
            <Btn variant="primary" onClick={() => setStarted(true)}>Анализировать ТЗ</Btn>
          </div>
        </div>
      </div>
    )
  }

  if (!res) {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', paddingTop: 24 }}>
        {backLink}
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 className="spin" size={18} /> Анализируем закупку
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {STAGES.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              {i < stage ? (
                <Check size={16} style={{ color: C.accent }} />
              ) : i === stage ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <span style={{ width: 16, height: 16, border: '1px solid rgba(32,30,29,0.35)', display: 'inline-block' }} />
              )}
              <span className={i > stage ? 'text-muted' : ''}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const f = res.facts
  const s = res.score
  const m = res.match
  const spec = res.spec
  const opp = opportunityFromAnalysis(res, ktru || null)
  const inWork = isInWork(lotId)
  const urgent = f.deadlineDaysLeft != null && !f.deadlinePassed && f.deadlineDaysLeft <= 3
  const stale = isAnalysisStale(res.generatedAt, product.updatedAt)

  const liveReqs = (spec?.characteristics ?? [])
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !deleted.has(i))
  const pendingCount = m?.pending ?? 0

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      {backLink}

      {stale && (
        <div className="tag tag-outline" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px' }}>
          <RefreshCw size={13} />
          Профиль товара изменён после этого анализа.
          <button className="btn btn-ghost" style={{ paddingInline: 4, fontSize: 12 }} onClick={() => { setStarted(true); setReloadKey((k) => k + 1) }}>
            Пересчитать соответствие
          </button>
        </div>
      )}

      <div
        className="skt-deal-header"
        style={{
          display: 'grid', gridTemplateColumns: '180px 1fr 260px', gap: 24,
          paddingBottom: 16, borderBottom: '2px solid rgba(32,30,29,0.35)',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 56, lineHeight: 1 }}>
            {s.participationIndex}
          </div>
          <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>из 100</div>
          <VerdictTag verdict={s.verdict} />
        </div>
        <div>
          <h2 style={{ marginBottom: 6 }}>{f.nameRu ?? 'Лот'}</h2>
          <p style={{ maxWidth: '56ch' }}>{s.summary}</p>
          {pendingCount > 0 && (
            <div className="tag tag-outline" style={{ marginTop: 4 }}>
              <AlertTriangle size={12} /> {pendingCount} требовани{pendingCount === 1 ? 'е требует' : 'й требуют'} проверки
            </div>
          )}
        </div>
        <dl style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '2px solid rgba(32,30,29,0.35)', paddingLeft: 16, margin: 0 }}>
          <div><span className="text-muted">Заказчик</span><br /><b>{f.customerNameRu ?? '—'}</b></div>
          <div><span className="text-muted">Количество</span><br /><b>{f.count ?? '—'} шт</b></div>
          <div><span className="text-muted">Сумма</span><br /><b>{fmtMoney(f.amount)}</b></div>
          <div><span className="text-muted">Регион</span><br /><b>{f.regionLabel}</b></div>
          <div>
            <span className="text-muted">Срок подачи</span><br />
            <b style={{ color: urgent ? C.accent : undefined }}>
              {f.deadlinePassed ? 'срок истёк' : f.deadlineDaysLeft != null ? `${f.deadlineDaysLeft} дн.` : '—'}
            </b>
          </div>
        </dl>
      </div>

      {/* §16 — «за несколько секунд»: совместимость + экономика одной строкой */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline', padding: '12px 0', borderBottom: '1px solid rgba(32,30,29,0.35)' }}>
        <div>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>
            {opp.compatibility ? `${opp.compatibility.compatibilityPercent}%` : '—'}
          </span>{' '}
          <span className="text-muted" style={{ fontSize: 12 }}>совместимость</span>
        </div>
        {opp.compatibility && (
          <div style={{ fontSize: 13, display: 'flex', gap: 12 }}>
            <span><Check size={13} style={{ verticalAlign: '-2px' }} /> {opp.compatibility.matched} совпад.</span>
            <span><X size={13} style={{ verticalAlign: '-2px' }} /> {opp.compatibility.mismatched} несоответ.</span>
            <span><Clock size={13} style={{ verticalAlign: '-2px' }} /> {opp.compatibility.pending} на проверку</span>
            {opp.compatibility.critical > 0 && (
              <span style={{ color: C.accent }}><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> {opp.compatibility.critical} критич.</span>
            )}
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 13 }}>
          {opp.economics?.available ? (
            <>
              <b>Маржа {opp.economics.marginPercent}%</b>
              <span className="text-muted"> · прибыль {fmtMoney(opp.economics.grossProfit)}</span>
            </>
          ) : (
            <span className="text-muted">{opp.economics?.unavailableReason ?? 'экономика не рассчитана'}</span>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Обзор' },
          { id: 'ts', label: 'Разбор ТС' },
          { id: 'compare', label: 'Сравнение' },
          { id: 'econ', label: 'Экономика' },
        ]}
      />

      {tab === 'overview' && (
        <div className="skt-two-col" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24 }}>
          <div>
            <h3>Рейтинг закупки</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {s.factors.map((fa) => <FactorRow key={fa.key} fa={fa} />)}
            </div>
          </div>
          <div>
            <h3>Риски</h3>
            <Card style={{ marginBottom: 24 }}>
              {s.risks.length === 0 || (s.risks.length === 1 && /не обнаружено/i.test(s.risks[0])) ? (
                <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                  <CheckCircle2 size={14} style={{ flex: 'none' }} /> Существенных рисков не обнаружено
                </div>
              ) : (
                s.risks.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'flex-start' }}>
                    <AlertTriangle size={14} style={{ flex: 'none', marginTop: 2 }} /> {r}
                  </div>
                ))
              )}
            </Card>

            <h3>Рекомендация</h3>
            <div style={{ marginBottom: 12 }}><VerdictTag verdict={s.verdict} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '12px 0' }}>
              <div>
                {s.pros.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, marginBottom: 6 }}>
                    <Check size={13} style={{ flex: 'none', marginTop: 2 }} /> {p}
                  </div>
                ))}
              </div>
              <div>
                {s.cons.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, marginBottom: 6 }}>
                    <X size={13} style={{ flex: 'none', marginTop: 2 }} /> {c}
                  </div>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 13 }}>{s.summary}</p>

            <Divider />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {!inWork ? (
                <Btn
                  variant="primary"
                  onClick={() => {
                    toWork({
                      lotId, productId: product.id,
                      lotName: f.nameRu, customerName: f.customerNameRu, amount: f.amount, endDate: f.endDate,
                      verdict: s.verdict, verdictLabel: s.verdictLabel,
                      participationIndex: s.participationIndex, marginRatio: res.economics.marginRatio,
                    })
                    setAddedMsg(true)
                  }}
                >
                  В работу
                </Btn>
              ) : (
                <Btn variant="secondary" onClick={() => { fromWork(lotId); setAddedMsg(false) }}>
                  <Check size={14} /> В работе — убрать
                </Btn>
              )}
              {addedMsg && inWork && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.accent }}>
                  <Check size={14} /> Добавлено в работу — <Link href="/smart-ktru/work">открыть «В работе»</Link>
                </span>
              )}
              <Btn variant="secondary" onClick={() => setPkgOpen(true)}>Скачать пакет</Btn>
              <Btn variant="secondary" icon aria-label="Сохранить"><Bookmark size={15} /></Btn>
              <Btn variant="secondary" icon aria-label="Поделиться"><Share2 size={15} /></Btn>
              {f.buyId && (
                <a
                  className="btn btn-secondary btn-icon"
                  href={`https://goszakup.gov.kz/ru/announce/index/${f.buyId}?tab=lots`}
                  target="_blank" rel="noreferrer" aria-label="Оригинал на портале"
                >
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'ts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <h3>Разбор технической спецификации</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {spec
                ? `${spec.meta.templateRecognized ? 'шаблон распознан' : 'шаблон не распознан'} · извлечено ${spec.meta.extractedCount} · ${spec.meta.method}`
                : 'ТС недоступна'}
            </span>
          </div>

          {!spec || spec.characteristics.length === 0 ? (
            <div>
              <p className="text-muted">
                AI-разбор ограничен: {f.specFile ? 'не удалось разложить требования на таблицу.' : 'к лоту не приложена техническая спецификация.'}
                {res.specText ? ' Ниже — извлечённый текст, сверьте вручную.' : ''}
              </p>
              {res.specText && <pre className="skt-src">{res.specText.slice(0, 6000)}</pre>}
            </div>
          ) : (
            <div className="skt-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {spec.quantity?.value != null && (
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    Кол-во по ТС: <b>{spec.quantity.value}</b> {spec.quantity.unit ?? ''}
                    {spec.delivery?.place ? ` · Место: ${spec.delivery.place}` : ''}
                  </div>
                )}
                {liveReqs.map(({ r, i }) => {
                  const st = reqStatus[i] ?? 'ai'
                  const SM = STATUS_META[st]
                  const val = reqValue[i] ?? r.value ?? '—'
                  return (
                    <div
                      key={i}
                      onClick={() => setSelReq(i)}
                      style={{
                        border: `1px solid ${selReq === i ? C.accent : 'rgba(32,30,29,0.35)'}`,
                        background: selReq === i ? '#fff2ef' : undefined,
                        padding: 10, fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <b>{r.name}</b>
                        <span className="tag tag-neutral"><SM.Icon size={11} /> {SM.label}</span>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        {editing === i ? (
                          <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <input className="input" style={{ minHeight: 28, width: 160 }} defaultValue={val} id={`edit-${i}`} />
                            <button
                              className="btn btn-secondary" style={{ minHeight: 28 }}
                              onClick={() => {
                                const el = document.getElementById(`edit-${i}`) as HTMLInputElement
                                setReqValue((v) => ({ ...v, [i]: el.value }))
                                setReqStatus((v) => ({ ...v, [i]: 'edited' }))
                                setEditing(null)
                              }}
                            >
                              Сохранить
                            </button>
                          </span>
                        ) : (
                          <>
                            <span className="tag tag-neutral">{TYPE_LABEL[r.requirementType]}</span>{' '}
                            <b>{val}{r.unit ? ` ${r.unit}` : ''}</b>
                            {r.confidence != null && (
                              <span className="text-muted"> · AI {Math.round(r.confidence * 100)}%</span>
                            )}
                          </>
                        )}
                      </div>
                      {selReq === i && editing !== i && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-ghost" style={{ paddingInline: 0 }} onClick={() => setReqStatus((v) => ({ ...v, [i]: 'confirmed' }))}>Подтвердить</button>
                          <button className="btn btn-ghost" style={{ paddingInline: 0 }} onClick={() => setEditing(i)}>Изменить</button>
                          <button className="btn btn-ghost" style={{ paddingInline: 0 }} onClick={() => setReqStatus((v) => ({ ...v, [i]: 'rejected' }))}>Неверно</button>
                          <button className="btn btn-ghost" style={{ paddingInline: 0 }} onClick={() => setDeleted((d) => new Set(d).add(i))}>
                            <Trash2 size={12} /> Удалить
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {spec.documents.length > 0 && (
                  <div style={{ border: '1px solid rgba(32,30,29,0.35)', padding: 10, fontSize: 12 }}>
                    <b>Требования к документам:</b> {spec.documents.join(', ')}
                  </div>
                )}
              </div>

              <div>
                <div className="text-muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <FileText size={13} /> {f.specFile?.originalName ?? 'ТС'}
                </div>
                <SourcePanel
                  text={res.specText ?? ''}
                  highlight={
                    selReq != null
                      ? spec.characteristics[selReq]?.source?.text ?? spec.characteristics[selReq]?.rawRequirement
                      : undefined
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'compare' && (
        <div>
          <h3>Соответствие ТЗ · профиль товара ↔ требования</h3>
          {!opp.compatibility ? (
            <p className="text-muted">Сопоставление недоступно — ТС не разобрана.</p>
          ) : (
            <>
              <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
                Сравнивается сохранённый <b>профиль товара</b> с требованиями ТЗ. Примеры значений из анализа КТРУ
                в сравнении не участвуют.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>Требование</th><th>Ваш товар</th><th>Результат</th></tr>
                  </thead>
                  <tbody>
                    {opp.compatibility.rows.map((row, i) => (
                      <OppRow key={i} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'econ' && <EconTab res={res} />}

      {res.warnings.length > 0 && (
        <div className="text-muted" style={{ fontSize: 12, marginTop: 16 }}>
          {res.warnings.map((w, i) => <div key={i}>· {w}</div>)}
        </div>
      )}
      <div className="text-muted" style={{ fontSize: 11, textAlign: 'right', marginTop: 8 }}>
        анализ от {fmtDate(res.generatedAt)}{cachedRef.current ? ' · из кэша' : ''}
      </div>

      {pkgOpen && (
        <Dialog
          title="Скачать пакет"
          onClose={() => setPkgOpen(false)}
          actions={
            <>
              <button className="btn btn-primary" disabled>Собрать пакет</button>
              <button className="btn btn-secondary" onClick={() => setPkgOpen(false)}>Закрыть</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ display: 'flex', gap: 8 }}><Check size={14} /> Техническая спецификация (PDF)</span>
            <span style={{ display: 'flex', gap: 8 }}><Check size={14} /> Данные закупки</span>
            <span style={{ display: 'flex', gap: 8 }}><Check size={14} /> Информация о заказчике</span>
            <span style={{ display: 'flex', gap: 8 }}><Check size={14} /> Результат AI-анализа</span>
          </div>
          <p className="text-muted" style={{ marginTop: 10 }}>
            <Package size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Сбор полного пакета пока в разработке.
          </p>
        </Dialog>
      )}
    </div>
  )
}

function OppRow({ row }: { row: OppRequirementRow }) {
  const icon = row.result === 'match' ? <Check size={15} /> : row.result === 'mismatch' ? <X size={15} /> : <Clock size={15} />
  return (
    <>
      <tr>
        <td>
          <b>{row.name}</b>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {TYPE_LABEL[row.requirementType] ?? row.requirementType} · требуется: {row.requirementText}
          </div>
        </td>
        <td>{row.productValue ?? <span className="text-muted">нет данных</span>}</td>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {icon} {row.resultLabel}
            {row.critical && <b style={{ color: C.accent }}> · критично</b>}
          </span>
        </td>
      </tr>
      {row.result !== 'match' && (
        <tr>
          <td colSpan={3} className="text-muted" style={{ fontSize: 12 }}>
            {row.result === 'mismatch' ? (
              <>Требуется: <b>{row.needed}</b> · у товара: <b>{row.have}</b>. {row.explanation}</>
            ) : (
              <>Система не получила достаточно данных для вывода. {row.explanation}</>
            )}
            {row.source?.text && (
              <div style={{ marginTop: 2 }}>
                Источник требования: <span style={{ fontStyle: 'italic' }}>«{row.source.text.slice(0, 120)}»</span>
                {row.source.page != null && ` (стр. ${row.source.page})`}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function FactorRow({ fa }: { fa: AnalysisResult['score']['factors'][number] }) {
  const [open, setOpen] = useState(false)
  const cf = CONF[fa.confidence] ?? CONF.none
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
          {fa.label} {fa.score == null ? '' : `${fa.score}/100`}
        </div>
        <span className="tag tag-outline"><cf.Icon size={11} /> {cf.label}</span>
      </div>
      <div style={{ height: 6, background: '#eae7e7', marginBottom: 6 }}>
        <div style={{ height: '100%', background: '#201e1d', width: `${fa.score ?? 0}%` }} />
      </div>
      <p style={{ margin: '0 0 4px', fontSize: 13 }}>{fa.score == null ? 'Нет данных' : fa.reason}</p>
      <button className="btn btn-ghost" style={{ paddingInline: 0, fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Скрыть' : 'Как рассчитано'}
      </button>
      {open && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
          {fa.reason} Источник: {fa.source}
        </p>
      )}
    </div>
  )
}

function EconTab({ res }: { res: AnalysisResult }) {
  const e = res.economics
  const rev = e.revenue ?? 0
  const seg = useMemo(() => {
    if (!e.revenue || e.revenue <= 0 || e.directCost == null) return null
    const pct = (n: number | null) => ((n ?? 0) / rev) * 100
    return [
      { label: 'Себестоимость', pct: pct(e.directCost) },
      { label: 'Логистика', pct: pct(e.logistics) },
      { label: 'Прочие', pct: pct(e.otherCost) },
      { label: 'Прибыль', pct: Math.max(0, pct(e.profit)), profit: true },
    ].filter((x) => x.pct > 0.5)
  }, [e, rev])

  const noCost = e.directCost == null
  const noHist = !e.usesHistoricalPrice

  return (
    <div className="skt-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <h3>Экономика</h3>
        {noCost && (
          <div className="tag tag-outline" style={{ marginBottom: 10 }}>
            <AlertTriangle size={11} /> Экономика недоступна — у товара не указана себестоимость
          </div>
        )}
        {!noCost && noHist && (
          <div className="tag tag-outline" style={{ marginBottom: 10 }}>
            <AlertTriangle size={11} /> Историческая цена не найдена — расчёт по потолку цены лота
          </div>
        )}
        {e.lines.map((ln) => (
          <div key={ln.key} style={{ padding: '8px 0', borderBottom: '1px solid rgba(32,30,29,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>{ln.label}</span>
              <b>{ln.amount == null ? <span className="text-muted">Нет данных</span> : fmtMoney(ln.amount)}</b>
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>{ln.source}</div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800 }}>Потенциальная маржа</span>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32 }}>{fmtPct(e.marginRatio)}</span>
        </div>
        <p className="text-muted" style={{ fontSize: 12 }}>
          {e.usesHistoricalPrice
            ? 'рассчитано на основе исторической цены закупки'
            : 'рассчитано по потолку цены лота (оптимистично)'}
        </p>
        {e.warnings.map((w, i) => (
          <div key={i} className="tag tag-outline" style={{ marginTop: 6 }}><AlertTriangle size={11} /> {w}</div>
        ))}
      </div>
      <div>
        <h3>Куда уходит выручка</h3>
        {seg ? <BreakdownBar segments={seg} /> : <p className="text-muted">Недостаточно данных для разбивки (нужны выручка и себестоимость).</p>}
      </div>
    </div>
  )
}

function SourcePanel({ text, highlight }: { text: string; highlight?: string }) {
  const parts = useMemo(() => {
    if (!highlight || highlight.length < 4 || !text.includes(highlight)) return null
    const i = text.indexOf(highlight)
    return [text.slice(0, i), highlight, text.slice(i + highlight.length)]
  }, [text, highlight])
  return (
    <pre className="skt-src">
      {parts ? (
        <>
          {parts[0]}
          <mark style={{ background: '#ffe0d9', boxShadow: 'inset 3px 0 0 #ec3013' }}>{parts[1]}</mark>
          {parts[2]}
        </>
      ) : (
        text.slice(0, 6000) || 'нет текста'
      )}
    </pre>
  )
}

export default function LotCardPage() {
  const { lotId } = useParams<{ lotId: string }>()
  const productId = useSearchParams().get('product') ?? ''
  return (
    <Suspense fallback={null}>
      <LotCardInner key={`${lotId}:${productId}`} />
    </Suspense>
  )
}
