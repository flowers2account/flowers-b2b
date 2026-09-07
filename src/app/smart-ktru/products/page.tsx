'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useSmartKtru, emptyChar } from '@/lib/smart-ktru/store'
import type { ProductCharacteristic } from '@/lib/smart-ktru/types'
import { toProfileCharacteristics, type ProfileRowInput } from '@/lib/smart-ktru/product-profile'
import { Btn, Dialog, Field, fmtMoney } from '@/components/smart-ktru/kit'

const PRESET: ProductCharacteristic[] = [
  { name: 'Материал', value: '' },
  { name: 'Объём', value: '', unit: 'л' },
  { name: 'Цвет', value: '' },
]

// зеркало src/lib/ktru/match.ts (нельзя импортировать: тянет node:fs)
type MatchConfidence = 'high' | 'medium'
interface KtruMatch {
  code: string
  name: string
  score: number
  confidence: MatchConfidence
  reason: string
}

// зеркало src/lib/smart-ktru/ktru-characteristics.ts
const ANALYZER_VERSION = 'v1'
interface AggChar {
  name: string
  frequency: number
  totalSpecs: number
  confidence: number
  level: 'main' | 'additional'
  examples: string[]
  rawNames: string[]
  unit?: string
}
interface KtruCharsResult {
  ktruCode: string
  lotsFound: number
  specsAvailable: number
  specsExtracted: number
  analyzedSpecs: number
  characteristics: AggChar[]
  notes: string[]
}

/** редактируемая строка характеристики + provenance (поля с «_» на save отбрасываются) */
type EditChar = ProductCharacteristic & {
  _level?: 'main' | 'additional' | 'custom'
  _freq?: number
  _total?: number
  _confidence?: number
  _examples?: string[]
  _rawNames?: string[]
}

const editToInput = (c: EditChar): ProfileRowInput => ({
  name: c.name,
  value: c.value,
  unit: c.unit,
  fromAi: c._level === 'main' || c._level === 'additional',
  confidence: c._confidence,
  frequency: c._freq,
  totalSpecs: c._total,
  examples: c._examples,
})

/** characteristics сохранённого товара → строки для формы (provenance восстанавливается) */
function charToEdit(c: ProductCharacteristic): EditChar {
  const fromAi = c.source === 'ai'
  return {
    name: c.name,
    value: c.value ?? '',
    unit: c.unit ?? '',
    _level: fromAi ? (typeof c.confidence === 'number' && c.confidence >= 0.5 ? 'main' : 'additional') : 'custom',
    _freq: c.frequency,
    _total: c.totalSpecs,
    _confidence: c.confidence,
    _examples: c.examples,
  }
}

const fmtMln = (n: number) => '₸ ' + (n / 1e6).toFixed(1).replace('.0', '') + ' млн'

/* ─────────────── UI-хелперы Modernist (радиус 0, монохром + один акцент) ─────────────── */
function Bar({ pct, color = 'var(--color-accent)', h = 8 }: { pct: number; color?: string; h?: number }) {
  return (
    <div style={{ height: h, background: 'var(--color-neutral-200)', overflow: 'hidden' }}>
      <div style={{ height: '100%', background: color, width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}
function BigNum({ children, size = 40 }: { children: ReactNode; size?: number }) {
  return <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, lineHeight: 1, fontSize: size }}>{children}</div>
}

/** Карточка товара с визуальными показателями рынка (handoff «Мои товары»). */
function ProductCard({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const p = useSmartKtru((s) => s.products.find((x) => x.id === id))
  const analysisCache = useSmartKtru((s) => s.analysisCache)
  const removeProduct = useSmartKtru((s) => s.removeProduct)
  const [mkt, setMkt] = useState<{ liveLots: number; volume: number; lotIds: number[] } | null>(null)

  useEffect(() => {
    if (!p) return
    let alive = true
    const qs = p.ktruCodes?.[0]
      ? `ktru=${encodeURIComponent(p.ktruCodes[0])}`
      : `q=${encodeURIComponent(p.name)}`
    fetch(`/api/smart-ktru/procurements?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return
        const lots: { lotId: number; amount?: number }[] = j?.lots ?? []
        setMkt({
          liveLots: j?.counts?.liveLots ?? lots.length,
          volume: lots.reduce((a, l) => a + (l.amount ?? 0), 0),
          lotIds: lots.map((l) => l.lotId),
        })
      })
      .catch(() => alive && setMkt({ liveLots: 0, volume: 0, lotIds: [] }))
    return () => { alive = false }
  }, [p])

  if (!p) return null

  const filled = p.characteristics.filter((c) => (c.value ?? '').trim()).length
  // средняя «востребованность» характеристик профиля (frequency / totalSpecs)
  const withFreq = p.characteristics.filter((c) => c.frequency != null && c.totalSpecs)
  const specPct = withFreq.length
    ? Math.round((withFreq.reduce((a, c) => a + (c.frequency! / c.totalSpecs!), 0) / withFreq.length) * 100)
    : 0

  // подходят / проверить по проанализированным закупкам этого товара
  let fits = 0, review = 0
  for (const lotId of mkt?.lotIds ?? []) {
    const v = analysisCache[lotId]?.result?.score?.verdict
    if (v === 'recommend') fits++
    else if (v === 'consider') review++
  }

  const volLabel = mkt == null ? '…' : mkt.volume >= 1e6 ? `₸ ${(mkt.volume / 1e6).toFixed(1).replace('.0', '')} млн` : fmtMoney(mkt.volume)

  return (
    <div className="card elev-sm" style={{ gap: 10 }}>
      {p.ktruCodes?.[0] && (
        <span className="tag tag-outline" style={{ alignSelf: 'flex-start', fontFamily: 'ui-monospace, monospace' }}>
          КТРУ {p.ktruCodes[0]}
        </span>
      )}
      <button
        className="card-title"
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
        onClick={() => onOpen(p.id)}
      >
        {p.name}
      </button>

      <div style={{ height: 12, background: 'var(--color-neutral-200)', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--color-accent)', width: `${specPct}%` }} />
      </div>
      <div className="card-meta">
        {p.characteristics.length} характеристик отслеживаются · заполнено {filled}
      </div>

      <div style={{ fontSize: 14 }}>
        <b>{mkt == null ? '…' : mkt.liveLots}</b> возможностей · <b>{volLabel}</b> объём спроса
      </div>
      {(fits > 0 || review > 0) && (
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1 }}>{fits}</div>
            <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>Подходит</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1 }}>{review}</div>
            <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>Проверить</div>
          </div>
        </div>
      )}

      <div className="card-meta">
        {p.costPerUnit != null ? `Себестоимость: ${p.costPerUnit.toLocaleString('ru-RU')} ₸ / ${p.saleUnit || 'шт'}` : 'Себестоимость не указана'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn btn-secondary btn-block" onClick={() => onOpen(p.id)}>Открыть профиль</button>
        <Link className="btn btn-ghost" href={`/smart-ktru/procurements?product=${p.id}`}>Возможности →</Link>
        <button className="btn btn-ghost btn-icon" aria-label="Удалить" onClick={() => removeProduct(p.id)}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

export default function ProductsPage() {
  const products = useSmartKtru((s) => s.products)
  const ensureDemoSeed = useSmartKtru((s) => s.ensureDemoSeed)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    ensureDemoSeed()
  }, [ensureDemoSeed])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Мои товары</h1>
        <Btn variant="primary" onClick={() => setWizardOpen(true)}>
          <Plus size={15} /> Добавить товар
        </Btn>
      </div>
      <p className="text-muted" style={{ maxWidth: '60ch' }}>
        Опишите товар — система сама подберёт КТРУ и определит характеристики по реальным закупкам.
      </p>
      <div className="hr" />

      {products.length === 0 ? (
        <p className="text-muted">Пока нет товаров. Нажмите «Добавить товар».</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {products.map((p) => <ProductCard key={p.id} id={p.id} onOpen={setDetailId} />)}
        </div>
      )}

      {detailId && <ProductDetailDialog id={detailId} onClose={() => setDetailId(null)} />}

      {wizardOpen && (
        <AddProductWizard
          onClose={() => setWizardOpen(false)}
          onOpenProfile={(id) => { setWizardOpen(false); setDetailId(id) }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────── Полноэкранный мастер добавления товара ─────────────────────────── */

const WIZ_STEPS = ['01 Товар', '02 КТРУ', '03 Рынок', '04 Характеристики', '05 Готово']

function AddProductWizard({
  onClose,
  onOpenProfile,
}: {
  onClose: () => void
  onOpenProfile: (id: string) => void
}) {
  const router = useRouter()
  const addProduct = useSmartKtru((s) => s.addProduct)
  const cacheKtruChars = useSmartKtru((s) => s.cacheKtruChars)
  const getKtruChars = useSmartKtru((s) => s.getKtruChars)

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // ── шаг 2: КТРУ ──
  const [ktruCands, setKtruCands] = useState<KtruMatch[] | null>(null)
  const [ktruLoading, setKtruLoading] = useState(false)
  const [ktruError, setKtruError] = useState(false)
  const [ktruConfident, setKtruConfident] = useState(true)
  const [selCode, setSelCode] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manualCode, setManualCode] = useState('')

  // ── шаг 3: рынок ──
  const [chLoading, setChLoading] = useState(false)
  const [chError, setChError] = useState(false)
  const [chResult, setChResult] = useState<KtruCharsResult | null>(null)
  const [showMore3, setShowMore3] = useState(false)

  // ── шаг 4: характеристики ──
  const [rows, setRows] = useState<EditChar[]>([])
  const [showMore4, setShowMore4] = useState(false)

  // ── шаг 5: готово ──
  const [savedId, setSavedId] = useState('')
  const [doneLoading, setDoneLoading] = useState(false)
  const [doneStats, setDoneStats] = useState<{ liveLots: number; volume: number } | null>(null)

  async function goStep2() {
    if (!name.trim()) return
    setStep(2)
    setKtruLoading(true); setKtruError(false); setKtruCands(null)
    try {
      const r = await fetch('/api/smart-ktru/ktru-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), characteristics: [] }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'match failed')
      const results: KtruMatch[] = j.results ?? []
      setKtruCands(results)
      setKtruConfident(!!j.confident)
      if (results[0]) setSelCode(results[0].code)
      else setManualMode(true)
    } catch {
      setKtruError(true)
    } finally {
      setKtruLoading(false)
    }
  }

  function addManualCode() {
    const c = manualCode.trim()
    if (!c) return
    setSelCode(c); setManualMode(false); setManualCode('')
  }

  function seedRows(res: KtruCharsResult) {
    setRows(
      res.characteristics.map((a) => ({
        name: a.name,
        value: '',
        unit: a.unit ?? '',
        _level: a.level,
        _freq: a.frequency,
        _total: a.totalSpecs,
        _confidence: a.confidence,
        _examples: a.examples,
        _rawNames: a.rawNames,
      })),
    )
    setShowMore3(false)
    setShowMore4(false)
  }

  async function goStep3() {
    if (!selCode) return
    setStep(3)
    const key = `${ANALYZER_VERSION}:${selCode}`
    const cached = getKtruChars(key)
    if (cached?.result) {
      const res = cached.result as KtruCharsResult
      setChResult(res); setChError(false); seedRows(res)
      return
    }
    setChLoading(true); setChError(false); setChResult(null)
    try {
      const r = await fetch('/api/smart-ktru/ktru-characteristics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ktruCodes: [selCode] }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'char analysis failed')
      const res = j as KtruCharsResult
      setChResult(res); cacheKtruChars(key, res); seedRows(res)
    } catch {
      setChError(true)
      if (rows.length === 0) setRows(PRESET.map((c) => ({ ...c, _level: 'custom' as const })))
    } finally {
      setChLoading(false)
    }
  }

  function fillManuallyToStep4() {
    setChError(false)
    if (rows.length === 0) setRows(PRESET.map((c) => ({ ...c, _level: 'custom' as const })))
    setStep(4)
  }

  const setRow = (i: number, patch: Partial<EditChar>) =>
    setRows((cs) => cs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const delRow = (i: number) => setRows((cs) => cs.filter((_, j) => j !== i))
  const addCustom = () =>
    setRows((cs) => [...cs, { name: 'Новая характеристика', value: '', _level: 'custom' }])

  function saveProduct() {
    if (!name.trim()) return
    const id = addProduct({
      name: name.trim(),
      category: undefined,
      costPerUnit: undefined,
      saleUnit: 'шт',
      ktruCodes: selCode ? [selCode] : undefined,
      characteristics: toProfileCharacteristics(rows.map(editToInput)),
    })
    setSavedId(id)
    setStep(5)
    setDoneLoading(true)
    fetch(`/api/smart-ktru/procurements?ktru=${encodeURIComponent(selCode)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) { setDoneStats(null); return }
        const live = j.counts?.liveLots ?? (j.lots?.length ?? 0)
        const volume = ((j.lots ?? []) as { amount?: number }[]).reduce((a, l) => a + (l.amount ?? 0), 0)
        setDoneStats({ liveLots: live, volume })
      })
      .catch(() => setDoneStats(null))
      .finally(() => setDoneLoading(false))
  }

  const mainRows = rows.map((c, i) => ({ c, i })).filter(({ c }) => c._level !== 'additional')
  const addRows = rows.map((c, i) => ({ c, i })).filter(({ c }) => c._level === 'additional')

  const studied = chResult?.analyzedSpecs ?? 0
  const mainAgg = (chResult?.characteristics ?? []).filter((c) => c.level === 'main')
  const addAgg = (chResult?.characteristics ?? []).filter((c) => c.level === 'additional')
  const noSpecs = chResult != null && chResult.analyzedSpecs === 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--color-bg)', overflow: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div className="text-muted" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Добавление товара
          </div>
          <button className="btn btn-icon btn-ghost" aria-label="Закрыть" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32, fontSize: 13 }}>
          {WIZ_STEPS.map((label, idx) => {
            const n = idx + 1
            return (
              <div
                key={label}
                style={{
                  fontWeight: n === step ? 700 : 400,
                  color:
                    n === step
                      ? 'var(--color-text)'
                      : n < step
                        ? 'var(--color-neutral-600)'
                        : 'var(--color-neutral-400)',
                }}
              >
                {label}
              </div>
            )
          })}
        </div>

        {/* ── Шаг 1: Товар ── */}
        {step === 1 && (
          <div>
            <h1>Что вы продаёте?</h1>
            <p className="text-muted">Напишите название товара. Остальное система поможет определить автоматически.</p>
            <div className="field">
              <input
                className="input"
                style={{ fontSize: 18, padding: 14 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: горшок пластиковый для цветов"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) goStep2() }}
              />
            </div>
            <div className="field">
              <label>Можно добавить описание</label>
              <textarea
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Размер, материал, назначение и другие известные параметры"
              />
            </div>
            <button className="btn btn-primary" disabled={!name.trim()} onClick={goStep2}>Продолжить →</button>
          </div>
        )}

        {/* ── Шаг 2: КТРУ ── */}
        {step === 2 && (
          <div>
            <h1>К какому товару относится ваш продукт?</h1>
            <p className="text-muted">Мы подобрали варианты по реальному классификатору КТРУ. Выберите наиболее подходящий.</p>

            {ktruLoading && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <Loader2 size={15} className="spin" /> Подбираем КТРУ…
              </p>
            )}

            {ktruError && !ktruLoading && (
              <div style={{ fontSize: 14 }}>
                <p>Не удалось подобрать КТРУ.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={goStep2}>Повторить</button>
                  <button className="btn btn-ghost" onClick={() => { setManualMode(true); setKtruError(false) }}>Ввести код вручную</button>
                </div>
              </div>
            )}

            {!ktruLoading && !ktruError && ktruCands != null && (
              <>
                {ktruCands.length === 0 && !ktruConfident && (
                  <p className="text-muted" style={{ fontSize: 13 }}>
                    Подходящий КТРУ не найден. Уточните название товара или введите код вручную.
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                  {ktruCands.map((k, i) => {
                    const pct = Math.round(k.score * 100)
                    const sel = selCode === k.code
                    return (
                      <div
                        key={k.code}
                        className="card elev-sm"
                        style={{ border: `2px solid ${sel ? 'var(--color-accent)' : 'transparent'}`, cursor: 'pointer' }}
                        onClick={() => setSelCode(k.code)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="card-title">{k.name}</div>
                            <div className="card-meta" style={{ fontFamily: 'ui-monospace, monospace' }}>{k.code}</div>
                          </div>
                          <div style={{ textAlign: 'right', flex: 'none' }}>
                            <BigNum size={28}>{pct}%</BigNum>
                            <div className="text-muted" style={{ fontSize: 11 }}>
                              {i === 0 ? 'Наиболее подходящий' : 'Возможный вариант'}
                            </div>
                          </div>
                        </div>
                        <div style={{ marginTop: 8 }}><Bar pct={pct} /></div>
                        <p className="card-body" style={{ marginBottom: 0 }}>{k.reason}</p>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {manualMode && (
              <div className="field">
                <label>Код КТРУ</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualCode() } }}
                    placeholder="222929.900.000114"
                  />
                  <button className="btn btn-secondary" onClick={addManualCode} disabled={!manualCode.trim()}>Выбрать</button>
                </div>
              </div>
            )}

            {selCode && manualMode && (
              <p className="text-muted" style={{ fontSize: 13 }}>
                Выбран код: <b style={{ fontFamily: 'ui-monospace, monospace' }}>{selCode}</b>
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={!selCode || ktruLoading} onClick={goStep3}>Выбрать и продолжить →</button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
                onClick={() => { setStep(1); setKtruCands(null); setSelCode(''); setManualMode(false); setKtruError(false) }}
              >
                Не подходит ни один
              </button>
              {!manualMode && (
                <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setManualMode(true)}>
                  Ввести код вручную
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Шаг 3: Рынок ── */}
        {step === 3 && (
          <div>
            {chLoading && (
              <>
                <h1>Изучаем реальные закупки</h1>
                <p className="text-muted">Смотрим, что государственные заказчики требуют от этого товара.</p>
                <div style={{ maxWidth: 320 }}><Bar pct={60} h={14} /></div>
              </>
            )}

            {chError && !chLoading && (
              <>
                <h1>Не удалось изучить закупки</h1>
                <p className="text-muted">Не получилось разобрать технические спецификации по этому КТРУ.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={goStep3}>Повторить</button>
                  <button className="btn btn-ghost" onClick={fillManuallyToStep4}>Заполнить характеристики вручную →</button>
                </div>
              </>
            )}

            {!chLoading && !chError && chResult != null && (
              <>
                <h1>Что требуют от этого товара</h1>
                {noSpecs ? (
                  <p className="text-muted">
                    По этому КТРУ пока не удалось найти доступные технические спецификации. Заполните
                    характеристики вручную на следующем шаге.
                  </p>
                ) : (
                  <p className="text-muted">
                    Мы изучили {studied} {studied === 1 ? 'реальную закупку' : studied < 5 ? 'реальные закупки' : 'реальных закупок'}.
                  </p>
                )}

                {mainAgg.length > 0 && (
                  <>
                    <h4>Основные — {mainAgg.length}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                      {mainAgg.map((c) => (
                        <div key={c.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                            <span>{c.name}</span>
                            <b>{c.frequency} из {c.totalSpecs}</b>
                          </div>
                          <Bar pct={Math.round((c.frequency / Math.max(1, c.totalSpecs)) * 100)} h={14} />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {addAgg.length > 0 && (
                  <>
                    <button className="btn btn-ghost" style={{ paddingInline: 0 }} onClick={() => setShowMore3((v) => !v)}>
                      {showMore3 ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Дополнительные — {addAgg.length}
                    </button>
                    {showMore3 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                        {addAgg.map((c) => (
                          <div key={c.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                              <span>{c.name}</span>
                              <b>{c.frequency} из {c.totalSpecs}</b>
                            </div>
                            <Bar pct={Math.round((c.frequency / Math.max(1, c.totalSpecs)) * 100)} h={14} />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {mainAgg.length > 0 && (
                  <p style={{ marginTop: 24 }}>
                    Чтобы участвовать в большинстве закупок этого типа, важно указать {mainAgg.length} основных характеристик.
                  </p>
                )}
                <button className="btn btn-primary" onClick={() => setStep(4)}>Заполнить характеристики →</button>
              </>
            )}
          </div>
        )}

        {/* ── Шаг 4: Характеристики ── */}
        {step === 4 && (
          <div>
            <h1>Характеристики вашего товара</h1>
            <p className="text-muted">
              Укажите данные вашего товара. Система использует их, чтобы проверить подходящие закупки.
              Примеры из закупок — это требования рынка, а не значение вашего товара. Заполнять всё необязательно.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
              {mainRows.map(({ c, i }) => (
                <WizCharField key={i} c={c} onChange={(v) => setRow(i, { value: v })} onLabelChange={(v) => setRow(i, { name: v })} onRemove={() => delRow(i)} />
              ))}
            </div>

            {addRows.length > 0 && (
              <>
                <button className="btn btn-ghost" style={{ paddingInline: 0 }} onClick={() => setShowMore4((v) => !v)}>
                  {showMore4 ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Дополнительные характеристики — {addRows.length}
                </button>
                {showMore4 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
                    {addRows.map(({ c, i }) => (
                      <WizCharField key={i} c={c} onChange={(v) => setRow(i, { value: v })} onLabelChange={(v) => setRow(i, { name: v })} onRemove={() => delRow(i)} />
                    ))}
                  </div>
                )}
              </>
            )}

            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={addCustom}>
              <Plus size={14} /> Добавить характеристику
            </button>

            <div style={{ marginTop: 24 }}>
              <button className="btn btn-primary" onClick={saveProduct}>Сохранить товар →</button>
            </div>
          </div>
        )}

        {/* ── Шаг 5: Готово ── */}
        {step === 5 && (
          <div>
            <h1>Товар готов</h1>
            <p className="text-muted">Теперь система может искать закупки, которые подходят вашему товару.</p>

            <div className="card elev-sm" style={{ marginBottom: 24 }}>
              <div className="card-title">{name.trim()}</div>
              <div className="card-meta" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {selCode ? `КТРУ ${selCode}` : 'КТРУ не выбран'}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <BigNum size={64}>{doneLoading ? '…' : (doneStats?.liveLots ?? 0)}</BigNum>
              <div className="text-muted" style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
                живых закупок найдено
              </div>
            </div>

            <div style={{ marginBottom: 8 }}><Bar pct={doneStats && doneStats.liveLots > 0 ? 100 : 0} h={20} /></div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 24 }}>
              Разбор соответствия по каждой закупке — при её открытии (запускается вручную, не массово).
            </p>

            {doneStats != null && doneStats.volume > 0 && (
              <div className="card elev-sm" style={{ marginBottom: 32 }}>
                <div className="text-muted" style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Потенциальный объём
                </div>
                <div className="card-title" style={{ fontSize: 22 }}>{fmtMln(doneStats.volume)}</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={() => { onClose(); router.push(`/smart-ktru/procurements?product=${savedId}`) }}
              >
                Смотреть возможности →
              </button>
              <button className="btn btn-ghost" onClick={() => onOpenProfile(savedId)}>Открыть профиль товара</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Поле характеристики на шаге 4: имя + частотность + подсказка «что в закупках» + значение. */
function WizCharField({
  c, onChange, onLabelChange, onRemove,
}: {
  c: EditChar
  onChange: (v: string) => void
  onLabelChange: (v: string) => void
  onRemove: () => void
}) {
  const custom = c._level === 'custom'
  const freqLabel = c._freq != null && c._total != null ? `${c._freq} из ${c._total}` : 'добавлено вручную'
  const hint = (c._examples ?? []).slice(0, 3).join(' · ') || c.unit || '—'
  return (
    <div className="card elev-sm" style={{ gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, gap: 8, flexWrap: 'wrap' }}>
        {custom ? (
          <input
            className="input"
            style={{ fontWeight: 600, border: 'none', padding: 0, height: 'auto' }}
            value={c.name}
            onChange={(e) => onLabelChange(e.target.value)}
          />
        ) : (
          <span><b>{c.name}</b></span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <span className="text-muted">{freqLabel}</span>
          <button className="btn btn-ghost btn-icon" aria-label="Убрать" onClick={onRemove}>
            <Trash2 size={13} />
          </button>
        </span>
      </div>
      {!custom && (
        <div className="text-muted" style={{ fontSize: 12 }}>Что указано в закупках: {hint}</div>
      )}
      <input
        className="input"
        value={c.value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Введите значение или оставьте пустым"
      />
    </div>
  )
}

/** Одна строка характеристики: имя · значение · частотность · примеры · provenance. */
function CharRow({
  c, i, prominent, openSrc, setOpenSrc, setRow, delRow,
}: {
  c: EditChar
  i: number
  prominent?: boolean
  openSrc: number | null
  setOpenSrc: (v: number | null) => void
  setRow: (i: number, patch: Partial<EditChar>) => void
  delRow: (i: number) => void
}) {
  const hasProv = c._freq != null && c._total != null
  const examples = c._examples ?? []
  return (
    <div style={{ borderLeft: prominent ? '2px solid rgba(32,30,29,0.35)' : '2px solid transparent', paddingLeft: prominent ? 8 : 0 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input className="input" style={{ width: 170, fontWeight: 600 }} value={c.name} placeholder="характеристика"
          onChange={(e) => setRow(i, { name: e.target.value })} />
        <input className="input" value={c.value ?? ''} placeholder="значение вашего товара"
          onChange={(e) => setRow(i, { value: e.target.value })} />
        <input className="input" style={{ width: 56 }} value={c.unit ?? ''} placeholder="ед."
          onChange={(e) => setRow(i, { unit: e.target.value })} />
        <button className="btn btn-ghost btn-icon" aria-label="Убрать из профиля" title="Убрать из профиля" onClick={() => delRow(i)}>
          <Trash2 size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, marginTop: 3 }}>
        {hasProv && (
          <button className="btn btn-ghost" style={{ fontSize: 11, paddingInline: 0 }}
            onClick={() => setOpenSrc(openSrc === i ? null : i)}>
            {c._freq} из {c._total} ТЗ
          </button>
        )}
        {!hasProv && <span className="text-muted">добавлено вручную</span>}
        {examples.length > 0 && (
          <span className="text-muted">Примеры из ТЗ: {examples.slice(0, 3).join(' · ')}</span>
        )}
      </div>

      {hasProv && openSrc === i && (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 3, paddingLeft: 6, borderLeft: '2px solid rgba(32,30,29,0.35)' }}>
          Встречается в {c._freq} из {c._total} проанализированных ТЗ.
          {c._rawNames && c._rawNames.length > 0 && (
            <div>Варианты названия в ТЗ: {c._rawNames.join(', ')}</div>
          )}
          {examples.length > 0 && (
            <div>Примеры требований: {examples.map((x) => `«${x}»`).join(', ')}</div>
          )}
        </div>
      )}
    </div>
  )
}

/** Профиль сохранённого товара: правка полей и характеристик БЕЗ повторного анализа ТЗ. */
function ProductDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const product = useSmartKtru((s) => s.products.find((p) => p.id === id))
  const updateProduct = useSmartKtru((s) => s.updateProduct)

  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [cost, setCost] = useState(product?.costPerUnit != null ? String(product.costPerUnit) : '')
  const [unit, setUnit] = useState(product?.saleUnit ?? 'шт')
  const [rows, setRows] = useState<EditChar[]>(() => (product?.characteristics ?? []).map(charToEdit))
  const [openSrc, setOpenSrc] = useState<number | null>(null)

  const ktruCodes = product?.ktruCodes ?? []
  const initialChars = useMemo(() => (product?.characteristics ?? []).map(charToEdit), [product?.characteristics])
  useEffect(() => { setRows(initialChars) }, [initialChars])

  if (!product) return null

  const setRow = (i: number, patch: Partial<EditChar>) =>
    setRows((cs) => cs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const delRow = (i: number) => setRows((cs) => cs.filter((_, j) => j !== i))

  function save() {
    if (!name.trim()) return
    updateProduct(id, {
      name: name.trim(),
      category: category.trim() || undefined,
      costPerUnit: cost.trim() ? Number(cost) : undefined,
      saleUnit: unit.trim() || 'шт',
      characteristics: toProfileCharacteristics(rows.map(editToInput)),
    })
    onClose()
  }

  const filled = rows.filter((c) => (c.value ?? '').trim()).length

  return (
    <Dialog
      title="Профиль товара"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>Сохранить изменения</button>
          <button className="btn btn-ghost" onClick={onClose}>Закрыть</button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Название товара">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Себестоимость, ₸">
            <input className="input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ''))} />
          </Field>
          <Field label="Ед. измерения">
            <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label="Категория">
            <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
        </div>

        {ktruCodes.length > 0 && (
          <div className="text-muted" style={{ fontSize: 12 }}>
            КТРУ: {ktruCodes.map((c) => <b key={c} style={{ fontFamily: 'ui-monospace, monospace', marginRight: 8 }}>{c}</b>)}
          </div>
        )}

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 8 }}>
            ХАРАКТЕРИСТИКИ · заполнено {filled} из {rows.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((c, i) => (
              <CharRow key={i} c={c} i={i} openSrc={openSrc} setOpenSrc={setOpenSrc} setRow={setRow} delRow={delRow} />
            ))}
          </div>
          <button className="btn btn-ghost" style={{ paddingInline: 0, fontSize: 12, marginTop: 8 }}
            onClick={() => setRows((cs) => [...cs, { ...emptyChar(), _level: 'custom' }])}>
            <Plus size={12} /> Добавить характеристику
          </button>
        </div>
        <p className="text-muted" style={{ fontSize: 12 }}>
          Анализ ТЗ по КТРУ здесь не запускается повторно — правки касаются только профиля товара.
        </p>
      </div>
    </Dialog>
  )
}
