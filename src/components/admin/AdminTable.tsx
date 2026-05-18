'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { COLORS } from '@/lib/colors'

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean; reserved_qty?: number } | null
type Product = { id: number; name: string; category: string; is_active: boolean; pack_size: number; stems_per_pack?: number | null; image_url?: string | null; campaign_image_url?: string | null; colors?: string[] | null; stock: Stock[] | Stock }

const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .split('')
    .map(c => TRANSLIT[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getStock(s: Stock[] | Stock): Stock {
  if (Array.isArray(s)) return s[0] ?? null
  return s
}

function StockRow({ product, onSaved }: {
  product: Product
  onSaved: () => void
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
  const [uploading, setUploading] = useState(false)
  const [colors, setColors] = useState<string[]>(product.colors ?? [])
  const [colorsOpen, setColorsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
      .from('stock')
      .update({ qty: parseInt(qty), price: parseFloat(price), updated_at: new Date().toISOString() })
      .eq('product_id', product.id)
    await supabase.from('products')
      .update({ pack_size: parseInt(packSize), colors, stems_per_pack: stemsPerPack ? parseInt(stemsPerPack) : null, campaign_image_url: campaignImageUrl.trim() || null })
      .eq('id', product.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSaved()
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${slugify(product.name)}.${ext}`

    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: true })

    if (!error) {
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(path)

      // Append cache-buster so browser shows fresh image
      const urlWithBust = `${publicUrl}?t=${Date.now()}`
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id)
      setImageUrl(urlWithBust)
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const available = (s?.qty ?? 0) - (s?.qty_reserved ?? 0)
  const activeReserved = s?.reserved_qty ?? 0
  const reserveClass = activeReserved > 0 ? 'text-green-600 font-semibold' : 'text-muted-foreground'

  return (
    <TableRow className="text-xs">
      <TableCell className="py-1 px-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Основное фото — загрузка файлом */}
          <div
            className="relative w-7 h-7 rounded flex-shrink-0 cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
            title="Загрузить фото"
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="w-7 h-7 rounded object-cover" />
            ) : (
              <div className="w-7 h-7 rounded bg-gray-100" />
            )}
            <div className="absolute inset-0 rounded bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploading
                ? <span className="text-white text-[8px]">...</span>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              }
            </div>
          </div>
          {/* Фото кампании — URL через prompt */}
          <div
            className="relative w-7 h-7 rounded flex-shrink-0 cursor-pointer group"
            title={campaignImageUrl ? `Фото кампании: ${campaignImageUrl}` : 'Задать фото для кампаний'}
            onClick={async () => {
              const url = prompt('URL фото для кампаний:', campaignImageUrl)
              if (url === null) return
              const trimmed = url.trim() || null
              setCampaignImageUrl(trimmed ?? '')
              await supabase.from('products').update({ campaign_image_url: trimmed }).eq('id', product.id)
            }}
          >
            {campaignImageUrl ? (
              <>
                <img src={campaignImageUrl} alt="" className="w-7 h-7 rounded object-cover" style={{ outline: '2px solid #7a1c2e', outlineOffset: 1 }} />
                <div className="absolute inset-0 rounded bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </div>
              </>
            ) : (
              <div className="w-7 h-7 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center group-hover:border-[#7a1c2e] group-hover:bg-pink-50 transition-colors">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" className="group-hover:stroke-[#7a1c2e]"><path d="M12 5v14M5 12h14"/></svg>
              </div>
            )}
          </div>
          <span className="font-medium truncate">{product.name}</span>
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

      <TableCell className="py-1 px-1">
        <Input
          type="text"
          value={campaignImageUrl}
          onChange={e => setCampaignImageUrl(e.target.value)}
          className="w-28 h-7 text-[10px] px-1"
          placeholder="URL кампании"
          title="Фото для кампаний"
        />
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
          className="hidden"
          onChange={handleImageUpload}
        />
      </TableCell>
    </TableRow>
  )
}

export default function AdminTable({ products, onReload }: { products: Product[]; onReload?: () => void }) {
  const [search, setSearch] = useState('')

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('reservations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        onReload?.()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [onReload])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="🔍 Поиск..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Badge variant="outline" className="self-center">
          {filtered.length} позиций
        </Badge>
      </div>
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
              <TableHead className="py-2 px-1 w-32">Фото кам.</TableHead>
              <TableHead className="py-2 px-1 w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(p => (
              <StockRow
                key={p.id}
                product={p}
                onSaved={() => {}}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
