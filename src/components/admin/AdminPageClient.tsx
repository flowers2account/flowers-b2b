'use client'

import { useState } from 'react'
import AdminTable from './AdminTable'
import ImportXLS from './ImportXLS'

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean } | null
type Product = { id: number; name: string; category: string; is_active: boolean; pack_size: number; stock: Stock[] | Stock }

export default function AdminPageClient({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState(initialProducts)

  async function reload() {
    const res = await fetch('/api/products')
    const data = await res.json()
    if (data) setProducts(data)
  }

  return (
    <>
      <ImportXLS onImported={reload} />
      <AdminTable products={products} />
    </>
  )
}
