'use client'

import { useState, useEffect, useRef } from 'react'
import { removeBackground } from '@imgly/background-removal'
import { createClient } from '@/lib/supabase/client'
import { leafForSubcat } from '@/lib/category-tree'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { COLORS } from '@/lib/colors'
import { authHeaders } from '@/lib/api-token'
import ProductEditModal from './ProductEditModal'

const BG_TINT = '#FFFFFF'

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean; reserved_qty?: number } | null
type Product = { id: number; name: string; display_name?: string | null; category: string; is_active: boolean; pack_size: number; stems_per_pack?: number | null; image_url?: string | null; campaign_image_url?: string | null; colors?: string[] | null; arrival_date?: string | null; country_iso?: string | null; farm?: string | null; is_new?: boolean; stock: Stock[] | Stock }

// Готовое (обработанное в браузере) фото → серверный роут.
// Роут сам решает бэкенд (VPS-диск или Supabase Storage), чистит старый файл и
// возвращает публичный url. Имя файла генерится на сервере из productId.
async function persistPhoto(
  productId: number, file: File, slot: 'main' | 'campaign', oldUrl: string | null,
): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('productId', String(productId))
  fd.append('slot', slot)
  if (oldUrl) fd.append('oldUrl', oldUrl)
  const res = await fetch('/api/admin/upload-photo', {
    method: 'POST', body: fd, headers: await authHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `upload failed (${res.status})`)
  return json.url as string
}

function getStock(s: Stock[] | Stock): Stock {
  if (Array.isArray(s)) return s[0] ?? null
  return s
}

function StockRow({ product, onSaved, onEdit }: {
  product: Product
  onSaved: () => void
  onEdit: (id: number) => void
}) {
  const s = getStock(product.stock)
  const [qty, setQty] = useState(String(s?.qty ?? 0))
  const [price, setPrice] = useState(String(s?.price ?? 0))
  const [packSize, setPackSize] = useState(String(product.pack_size ?? 5))
  const [stemsPerPack, setStemsPerPack] = useState(String(product.stems_per_pack ?? ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [imageUrl, setImageUrl] = useState(product.image_url ?? null)
  const [campaignImageUrl, setCampaignImageUrl] = useState(product.campaign_image_url ?? '')
  const [uploadStep, setUploadStep] = useState<'' | 'bg' | 'save'>('')
  const [campaignUploadStep, setCampaignUploadStep] = useState<'' | 'bg' | 'save'>('')
  const uploading = uploadStep !== ''
  const campaignUploading = campaignUploadStep !== ''
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [colors, setColors] = useState<string[]>(product.colors ?? [])
  const [colorsOpen, setColorsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const campaignFileInputRef = useRef<HTMLInputElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!colorsOpen) return
    function onOutsideClick(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorsOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [colorsOpen])

  function toggleColor(key: string) {
    setColors(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }

  async function save() {
    setSaving(true)
    await supabase
      .from('products')
      .update({
        qty: parseInt(qty),
        price: parseFloat(price),
        pack_size: parseInt(packSize),
        colors,
      })
      .eq('id', product.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSaved()
  }

  async function downscaleImage(file: File | Blob, maxPx: number): Promise<Blob> {
    return new Promise(resolve => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.round(img.naturalWidth * scale)
        const h = Math.round(img.naturalHeight * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.92)
      }
      img.src = url
    })
  }

  async function removeBgClient(input: Blob): Promise<Blob> {
    const pngBlob = await removeBackground(input)
    return new Promise(resolve => {
      const img = new Image()
      const url = URL.createObjectURL(pngBlob)
      img.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.round(img.naturalWidth * scale)
        const h = Math.round(img.naturalHeight * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = BG_TINT
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.88)
      }
      img.src = url
    })
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStep('bg')
    setUploadMsg(null)
    try {
      const scaled = await downscaleImage(file, 1500)
      const processed = await removeBgClient(scaled)
      const processedFile = new File([processed], 'photo.jpg', { type: 'image/jpeg' })

      setUploadStep('save')
      const publicUrl = await persistPhoto(product.id, processedFile, 'main', imageUrl)
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id)
      setImageUrl(publicUrl)
    } catch (err) {
      setUploadMsg('Ошибка обработки: ' + (err instanceof Error ? err.message : 'неизвестная'))
      setTimeout(() => setUploadMsg(null), 6000)
    } finally {
      setUploadStep('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleCampaignImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCampaignUploadStep('bg')
    setUploadMsg(null)
    try {
      const scaled = await downscaleImage(file, 1500)
      const processed = await removeBgClient(scaled)
      const processedFile = new File([processed], 'photo.jpg', { type: 'image/jpeg' })

      setCampaignUploadStep('save')
      const publicUrl = await persistPhoto(product.id, processedFile, 'campaign', campaignImageUrl)
      await supabase.from('products').update({ campaign_image_url: publicUrl }).eq('id', product.id)
      setCampaignImageUrl(publicUrl)
    } catch (err) {
      setUploadMsg('Ошибка обработки: ' + (err instanceof Error ? err.message : 'неизвестная'))
      setTimeout(() => setUploadMsg(null), 6000)
    } finally {
      setCampaignUploadStep('')
      if (campaignFileInputRef.current) campaignFileInputRef.current.value = ''
    }
  }

const available = (s?.qty ?? 0) - (s?.qty_reserved ?? 0)
  const activeReserved = s?.reserved_qty ?? 0
  const reserveClass = activeReserved > 0 ? 'text-green-600 font-semibold' : 'text-muted-foreground'

  const noStock = (s?.qty ?? 0) === 0

  return (
    <TableRow className={`text-xs ${noStock ? 'opacity-50' : ''}`}>
      <TableCell className="py-1 px-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {product.is_new && (
            <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">NEW</span>
          )}
          {!product.is_active && (
            <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded flex-shrink-0">новый</span>
          )}
          {/* Основное фото — загрузка через remove.bg */}
          <div className="flex flex-col items-center gap-0.5">
            <div
              className="relative w-7 h-7 rounded flex-shrink-0 cursor-pointer group"
              onClick={() => !uploading && fileInputRef.current?.click()}
              title="Загрузить фото (удаление фона)"
            >
              {imageUrl ? (
                <img src={imageUrl} alt="" className="w-7 h-7 rounded object-cover" />
              ) : (
                <div className="w-7 h-7 rounded bg-gray-100" />
              )}
              <div className="absolute inset-0 rounded bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadStep === 'bg'
                  ? <span className="text-white text-[8px] leading-tight text-center px-0.5">удаляю фон…</span>
                  : uploadStep === 'save'
                  ? <span className="text-white text-[8px] leading-tight text-center px-0.5">сохраняю…</span>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                }
              </div>
            </div>
            {uploadMsg && (
              <span className="text-[9px] text-amber-600 leading-tight max-w-[120px] text-center">{uploadMsg}</span>
            )}
          </div>
          {/* Фото кампании */}
          <div
            className="relative w-7 h-7 rounded flex-shrink-0 cursor-pointer group"
            title="Загрузить второе фото (кампания / ховер)"
            onClick={() => campaignFileInputRef.current?.click()}
          >
            {campaignImageUrl ? (
              <img src={campaignImageUrl} alt="" className="w-7 h-7 rounded object-cover" style={{ outline: '2px solid #7a1c2e', outlineOffset: 1 }} />
            ) : (
              <div className="w-7 h-7 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center group-hover:border-[#7a1c2e] group-hover:bg-pink-50 transition-colors">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" className="group-hover:stroke-[#7a1c2e]"><path d="M12 5v14M5 12h14"/></svg>
              </div>
            )}
            <div className="absolute inset-0 rounded bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {campaignUploadStep === 'bg'
                ? <span className="text-white text-[8px] leading-tight text-center px-0.5">удаляю фон…</span>
                : campaignUploadStep === 'save'
                ? <span className="text-white text-[8px] leading-tight text-center px-0.5">сохраняю…</span>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              }
            </div>
          </div>
          <span
            className="font-medium truncate hover:text-[#8B1A1A] cursor-pointer underline-offset-2 hover:underline"
            onClick={() => onEdit(product.id)}
            title="Редактировать"
          >{product.display_name || product.name}</span>
        </div>
      </TableCell>
      <TableCell className="py-1 px-1">
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {product.category === 'cut' ? '✂️' : product.category === 'pot' ? '🪴' : '📦'}
        </span>
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input
          type="number"
          value={qty}
          onChange={e => setQty(e.target.value)}
          className="w-16 h-7 text-center text-xs px-1"
        />
      </TableCell>
      <TableCell className="py-1 px-1 text-center text-xs text-muted-foreground whitespace-nowrap">
        {available}
      </TableCell>
      <TableCell className={`py-1 px-1 text-center text-xs whitespace-nowrap ${reserveClass}`}>
        {activeReserved}
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input
          type="number"
          value={price}
          onChange={e => setPrice(e.target.value)}
          className="w-20 h-7 text-center text-xs px-1"
        />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input
          type="number"
          value={packSize}
          onChange={e => setPackSize(e.target.value)}
          className="w-14 h-7 text-center text-xs px-1"
        />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input
          type="number"
          min="0"
          step="1"
          value={stemsPerPack}
          onChange={e => setStemsPerPack(e.target.value)}
          className="w-14 h-7 text-center text-xs px-1"
          placeholder="—"
        />
      </TableCell>
      {/* Color picker cell */}
      <TableCell className="py-1 px-1">
        <div ref={colorPickerRef} className="relative">
          <button
            onClick={() => setColorsOpen(prev => !prev)}
            className="flex flex-wrap gap-0.5 items-center min-w-[44px] h-7 px-1 border border-dashed rounded hover:border-gray-400 transition-colors"
            style={{ borderColor: colorsOpen ? '#7a1c2e' : undefined }}
            title="Редактировать цвета"
          >
            {colors.length === 0 ? (
              <span className="text-[11px] text-gray-300">+цвет</span>
            ) : (
              colors.slice(0, 5).map(c => {
                const col = COLORS.find(x => x.key === c)
                if (!col) return null
                return (
                  <span
                    key={c}
                    style={{
                      width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
                      background: ('gradient' in col ? col.gradient : col.bg) as string,
                      border: '1px solid rgba(0,0,0,0.18)',
                      display: 'inline-block',
                    }}
                  />
                )
              })
            )}
            {colors.length > 5 && (
              <span className="text-[10px] text-gray-400 ml-0.5">+{colors.length - 5}</span>
            )}
          </button>

          {colorsOpen && (
            <div
              className="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3"
              style={{ top: 'calc(100% + 4px)', left: 0, width: 220 }}
            >
              <div className="flex flex-wrap gap-2 mb-2">
                {COLORS.map(col => {
                  const active = colors.includes(col.key)
                  return (
                    <button
                      key={col.key}
                      title={col.label}
                      onClick={() => toggleColor(col.key)}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                        background: ('gradient' in col ? col.gradient : col.bg) as string,
                        border: active ? '2.5px solid #7a1c2e' : '1.5px solid rgba(0,0,0,0.15)',
                        outline: active ? '2px solid rgba(122,28,46,0.25)' : 'none',
                        outlineOffset: 1,
                        flexShrink: 0,
                      }}
                    />
                  )
                })}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <span className="text-[11px] text-gray-400">
                  {colors.length > 0 ? colors.map(c => COLORS.find(x => x.key === c)?.label).join(', ') : 'Не выбрано'}
                </span>
                <button
                  onClick={() => setColorsOpen(false)}
                  className="text-xs font-medium px-2 py-0.5 rounded"
                  style={{ color: '#7a1c2e' }}
                >
                  Готово
                </button>
              </div>
            </div>
          )}
        </div>
      </TableCell>

      <TableCell className="py-1 px-1 text-center">
        {product.arrival_date ? (
          <span className="text-[10px] text-gray-500 whitespace-nowrap">
            {new Date(product.arrival_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </TableCell>
      <TableCell className="py-1 px-1">
        <Button
          size="sm"
          onClick={save}
          disabled={saving}
          className={`h-7 text-xs px-2 ${saved ? 'bg-green-600 hover:bg-green-700' : ''}`}
        >
          {saving ? '...' : saved ? '✓' : 'Сохр.'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageUpload}
        />
        <input
          ref={campaignFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCampaignImageUpload}
        />
      </TableCell>
    </TableRow>
  )
}

const CAT_FILTERS = [
  { key: 'cut',         label: '✂️ Срез'    },
  { key: 'pot',         label: '🪴 Горшок'  },
  { key: 'accessories', label: '📦 Расходка' },
] as const

const SUBCAT_LABELS: Record<string, string> = {
  // cut
  roses: 'Розы', chrysanthemums: 'Хризантемы', carnations: 'Гвоздики',
  tulips: 'Тюльпаны', peonies: 'Пионы', lilies: 'Лилии', gerberas: 'Герберы',
  lisianthus: 'Эустомы', alstroemeria: 'Альстромерии', hydrangeas: 'Гортензии',
  orchids: 'Орхидеи', callas: 'Каллы', anthuriums: 'Антуриумы', proteas: 'Протеи',
  sunflowers: 'Подсолнухи', ranunculus: 'Ранункулюсы', anemones: 'Анемоны',
  irises: 'Ирисы', delphiniums: 'Дельфиниумы', freesia: 'Фрезия', asters: 'Астры',
  dahlia: 'Георгин', greens: 'Зелень', branches: 'Ветки', fillers: 'Наполнители',
  texture: 'Текстурные', berries: 'Ягоды', vines: 'Лианы',
  // pot
  flowering: 'Цветущие', green: 'Декор.-лиственные', succulents: 'Суккуленты',
  cacti: 'Кактусы', palms: 'Пальмы', ficus: 'Фикусы', dracaena: 'Драцена',
  calathea: 'Калатея', zamioculcas: 'Замиокулькас', large: 'Крупномеры',
  outdoor: 'Садовые', perennials: 'Многолетние', conifers: 'Хвойные',
  // accessories — лейблы берутся из category-tree.ts (leafForSubcat)
}

// accessories → category-tree.ts; cut/pot → SUBCAT_LABELS; fallback — сам slug
const subcatLabel = (key: string): string =>
  leafForSubcat(key)?.label ?? SUBCAT_LABELS[key] ?? key

export default function AdminTable() {
  const [search, setSearch] = useState('')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>('')
  const [availableSubcats, setAvailableSubcats] = useState<{ key: string; label: string }[]>([])
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)

  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(id)
  }, [search])

  // Load subcategories from DB when category changes
  useEffect(() => {
    setSubcategoryFilter('')
    if (!categoryFilter) { setAvailableSubcats([]); return }
    const supabase = createClient()
    supabase
      .from('products')
      .select('subcategory')
      .eq('category', categoryFilter)
      .not('subcategory', 'is', null)
      .then(({ data: rows }: { data: { subcategory: string | null }[] | null }) => {
        const counts: Record<string, number> = {}
        for (const r of rows ?? []) {
          if (r.subcategory) counts[r.subcategory] = (counts[r.subcategory] || 0) + 1
        }
        const list = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([key]) => ({ key, label: subcatLabel(key) }))
        setAvailableSubcats(list)
      })
  }, [categoryFilter])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedSearch)  params.set('search', debouncedSearch)
    if (inStockOnly)      params.set('inStock', 'true')
    if (categoryFilter)   params.set('category', categoryFilter)
    if (subcategoryFilter) params.set('subcategory', subcategoryFilter)
    const res = await fetch(`/api/admin/products?${params}`)
    const json = await res.json()
    setData(Array.isArray(json) ? json : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [debouncedSearch, inStockOnly, categoryFilter, subcategoryFilter])

  // Realtime: reload on reservation changes
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div>
      {/* Тулбар */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder="🔍 Поиск по названию, сорту, стране, длине..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-8"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >×</button>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <div
            role="switch"
            aria-checked={inStockOnly}
            onClick={() => setInStockOnly(v => !v)}
            className="relative"
            style={{
              width: 34, height: 20, borderRadius: 10,
              background: inStockOnly ? '#3D6B50' : '#d1d5db',
              cursor: 'pointer', flexShrink: 0, transition: 'background 0.18s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: inStockOnly ? 17 : 3,
              width: 14, height: 14,
              borderRadius: '50%', background: '#fff',
              transition: 'left 0.18s',
            }} />
          </div>
          <span className="text-sm font-medium">В наличии</span>
        </label>

        <Badge variant="outline" className="whitespace-nowrap">
          {loading ? '...' : `${data.length} позиций`}
        </Badge>
      </div>

      {/* Category filter buttons */}
      <div className="flex gap-2 mb-2 flex-wrap">
        {CAT_FILTERS.map(f => {
          const active = categoryFilter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setCategoryFilter(active ? '' : f.key)}
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{
                background: active ? '#7a1c2e' : '#fff',
                borderColor: active ? '#7a1c2e' : '#e5e7eb',
                color: active ? '#fff' : '#6b7280',
                fontWeight: active ? 600 : 400,
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Subcategory chips — появляются когда выбрана категория */}
      {availableSubcats.length > 0 && (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {availableSubcats.map(s => {
            const active = subcategoryFilter === s.key
            return (
              <button
                key={s.key}
                onClick={() => setSubcategoryFilter(active ? '' : s.key)}
                className="text-xs px-2.5 py-0.5 rounded-full border transition-colors"
                style={{
                  background: active ? '#4a6741' : '#f9fafb',
                  borderColor: active ? '#4a6741' : '#e5e7eb',
                  color: active ? '#fff' : '#6b7280',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="py-2 px-2">Наименование</TableHead>
              <TableHead className="py-2 px-1 w-8">Кат.</TableHead>
              <TableHead className="py-2 px-1 text-center w-20">Остаток</TableHead>
              <TableHead className="py-2 px-1 text-center w-14">Дост.</TableHead>
              <TableHead className="py-2 px-1 text-center w-14">Рез.</TableHead>
              <TableHead className="py-2 px-1 text-center w-24">Цена ₸</TableHead>
              <TableHead className="py-2 px-1 text-center w-16">Уп.</TableHead>
              <TableHead className="py-2 px-1 text-center w-16">Стебл.</TableHead>
              <TableHead className="py-2 px-1 text-center w-12">Цвет</TableHead>
              <TableHead className="py-2 px-1 w-24">Поступл.</TableHead>
              <TableHead className="py-2 px-1 w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">Загрузка...</TableCell>
              </TableRow>
            )}
            {!loading && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">Ничего не найдено</TableCell>
              </TableRow>
            )}
            {!loading && data.map(p => (
              <StockRow
                key={p.id}
                product={p}
                onSaved={load}
                onEdit={setEditId}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {editId !== null && (
        <ProductEditModal
          productId={editId}
          onClose={() => setEditId(null)}
          onSaved={() => { load(); setEditId(null) }}
        />
      )}
    </div>
  )
}
