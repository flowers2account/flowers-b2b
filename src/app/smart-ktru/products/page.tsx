'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Search } from 'lucide-react'
import { useSmartKtru, emptyChar } from '@/lib/smart-ktru/store'
import type { ProductCharacteristic } from '@/lib/smart-ktru/types'
import { Btn, Card, Dialog, Field } from '@/components/smart-ktru/kit'

const PRESET: ProductCharacteristic[] = [
  { name: 'Диаметр', value: '', unit: 'см' },
  { name: 'Материал', value: '', unit: '' },
  { name: 'Цвет', value: '', unit: '' },
]

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
        {p.ktruCodes?.[0] ? ` · КТРУ ${p.ktruCodes[0]}` : ''}
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
  const [ktru, setKtru] = useState('')
  const [chars, setChars] = useState<ProductCharacteristic[]>(PRESET.map((c) => ({ ...c })))
  const [ktruHits, setKtruHits] = useState<{ code: string; nameRu: string; score: number }[]>([])

  useEffect(() => {
    ensureDemoSeed()
  }, [ensureDemoSeed])

  async function suggestKtru() {
    if (!name.trim()) return
    const r = await fetch(`/api/ktru/search?q=${encodeURIComponent(name)}&limit=4`)
    if (r.ok) {
      const j = await r.json()
      setKtruHits(j.results ?? [])
      if (j.results?.[0] && !ktru) setKtru(j.results[0].code)
    }
  }

  function reset() {
    setName(''); setCategory(''); setCost(''); setUnit('шт'); setKtru(''); setKtruHits([])
    setChars(PRESET.map((c) => ({ ...c })))
  }
  function save() {
    if (!name.trim() || !cost.trim()) return
    addProduct({
      name: name.trim(),
      category: category.trim() || undefined,
      costPerUnit: Number(cost),
      saleUnit: unit.trim() || 'шт',
      ktruCodes: ktru ? [ktru] : undefined,
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
        Опишите товар — система найдёт под него живые государственные закупки и оценит, стоит ли участвовать.
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
            <Field label="Название">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={suggestKtru} placeholder="Горшок пластиковый" />
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
            <Field label="КТРУ">
              <input className="input" value={ktru} onChange={(e) => setKtru(e.target.value)} placeholder="222929.900.000114" />
            </Field>
            {ktruHits.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button className="btn btn-ghost" style={{ paddingInline: 4, fontSize: 12 }} onClick={suggestKtru}>
                  <Search size={12} /> обновить
                </button>
                {ktruHits.map((h) => (
                  <button
                    key={h.code}
                    className="btn btn-secondary"
                    style={{ fontSize: 12, borderColor: ktru === h.code ? '#ec3013' : undefined }}
                    onClick={() => setKtru(h.code)}
                  >
                    {h.code} · {h.nameRu} · {h.score.toFixed(2)}
                  </button>
                ))}
              </div>
            )}
            <div>
              <div className="field"><label>Характеристики (для сравнения с ТС)</label></div>
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
                <Plus size={12} /> ещё характеристика
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
