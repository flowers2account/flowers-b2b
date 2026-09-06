'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Loader2, Check, Wand2, ChevronDown, ChevronRight } from 'lucide-react'
import { useSmartKtru, emptyChar } from '@/lib/smart-ktru/store'
import type { ProductCharacteristic } from '@/lib/smart-ktru/types'
import { toProfileCharacteristics, type ProfileRowInput } from '@/lib/smart-ktru/product-profile'
import { Btn, Card, Dialog, Field } from '@/components/smart-ktru/kit'

const PRESET: ProductCharacteristic[] = [
  { name: 'Материал', value: '' },
  { name: 'Диаметр', value: '', unit: 'см' },
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
const CONF_LABEL: Record<MatchConfidence, string> = {
  high: 'высокое совпадение',
  medium: 'возможное совпадение',
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

/** Карточка товара: клик по названию открывает профиль; счётчик закупок по КТРУ. */
function ProductCard({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const p = useSmartKtru((s) => s.products.find((x) => x.id === id))
  const removeProduct = useSmartKtru((s) => s.removeProduct)
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!p) return
    let alive = true
    const qs = p.ktruCodes?.[0]
      ? `ktru=${encodeURIComponent(p.ktruCodes[0])}`
      : `q=${encodeURIComponent(p.name)}`
    fetch(`/api/smart-ktru/procurements?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setCount(j?.counts?.liveLots ?? j?.counts?.activeLots ?? 0))
      .catch(() => alive && setCount(0))
    return () => {
      alive = false
    }
  }, [p])

  if (!p) return null
  const filled = p.characteristics.filter((c) => (c.value ?? '').trim()).length
  const summary = p.characteristics
    .filter((c) => (c.value ?? '').trim())
    .map((c) => `${c.name} ${c.value}${c.unit ? ' ' + c.unit : ''}`)
    .join(' · ')

  return (
    <Card kicker={(p.category || 'Товар').toUpperCase()}>
      <button
        className="card-title"
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
        onClick={() => onOpen(p.id)}
      >
        {p.name}
      </button>
      <p className="card-body">{summary || `${p.characteristics.length} характеристик — значения не заполнены`}</p>
      <div className="hr" style={{ margin: '4px 0' }} />
      <div className="card-meta">
        {p.costPerUnit != null
          ? `Себестоимость: ${p.costPerUnit.toLocaleString('ru-RU')} ₸ / ${p.saleUnit || 'шт'}`
          : 'Себестоимость не указана'}
        {p.ktruCodes?.length ? ` · КТРУ ${p.ktruCodes.join(', ')}` : ''}
      </div>
      <div className="card-meta">
        Профиль: {filled} из {p.characteristics.length} характеристик заполнено
        {count == null ? '' : ` · ${count} подходящих закупок`}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn btn-secondary btn-block" onClick={() => onOpen(p.id)}>Открыть профиль</button>
        <Link className="btn btn-ghost" href={`/smart-ktru/procurements?product=${p.id}`}>Закупки →</Link>
        <button className="btn btn-ghost btn-icon" aria-label="Удалить" onClick={() => removeProduct(p.id)}>
          <Trash2 size={15} />
        </button>
      </div>
    </Card>
  )
}

const STEPS = ['Товар', 'КТРУ', 'Характеристики']
const LOADING_STEPS = [
  'Находим подходящие закупки',
  'Проверяем наличие ТЗ',
  'Анализируем документы',
  'Выделяем повторяющиеся характеристики',
]

export default function ProductsPage() {
  const products = useSmartKtru((s) => s.products)
  const addProduct = useSmartKtru((s) => s.addProduct)
  const ensureDemoSeed = useSmartKtru((s) => s.ensureDemoSeed)
  const cacheKtruChars = useSmartKtru((s) => s.cacheKtruChars)
  const getKtruChars = useSmartKtru((s) => s.getKtruChars)

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [detailId, setDetailId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [cost, setCost] = useState('')
  const [unit, setUnit] = useState('шт')
  const [chars, setChars] = useState<EditChar[]>([])

  // --- Auto KTRU Match ---
  const [ktruCodes, setKtruCodes] = useState<string[]>([])
  const [ktruNames, setKtruNames] = useState<Record<string, string>>({})
  const [matches, setMatches] = useState<KtruMatch[] | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState(false)
  const [confident, setConfident] = useState(true)
  const [manualMode, setManualMode] = useState(false)
  const [manualCode, setManualCode] = useState('')

  // --- Шаг 3: характеристики из реальных ТЗ ---
  const [charLoading, setCharLoading] = useState(false)
  const [charError, setCharError] = useState(false)
  const [charResult, setCharResult] = useState<KtruCharsResult | null>(null)
  const [charForCode, setCharForCode] = useState<string | null>(null)
  const [skippedAuto, setSkippedAuto] = useState(false)
  const [showAdditional, setShowAdditional] = useState(false)
  const [openSrc, setOpenSrc] = useState<number | null>(null)

  useEffect(() => {
    ensureDemoSeed()
  }, [ensureDemoSeed])

  async function runMatch() {
    if (!name.trim() || matching) return
    setMatching(true)
    setMatchError(false)
    setMatches(null)
    try {
      const r = await fetch('/api/smart-ktru/ktru-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          characteristics: chars
            .filter((c) => c.name.trim() || (c.value ?? '').trim())
            .map((c) => ({ name: c.name, value: c.value, unit: c.unit })),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'match failed')
      setMatches(j.results ?? [])
      setConfident(!!j.confident)
    } catch {
      setMatchError(true)
      setMatches(null)
    } finally {
      setMatching(false)
    }
  }

  function pickKtru(code: string, nameRu?: string) {
    setKtruCodes((cs) => (cs.includes(code) ? cs : [...cs, code]))
    if (nameRu) setKtruNames((m) => ({ ...m, [code]: nameRu }))
  }
  function dropKtru(code: string) {
    setKtruCodes((cs) => cs.filter((c) => c !== code))
  }
  function addManual() {
    const code = manualCode.trim()
    if (!code) return
    pickKtru(code)
    setManualCode('')
  }

  /** Разложить результат агрегации в редактируемый список характеристик (значения пустые — §3). */
  function seedCharsFromResult(res: KtruCharsResult) {
    const rows: EditChar[] = res.characteristics.map((a) => ({
      name: a.name,
      value: '',
      unit: a.unit ?? '',
      _level: a.level,
      _freq: a.frequency,
      _total: a.totalSpecs,
      _confidence: a.confidence,
      _examples: a.examples,
      _rawNames: a.rawNames,
    }))
    setChars(rows)
    setShowAdditional(false)
  }

  async function analyzeKtruChars(force = false) {
    const code = ktruCodes[0]
    if (!code) return
    const key = `${ANALYZER_VERSION}:${code}`
    setSkippedAuto(false)

    if (!force) {
      const cached = getKtruChars(key)
      if (cached?.result) {
        const res = cached.result as KtruCharsResult
        setCharResult(res)
        setCharForCode(code)
        setCharError(false)
        seedCharsFromResult(res)
        return
      }
    }

    setCharLoading(true)
    setCharError(false)
    setCharResult(null)
    try {
      const r = await fetch('/api/smart-ktru/ktru-characteristics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ktruCodes }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'char analysis failed')
      const res = j as KtruCharsResult
      setCharResult(res)
      setCharForCode(code)
      cacheKtruChars(key, res)
      seedCharsFromResult(res)
    } catch {
      setCharError(true) // введённые данные (chars) не трогаем — §15
    } finally {
      setCharLoading(false)
    }
  }

  function continueWithoutAuto() {
    setSkippedAuto(true)
    setCharError(false)
    setCharResult(null)
    setCharForCode(ktruCodes[0] ?? null)
    if (chars.length === 0) setChars(PRESET.map((c) => ({ ...c, _level: 'custom' as const })))
  }

  // при входе на шаг 3 — запустить анализ (или взять из кэша), но не пере-запускать
  useEffect(() => {
    if (step !== 3) return
    const code = ktruCodes[0]
    if (!code) return
    if (charForCode === code && (charResult || charError || skippedAuto)) return
    void analyzeKtruChars()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ktruCodes])

  function reset() {
    setStep(1)
    setName(''); setCategory(''); setCost(''); setUnit('шт')
    setChars([])
    setKtruCodes([]); setKtruNames({}); setMatches(null); setMatching(false)
    setMatchError(false); setConfident(true); setManualMode(false); setManualCode('')
    setCharLoading(false); setCharError(false); setCharResult(null); setCharForCode(null)
    setSkippedAuto(false); setShowAdditional(false); setOpenSrc(null)
  }
  function closeDialog() {
    setOpen(false)
    reset()
  }
  function save() {
    if (!name.trim() || !cost.trim()) return
    addProduct({
      name: name.trim(),
      category: category.trim() || undefined,
      costPerUnit: Number(cost),
      saleUnit: unit.trim() || 'шт',
      ktruCodes: ktruCodes.length ? ktruCodes : undefined,
      characteristics: toProfileCharacteristics(chars.map(editToInput)),
    })
    closeDialog()
  }

  const step1ok = !!name.trim() && !!cost.trim()
  const mainRows = chars.map((c, i) => ({ c, i })).filter(({ c }) => c._level !== 'additional')
  const addRows = chars.map((c, i) => ({ c, i })).filter(({ c }) => c._level === 'additional')

  const setRow = (i: number, patch: Partial<EditChar>) =>
    setChars((cs) => cs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const delRow = (i: number) => setChars((cs) => cs.filter((_, j) => j !== i))

  const analyzedText = charResult
    ? charResult.analyzedSpecs > 0
      ? `По ${charResult.analyzedSpecs} из ${charResult.specsAvailable} доступных ТЗ`
      : 'Доступных технических спецификаций не найдено'
    : null
  const noSpecs = !charLoading && !charError && charResult != null && charResult.analyzedSpecs === 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Мои товары</h1>
        <Btn variant="primary" onClick={() => { reset(); setOpen(true) }}>
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

      {detailId && (
        <ProductDetailDialog id={detailId} onClose={() => setDetailId(null)} />
      )}

      {open && (
        <Dialog
          title="Новый товар"
          onClose={closeDialog}
          actions={
            <>
              {step > 1 && (
                <button className="btn btn-secondary" onClick={() => setStep((s) => (s === 3 ? 2 : 1))}>
                  ← Назад
                </button>
              )}
              {step === 1 && (
                <button className="btn btn-primary" disabled={!step1ok} onClick={() => setStep(2)}>
                  Далее →
                </button>
              )}
              {step === 2 && (
                <button className="btn btn-primary" disabled={ktruCodes.length === 0} onClick={() => setStep(3)}>
                  Продолжить →
                </button>
              )}
              {step === 3 && (
                <button className="btn btn-primary" disabled={!step1ok} onClick={save}>
                  Сохранить товар
                </button>
              )}
              <button className="btn btn-ghost" onClick={closeDialog}>Отмена</button>
            </>
          }
        >
          {/* индикатор шагов */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, fontSize: 12 }}>
            {STEPS.map((label, idx) => {
              const n = idx + 1
              const active = n === step
              const done = n < step
              return (
                <span key={label} style={{ display: 'flex', gap: 5, alignItems: 'center', color: active ? '#ec3013' : done ? '#201e1d' : 'rgba(32,30,29,0.5)' }}>
                  <b>{String(n).padStart(2, '0')}</b> {label}
                </span>
              )
            })}
          </div>

          {/* ── Шаг 1: Товар ── */}
          {step === 1 && (
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Название товара">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Горшок пластиковый для цветов" autoFocus />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Себестоимость, ₸">
                  <input className="input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ''))} placeholder="125" />
                </Field>
                <Field label="Ед. измерения">
                  <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="шт" />
                </Field>
                <Field label="Категория">
                  <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Горшки" />
                </Field>
              </div>
              <p className="text-muted" style={{ fontSize: 12 }}>
                На следующем шаге система подберёт КТРУ по названию.
              </p>
            </div>
          )}

          {/* ── Шаг 2: КТРУ ── */}
          {step === 2 && (
            <div>
              {ktruCodes.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <b style={{ fontSize: 13 }}>Выбрано КТРУ: {ktruCodes.length}</b>
                    <button className="btn btn-ghost" style={{ fontSize: 12, paddingInline: 0 }} disabled={!name.trim() || matching} onClick={runMatch} title="Показать кандидатов заново — текущий выбор сохранится">
                      Изменить выбор
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    {ktruCodes.map((code) => (
                      <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, border: '1px solid rgba(32,30,29,0.35)', padding: '6px 8px' }}>
                        <Check size={13} style={{ flex: 'none' }} />
                        <b style={{ fontFamily: 'ui-monospace, monospace' }}>{code}</b>
                        {ktruNames[code] ? <span className="text-muted">{ktruNames[code]}</span> : null}
                        <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }} aria-label="Убрать КТРУ" onClick={() => dropKtru(code)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-secondary" disabled={!name.trim() || matching} onClick={runMatch}>
                  {matching ? <Loader2 size={13} className="spin" /> : <Wand2 size={13} />}
                  {matching ? ' Подбираем КТРУ…' : ktruCodes.length ? ' Подобрать ещё' : ' Подобрать КТРУ'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setManualMode((v) => !v)}>
                  {manualMode ? 'скрыть ручной ввод' : 'Ввести КТРУ вручную'}
                </button>
              </div>

              {manualMode && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input className="input" value={manualCode} onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }}
                    placeholder="222929.900.000114" />
                  <button className="btn btn-secondary" onClick={addManual} disabled={!manualCode.trim()}>Добавить</button>
                </div>
              )}

              {matching && <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>Подбираем КТРУ…</p>}

              {matchError && !matching && (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <p style={{ margin: '0 0 6px' }}>Не удалось подобрать КТРУ.</p>
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={runMatch}>Повторить</button>
                </div>
              )}

              {matches !== null && !matching && !matchError && (
                <div style={{ marginTop: 10 }}>
                  {matches.length === 0 || !confident ? (
                    <p className="text-muted" style={{ fontSize: 13 }}>
                      Подходящий КТРУ не найден. Попробуйте уточнить название товара или ввести код вручную.
                    </p>
                  ) : (
                    <>
                      <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>Подходящие КТРУ:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {matches.map((m) => {
                          const chosen = ktruCodes.includes(m.code)
                          return (
                            <div key={m.code} style={{ border: `1px solid ${chosen ? '#ec3013' : 'rgba(32,30,29,0.35)'}`, background: chosen ? '#fff2ef' : undefined, padding: '8px 10px', fontSize: 13 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                {chosen ? <Check size={13} style={{ flex: 'none', color: '#ec3013' }} /> : <span style={{ width: 13, flex: 'none' }} />}
                                <b style={{ fontFamily: 'ui-monospace, monospace' }}>{m.code}</b>
                                <span>{m.name}</span>
                                <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                                  {Math.round(m.score * 100)}% совпадение · {CONF_LABEL[m.confidence]}
                                </span>
                              </div>
                              <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{m.reason}</div>
                              <button className={`btn ${chosen ? 'btn-ghost' : 'btn-secondary'}`} style={{ fontSize: 12, marginTop: 6 }}
                                onClick={() => (chosen ? dropKtru(m.code) : pickKtru(m.code, m.name))}>
                                {chosen ? '✓ выбрано — убрать' : 'Выбрать'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Шаг 3: Характеристики → Product Profile ── */}
          {step === 3 && (
            <div>
              <h3 style={{ margin: '0 0 4px' }}>Характеристики</h3>

              {/* §16 — по какому КТРУ */}
              <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {ktruCodes.length > 1 ? 'Основной КТРУ' : 'Характеристики сформированы по КТРУ'}:{' '}
                <b style={{ fontFamily: 'ui-monospace, monospace' }}>{ktruCodes[0]}</b>
                {ktruCodes.length > 1 && ' · остальные коды в анализе не объединяются'}
              </div>

              {charLoading && (
                <div style={{ fontSize: 13 }}>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                    <Loader2 size={15} className="spin" /> Анализируем технические спецификации
                  </p>
                  <ol style={{ margin: 0, paddingLeft: 20, color: 'rgba(32,30,29,0.6)' }}>
                    {LOADING_STEPS.map((s) => <li key={s} style={{ marginBottom: 2 }}>{s}</li>)}
                  </ol>
                </div>
              )}

              {charError && !charLoading && (
                <div style={{ fontSize: 13, margin: '10px 0' }}>
                  <p style={{ margin: '0 0 6px' }}>Не удалось проанализировать технические спецификации.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => analyzeKtruChars(true)}>Повторить</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={continueWithoutAuto}>Продолжить без автоподбора</button>
                  </div>
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>Введённые значения не потеряны.</p>
                </div>
              )}

              {noSpecs && !skippedAuto && (
                <div style={{ fontSize: 13, margin: '10px 0' }}>
                  <p style={{ margin: '0 0 6px' }}>Для выбранного КТРУ пока не удалось найти доступные технические спецификации.</p>
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={continueWithoutAuto}>Продолжить без автоподбора</button>
                </div>
              )}

              {!charLoading && !charError && !noSpecs && (
                <>
                  {charResult && charResult.analyzedSpecs > 0 && (
                    <p className="text-muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>
                      Система изучила {charResult.analyzedSpecs} технических спецификаций и выделила характеристики,
                      которые чаще всего требуются заказчиками. {analyzedText}.
                    </p>
                  )}
                  {skippedAuto && (
                    <p className="text-muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>
                      Автоподбор пропущен — заполните характеристики вручную.
                    </p>
                  )}

                  {mainRows.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 8 }}>ОСНОВНЫЕ</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {mainRows.map(({ c, i }) => (
                          <CharRow key={i} c={c} i={i} prominent openSrc={openSrc} setOpenSrc={setOpenSrc} setRow={setRow} delRow={delRow} />
                        ))}
                      </div>
                    </div>
                  )}

                  {addRows.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, paddingInline: 0, fontWeight: 700, letterSpacing: '0.04em' }} onClick={() => setShowAdditional((v) => !v)}>
                        {showAdditional ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        ДОПОЛНИТЕЛЬНЫЕ ({addRows.length})
                      </button>
                      {showAdditional && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                          {addRows.map(({ c, i }) => (
                            <CharRow key={i} c={c} i={i} openSrc={openSrc} setOpenSrc={setOpenSrc} setRow={setRow} delRow={delRow} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button className="btn btn-ghost" style={{ paddingInline: 0, fontSize: 12 }}
                    onClick={() => setChars((cs) => [...cs, { ...emptyChar(), _level: 'custom' }])}>
                    <Plus size={12} /> Добавить характеристику
                  </button>

                  <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
                    Значения вводите сами — примеры из ТЗ показывают, что требует рынок, а не ваш товар.
                    Заполнять всё необязательно.
                  </p>
                </>
              )}
            </div>
          )}
        </Dialog>
      )}
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
