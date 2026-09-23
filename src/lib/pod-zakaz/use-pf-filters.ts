'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PfCatalogItem } from './types'
import { sortCategoryNames } from './category-priority'
import { stepPrice } from './format'

// Изолированное состояние фильтров/сортировки витрины «Под заказ» — обычный React-хук, не
// глобальный стор (ни Zustand, ни persist). Не пересекается с useFilters/filter-store
// основного каталога. Фильтрация — на клиенте поверх уже загруженного массива (как в
// ProductGrid.tsx с fetchAllProducts), не параметрами API: данные и так целиком на клиенте,
// лишний round-trip на каждый клик фильтра не нужен.

export type PfSortKey = 'default' | 'price_asc' | 'price_desc' | 'stock'

export interface PfFacetOption {
  value: string
  count: number
}

const SEARCH_DEBOUNCE_MS = 300

function buildFacet(products: PfCatalogItem[], pick: (p: PfCatalogItem) => string | null): PfFacetOption[] {
  const counts = new Map<string, number>()
  for (const p of products) {
    const v = pick(p)
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ru'))
}

export function usePfFilters(products: PfCatalogItem[]) {
  const [category, setCategory] = useState('') // '' = «Все»
  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('') // debounced, используется в фильтрации
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [sort, setSort] = useState<PfSortKey>('default')

  useEffect(() => {
    const id = setTimeout(() => setSearch(rawSearch), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [rawSearch])

  // Фасеты — ВСЕГДА от полного массива, не сужаются другими активными фильтрами (согласовано:
  // проще для пользователя, опции не «прыгают» при выборе категории/цвета).
  const categories = useMemo(() => {
    const names = new Set<string>()
    for (const p of products) if (p.nomenclature_name) names.add(p.nomenclature_name)
    const counts = new Map<string, number>()
    for (const p of products) {
      if (!p.nomenclature_name) continue
      counts.set(p.nomenclature_name, (counts.get(p.nomenclature_name) ?? 0) + 1)
    }
    return sortCategoryNames([...names]).map((name) => ({ value: name, count: counts.get(name) ?? 0 }))
  }, [products])

  const colorOptions = useMemo(() => buildFacet(products, (p) => p.color_name), [products])
  const countryOptions = useMemo(() => buildFacet(products, (p) => p.country), [products])

  function toggleColor(value: string) {
    setSelectedColors((cur) => (cur.includes(value) ? cur.filter((c) => c !== value) : [...cur, value]))
  }
  function toggleCountry(value: string) {
    setSelectedCountries((cur) => (cur.includes(value) ? cur.filter((c) => c !== value) : [...cur, value]))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = products.filter((p) => {
      if (category && p.nomenclature_name !== category) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (selectedColors.length > 0 && !(p.color_name && selectedColors.includes(p.color_name))) return false
      if (selectedCountries.length > 0 && !(p.country && selectedCountries.includes(p.country))) return false
      return true
    })
    if (sort === 'price_asc') list = [...list].sort((a, b) => stepPrice(a) - stepPrice(b))
    else if (sort === 'price_desc') list = [...list].sort((a, b) => stepPrice(b) - stepPrice(a))
    else if (sort === 'stock') list = [...list].sort((a, b) => b.count_left - a.count_left)
    return list
  }, [products, category, search, selectedColors, selectedCountries, sort])

  const activeFilterCount =
    (category ? 1 : 0) + (search ? 1 : 0) + selectedColors.length + selectedCountries.length
  const hasActiveFilters = activeFilterCount > 0

  function resetAll() {
    setCategory('')
    setRawSearch('')
    setSearch('')
    setSelectedColors([])
    setSelectedCountries([])
  }

  return {
    category, setCategory, categories,
    rawSearch, setRawSearch,
    selectedColors, toggleColor, colorOptions,
    selectedCountries, toggleCountry, countryOptions,
    sort, setSort,
    filtered,
    activeFilterCount, hasActiveFilters, resetAll,
  }
}
