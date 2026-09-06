'use client'

// Клиентское хранилище Smart KTRU (товары + «в работе» + кэш анализа). localStorage,
// без БД — персистентность на уровне архитектуры не решаем, это MVP-срез.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product, ProductCharacteristic, AnalysisResult } from './types.ts'

export interface WorkingItem {
  lotId: number
  productId: string
  lotName: string | null
  customerName: string | null
  amount: number | null
  endDate: string | null
  verdict: string | null
  verdictLabel: string | null
  participationIndex: number | null
  marginRatio: number | null
  addedAt: string
  status: 'work' | 'submitted' | 'won' | 'lost' | 'declined'
}

export interface CachedAnalysis {
  result: AnalysisResult
  at: string
}

interface SmartKtruState {
  products: Product[]
  working: WorkingItem[]
  /** кэш реальных результатов анализа по lotId — чтобы feed/повторный вход не гоняли Gemini заново */
  analysisCache: Record<number, CachedAnalysis>
  _seeded?: boolean

  addProduct: (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateProduct: (id: string, patch: Partial<Product>) => void
  removeProduct: (id: string) => void
  getProduct: (id: string) => Product | undefined

  toWork: (item: Omit<WorkingItem, 'addedAt' | 'status'>) => void
  fromWork: (lotId: number) => void
  setWorkStatus: (lotId: number, status: WorkingItem['status']) => void
  isInWork: (lotId: number) => boolean

  cacheAnalysis: (lotId: number, result: AnalysisResult) => void
  getCachedAnalysis: (lotId: number) => CachedAnalysis | undefined

  /** одноразовый demo-товар (реальный КТРУ, реальный анализ) — чтобы демо открывалось сразу */
  ensureDemoSeed: () => void
}

const uid = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

const DEMO_PRODUCT: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Горшок пластиковый',
  category: 'Горшки',
  costPerUnit: 125,
  saleUnit: 'шт',
  ktruCodes: ['222929.900.000114'],
  characteristics: [
    { name: 'Диаметр', value: '20', unit: 'см' },
    { name: 'Материал', value: 'пластик' },
    { name: 'Цвет', value: 'белый' },
  ],
}

export const useSmartKtru = create<SmartKtruState>()(
  persist(
    (set, get) => ({
      products: [],
      working: [],
      analysisCache: {},

      addProduct: (p) => {
        const id = uid()
        const now = new Date().toISOString()
        set((s) => ({ products: [...s.products, { ...p, id, createdAt: now, updatedAt: now }] }))
        return id
      },
      updateProduct: (id, patch) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
          ),
        })),
      removeProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),
      getProduct: (id) => get().products.find((p) => p.id === id),

      toWork: (item) =>
        set((s) => ({
          working: [
            ...s.working.filter((w) => w.lotId !== item.lotId),
            { ...item, addedAt: new Date().toISOString(), status: 'work' },
          ],
        })),
      fromWork: (lotId) => set((s) => ({ working: s.working.filter((w) => w.lotId !== lotId) })),
      setWorkStatus: (lotId, status) =>
        set((s) => ({ working: s.working.map((w) => (w.lotId === lotId ? { ...w, status } : w)) })),
      isInWork: (lotId) => get().working.some((w) => w.lotId === lotId),

      cacheAnalysis: (lotId, result) =>
        set((s) => ({ analysisCache: { ...s.analysisCache, [lotId]: { result, at: new Date().toISOString() } } })),
      getCachedAnalysis: (lotId) => get().analysisCache[lotId],

      ensureDemoSeed: () => {
        const s = get()
        if (s._seeded || s.products.length > 0) {
          if (!s._seeded) set({ _seeded: true })
          return
        }
        const id = uid()
        const now = new Date().toISOString()
        set({ products: [{ ...DEMO_PRODUCT, id, createdAt: now, updatedAt: now }], _seeded: true })
      },
    }),
    {
      name: 'smart-ktru-v1',
      // кэш анализа может быть большим — храним, но при желании легко очистить в DevTools
      partialize: (s) => ({
        products: s.products,
        working: s.working,
        analysisCache: s.analysisCache,
        _seeded: s._seeded,
      }),
    },
  ),
)

export const emptyChar = (): ProductCharacteristic => ({ name: '', value: '', unit: '' })
