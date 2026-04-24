'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean } | null
type Product = { id: number; name: string; category: string; is_active: boolean; pack_size: number; stock: Stock[] | Stock; active_reserved?: number }

function getStock(s: Stock[] | Stock): Stock {
  if (Array.isArray(s)) return s[0] ?? null
  return s
}

function StockRow({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const s = getStock(product.stock)
  const [qty, setQty] = useState(String(s?.qty ?? 0))
  const [price, setPrice] = useState(String(s?.price ?? 0))
  const [packSize, setPackSize] = useState(String(product.pack_size ?? 5))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  async function save() {
    setSaving(true)
    await supabase
      .from('stock')
      .update({ qty: parseInt(qty), price: parseFloat(price), updated_at: new Date().toISOString() })
      .eq('product_id', product.id)
    await supabase.from('products')
      .update({ pack_size: parseInt(packSize) })
      .eq('product_id', product.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSaved()
  }

  const available = (s?.qty ?? 0) - (s?.qty_reserved ?? 0)

  return (
    <TableRow>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell>
        <Badge variant={product.category === 'cut' ? 'default' : 'secondary'}>
          {product.category === 'cut' ? '✂️ Срез' : '🪴 Горшок'}
        </Badge>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={qty}
          onChange={e => setQty(e.target.value)}
          className="w-24 h-8 text-center"
        />
      </TableCell>
      <TableCell className="text-center text-sm text-muted-foreground">
        {available} шт
      </TableCell>
      <TableCell className="text-center text-sm text-muted-foreground">
        {product.active_reserved ?? 0} шт
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={price}
          onChange={e => setPrice(e.target.value)}
          className="w-28 h-8 text-center"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={packSize}
          onChange={e => setPackSize(e.target.value)}
          className="w-20 h-8 text-center"
        />
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          onClick={save}
          disabled={saving}
          className={saved ? 'bg-green-600 hover:bg-green-700' : ''}
        >
          {saving ? '...' : saved ? '✓ Сохранено' : 'Сохранить'}
        </Button>
      </TableCell>
    </TableRow>
  )
}

export default function AdminTable({ products }: { products: Product[] }) {
  const [search, setSearch] = useState('')
  const [refresh, setRefresh] = useState(0)

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
            <TableRow>
              <TableHead>Наименование</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead className="text-center">Остаток</TableHead>
              <TableHead className="text-center">Доступно</TableHead>
              <TableHead className="text-center">Резерв</TableHead>
              <TableHead className="text-center">Цена (₸)</TableHead>
              <TableHead className="text-center">Уп.</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(p => (
              <StockRow key={p.id} product={p} onSaved={() => setRefresh(r => r + 1)} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
