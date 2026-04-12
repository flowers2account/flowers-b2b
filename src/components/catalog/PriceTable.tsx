'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean } | null
type Product = {
  id: number; name: string; category: string
  length_cm: number | null; pot_diameter: number | null
  stock: Stock[] | Stock
}

function getStock(s: Stock[] | Stock): Stock {
  if (Array.isArray(s)) return s[0] ?? null
  return s
}

function QtyBadge({ qty, reserved }: { qty: number; reserved: number }) {
  const available = qty - reserved
  if (available <= 5) return <Badge variant="destructive">{available} шт</Badge>
  if (available <= 30) return <Badge className="bg-orange-500 hover:bg-orange-600">{available} шт</Badge>
  return <Badge className="bg-green-600 hover:bg-green-700">{available} шт</Badge>
}

function formatPrice(p: number) {
  return p.toLocaleString('ru-RU') + ' ₸'
}

function ProductTable({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return <p className="text-center text-muted-foreground py-12">Нет позиций</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Наименование</TableHead>
          <TableHead className="text-center">Размер</TableHead>
          <TableHead className="text-center">Остаток</TableHead>
          <TableHead className="text-right">Цена</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map(p => {
          const s = getStock(p.stock)
          if (!s) return null
          const size = p.length_cm ? `${p.length_cm} см` : p.pot_diameter ? `⌀${p.pot_diameter} см` : '—'
          return (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-center text-muted-foreground">{size}</TableCell>
              <TableCell className="text-center">
                <QtyBadge qty={s.qty} reserved={s.qty_reserved} />
              </TableCell>
              <TableCell className="text-right font-bold">{formatPrice(s.price)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default function PriceTable({ products }: { products: Product[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => p.name.toLowerCase().includes(q))
  }, [products, search])

  const cut = filtered.filter(p => p.category === 'cut')
  const pot = filtered.filter(p => p.category === 'pot')

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Шапка */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-900 font-serif">
          🌸 Цветы Уральска
        </h1>
        <p className="text-muted-foreground mt-1">
          Оптовый прайс-лист остатков · {new Date().toLocaleDateString('ru-RU')}
        </p>
      </div>

      {/* Поиск */}
      <div className="mb-6">
        <Input
          placeholder="🔍 Поиск по названию..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Вкладки */}
      <Tabs defaultValue="cut">
        <TabsList className="mb-4">
          <TabsTrigger value="cut">✂️ Срезные ({cut.length})</TabsTrigger>
          <TabsTrigger value="pot">🪴 Горшечные ({pot.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="cut">
          <div className="rounded-lg border bg-white shadow-sm">
            <ProductTable products={cut} />
          </div>
        </TabsContent>
        <TabsContent value="pot">
          <div className="rounded-lg border bg-white shadow-sm">
            <ProductTable products={pot} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
