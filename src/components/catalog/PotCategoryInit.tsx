'use client'
import { useEffect } from 'react'
import { useFilters } from '@/lib/filter-store'

export default function PotCategoryInit() {
  const setCategory = useFilters(s => s.setCategory)
  useEffect(() => { setCategory('pot') }, [])
  return null
}
