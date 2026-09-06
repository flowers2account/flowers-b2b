'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Loader2, Check, Wand2 } from 'lucide-react'
import { useSmartKtru, emptyChar } from '@/lib/smart-ktru/store'
import type { ProductCharacteristic } from '@/lib/smart-ktru/types'
import { Btn, Card, Dialog, Field } from '@/components/smart-ktru/kit'

const PRESET: ProductCharacteristic[] = [
  { name: 'Диаметр', value: '', unit: 'см' },
  { name: 'Материал', value: '', unit: '' },
  { name: 'Цвет', value: '', unit: '' },
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

/** Карточка товара: подтягивает число живых закупок по КТРУ (без AI). */
function ProductCard({ id }: { id: string }) {
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
  const summary = p.characteristics
    .map((c) => `${c.name} ${c.value}${c.unit ? ' ' + c.unit : ''}`)
    .join(' · ')

  return (
    <Card kicker={(p.category || 'Товар').toUpperCase()}>
      <div className="card-title">{p.name}</div>
      <p className="card-body">{summary || 'без характеристик'}</p>
      <div className="hr" style={{ margin: '4px 0' }} />
      <div className="card-meta">
        {p.costPerUnit != null
          ? `Себестоимость: ${p.costPerUnit.toLocaleString('ru-RU')} ₸ / ${p.saleUnit || 'шт'}`
          : 'Себестоимость не указана'}
        {p.ktruCodes?.length
          ? ` · КТРУ ${p.ktruCodes.join(', ')}`
          : ''}
      </div>
      <div style={{ fontSize: 13, marginTop: 4 }}>
        {count == null ? 'Считаем подходящие закупки…' : <><b>{count}</b> подходящих закупок</>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Link className="btn btn-secondary btn-block" href={`/smart-ktru/procurements?product=${p.id}`}>
          Смотреть закупки →
        </Link>
        <button className="btn btn-ghost btn-icon" aria-label="Удалить" onClick={() => removeProduct(p.id)}>
          <Trash2 size={15} />
        </button>
      </div>
    </Card>
  )
}

export default function ProductsPage() {
  const products = useSmartKtru((s) => s.products)
  const addProduct = useSmartKtru((s) => s.addProduct)
  const ensureDemoSeed = useSmartKtru((s) => s.ensureDemoSeed)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [cost, setCost] = useState('')
  const [unit, setUnit] = useState('шт')
  const [chars, setChars] = useState<ProductCharacteristic[]>(PRESET.map((c) => ({ ...c })))

  // --- Auto KTRU Match ---
  const [ktruCodes, setKtruCodes] = useState<string[]>([])
  const [ktruNames, setKtruNames] = useState<Record<string, string>>({})
  const [matches, setMatches] = useState<KtruMatch[] | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState(false)
  const [confident, setConfident] = useState(true)
  const [manualMode, setManualMode] = useState(false)
  const [manualCode, setManualCode] = useState('')

  useEffect(() => {
    ensureDemoSeed()
  }, [ensureDemoSeed])

  // повторный запуск НЕ трогает ktruCodes — уже выбранные коды сохраняются
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
          characteristics: chars.filter((c) => c.name.trim() || (c.value ?? '').trim()),
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

  function reset() {
    setName(''); setCategory(''); setCost(''); setUnit('шт')
    setChars(PRESET.map((c) => ({ ...c })))
    setKtruCodes([]); setKtruNames({}); setMatches(null); setMatching(false)
    setMatchError(false); setConfident(true); setManualMode(false); setManualCode('')
  }
  function save() {
    if (!name.trim() || !cost.trim()) return
    addProduct({
      name: name.trim(),
      category: category.trim() || undefined,
      costPerUnit: Number(cost),
      saleUnit: unit.trim() || 'шт',
      ktruCodes: ktruCodes.length ? ktruCodes : undefined,
      characteristics: chars.filter((c) => c.name.trim() && (c.value ?? '').trim()),
    })
    setOpen(false)
    reset()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Мои товары</h1>
        <Btn variant="primary" onClick={() => setOpen(true)}>
          <Plus size={15} /> Добавить товар
        </Btn>
      </div>
      <p className="text-muted" style={{ maxWidth: '60ch' }}>
        Опишите товар — система сама подберёт КТРУ и найдёт под него живые государственные закупки.
      </p>
      <div className="hr" />

      {products.length === 0 ? (
        <p className="text-muted">Пока нет товаров. Нажмите «Добавить товар».</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {products.map((p) => <ProductCard key={p.id} id={p.id} />)}
        </div>
      )}

      {open && (
        <Dialog
          title="Новый товар"
          onClose={() => setOpen(false)}
          actions={
            <>
              <button className="btn btn-primary" disabled={!name.trim() || !cost.trim()} onClick={save}>
                Сохранить
              </button>
              <button className="btn btn-secondary" onClick={() => { setOpen(false); reset() }}>Отмена</button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Название товара">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Горшок пластиковый для цветов" />
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

            <div>
              <div className="field"><label>Характеристики (для подбора КТРУ и сравнения с ТС)</label></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {chars.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input className="input" style={{ width: 130 }} value={c.name} placeholder="параметр"
                      onChange={(e) => setChars((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input className="input" value={c.value ?? ''} placeholder="значение"
                      onChange={(e) => setChars((cs) => cs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                    <input className="input" style={{ width: 56 }} value={c.unit ?? ''} placeholder="ед."
                      onChange={(e) => setChars((cs) => cs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                    <button className="btn btn-ghost btn-icon" onClick={() => setChars((cs) => cs.filter((_, j) => j !== i))}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="btn btn-ghost" style={{ paddingInline: 0, fontSize: 12, marginTop: 6 }} onClick={() => setChars((cs) => [...cs, emptyChar()])}>
                <Plus size={12} /> Добавить характеристику
              </button>
            </div>

            <div className="hr" style={{ margin: '2px 0' }} />

            {/* --- КТРУ: автоподбор --- */}
            <div>
              <div className="field"><label>КТРУ</label></div>

              {ktruCodes.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <b style={{ fontSize: 13 }}>Выбрано КТРУ: {ktruCodes.length}</b>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, paddingInline: 0 }}
                      disabled={!name.trim() || matching}
                      onClick={runMatch}
                      title="Показать кандидатов заново — текущий выбор сохранится"
                    >
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
                  <input
                    className="input"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }}
                    placeholder="222929.900.000114"
                  />
                  <button className="btn btn-secondary" onClick={addManual} disabled={!manualCode.trim()}>Добавить</button>
                </div>
              )}

              {matching && (
                <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>Подбираем КТРУ…</p>
              )}

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
                              <button
                                className={`btn ${chosen ? 'btn-ghost' : 'btn-secondary'}`}
                                style={{ fontSize: 12, marginTop: 6 }}
                                onClick={() => (chosen ? dropKtru(m.code) : pickKtru(m.code, m.name))}
                              >
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
          </div>
        </Dialog>
      )}
    </div>
  )
}
