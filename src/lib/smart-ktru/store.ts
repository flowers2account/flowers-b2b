'use client'

// Клиентское хранилище Smart KTRU (товары + товарные группы + «в работе» + кэш анализа).
// localStorage/Zustand, без БД — MVP-срез (Opportunity — вычисляемый слой, не хранится).
// Multi-KTRU: Product.ktru: ProductKtru[] (миграция из ktruCodes[] в persist migrate).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Product,
  ProductCharacteristic,
  ProductKtru,
  ProductKtruRole,
  ProductGroup,
  ProductGroupKtru,
  AnalysisResult,
} from './types.ts'
import {
  normalizeKtruList,
  addKtruEntry,
  removeKtruEntry,
  setPrimaryEntry,
  setKtruList,
  ktruListFromCodes,
} from './ktru-profile.ts'

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
  /** колонка канбана «В работе»: проверить → готовимся → участвуем */
  kanbanStage?: 'review' | 'prep' | 'bidding'
}

export const KANBAN_STAGES = ['review', 'prep', 'bidding'] as const
export type KanbanStage = (typeof KANBAN_STAGES)[number]
export const KANBAN_TITLES: Record<KanbanStage, string> = {
  review: 'Проверить',
  prep: 'Готовимся',
  bidding: 'Участвуем',
}

export interface CachedAnalysis {
  result: AnalysisResult
  at: string
}

/** Результат агрегации характеристик по КТРУ (форма зеркалит ktru-characteristics.ts). */
export interface CachedKtruChars {
  result: unknown
  at: string
}

/** {code, role?} — вход массовых операций назначения КТРУ. */
export interface KtruSelection {
  code: string
  role?: ProductKtruRole
  confidence?: number
}

interface SmartKtruState {
  products: Product[]
  groups: ProductGroup[]
  working: WorkingItem[]
  /** кэш реальных результатов анализа по lotId */
  analysisCache: Record<number, CachedAnalysis>
  /** кэш агрегации характеристик по КТРУ (ключ: `${analyzerVersion}:${code}`) */
  ktruCharCache: Record<string, CachedKtruChars>
  _seeded?: boolean

  // ── товары ──
  addProduct: (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateProduct: (id: string, patch: Partial<Product>) => void
  removeProduct: (id: string) => void
  getProduct: (id: string) => Product | undefined

  // ── КТРУ товара ──
  setProductKtru: (productId: string, entries: KtruSelection[]) => void
  addProductKtru: (productId: string, code: string, role?: ProductKtruRole) => void
  removeProductKtru: (productId: string, code: string) => void
  setPrimaryKtru: (productId: string, code: string) => void

  // ── товарные группы ──
  addGroup: (name: string, description?: string) => string
  updateGroup: (id: string, patch: Partial<Pick<ProductGroup, 'name' | 'description'>>) => void
  removeGroup: (id: string) => void
  getGroup: (id: string) => ProductGroup | undefined
  setGroupKtru: (groupId: string, entries: KtruSelection[]) => void
  addGroupKtru: (groupId: string, code: string, role?: ProductKtruRole) => void
  removeGroupKtru: (groupId: string, code: string) => void
  setGroupPrimaryKtru: (groupId: string, code: string) => void

  // ── массовые операции ──
  createGroupWithProducts: (name: string, productIds: string[], description?: string) => string
  assignProductsToGroup: (productIds: string[], groupId: string) => void
  removeProductFromGroup: (productId: string) => void

  // ── «в работе» ──
  toWork: (item: Omit<WorkingItem, 'addedAt' | 'status'>) => void
  fromWork: (lotId: number) => void
  setWorkStatus: (lotId: number, status: WorkingItem['status']) => void
  moveWorkStage: (lotId: number, dir: -1 | 1) => void
  isInWork: (lotId: number) => boolean

  // ── кэш ──
  cacheAnalysis: (lotId: number, result: AnalysisResult) => void
  getCachedAnalysis: (lotId: number) => CachedAnalysis | undefined
  cacheKtruChars: (key: string, result: unknown) => void
  getKtruChars: (key: string) => CachedKtruChars | undefined

  ensureDemoSeed: () => void
}

const uid = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
const gid = () => `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
const nowIso = () => new Date().toISOString()

type DemoProduct = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'ktru'>
const DEMO_PRODUCT: DemoProduct = {
  name: 'Горшок пластиковый',
  category: 'Горшки',
  costPerUnit: 125,
  saleUnit: 'шт',
  characteristics: [
    { name: 'Диаметр', value: '20', unit: 'см' },
    { name: 'Материал', value: 'пластик' },
    { name: 'Цвет', value: 'белый' },
  ],
}

const selToList = (entries: KtruSelection[], source: 'user' | 'suggested' | 'imported' | 'system' = 'user') =>
  setKtruList<ProductKtru>(entries, source)

/**
 * persist migrate v0/v1 → v2: `ktruCodes: string[]` → `ktru: ProductKtru[]`
 * (codes[0] → primary, остальные → alternative). Идемпотентно; ничего не теряется
 * (задача #22, DoD #4). Экспортирована для теста (tests/smart-ktru-migrate.test.mjs).
 */
export function migrateSmartKtru(persisted: unknown): unknown {
  const s = (persisted ?? {}) as Record<string, unknown>
  if (!Array.isArray(s.groups)) s.groups = []
  if (Array.isArray(s.products)) {
    s.products = (s.products as Record<string, unknown>[]).map((raw) => {
      const p = { ...(raw ?? {}) } as Record<string, unknown>
      if (Array.isArray(p.ktru)) {
        delete p.ktruCodes // уже v2-форма — только снимаем legacy-хвост
        return p
      }
      const codes = Array.isArray(p.ktruCodes)
        ? (p.ktruCodes as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        : []
      delete p.ktruCodes
      p.ktru = ktruListFromCodes(codes, 'imported')
      return p
    })
  }
  return s
}

export const useSmartKtru = create<SmartKtruState>()(
  persist(
    (set, get) => ({
      products: [],
      groups: [],
      working: [],
      analysisCache: {},
      ktruCharCache: {},

      // ── товары ──
      addProduct: (p) => {
        const id = uid()
        const now = nowIso()
        set((s) => ({
          products: [...s.products, { ...p, ktru: normalizeKtruList(p.ktru ?? []), id, createdAt: now, updatedAt: now }],
        }))
        return id
      },
      updateProduct: (id, patch) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...patch,
                  ktru: patch.ktru ? normalizeKtruList(patch.ktru) : p.ktru,
                  updatedAt: nowIso(),
                }
              : p,
          ),
        })),
      removeProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),
      getProduct: (id) => get().products.find((p) => p.id === id),

      // ── КТРУ товара ──
      setProductKtru: (productId, entries) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === productId ? { ...p, ktru: selToList(entries), updatedAt: nowIso() } : p,
          ),
        })),
      addProductKtru: (productId, code, role = 'alternative') =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === productId ? { ...p, ktru: addKtruEntry(p.ktru, code, role, 'user'), updatedAt: nowIso() } : p,
          ),
        })),
      removeProductKtru: (productId, code) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === productId ? { ...p, ktru: removeKtruEntry(p.ktru, code), updatedAt: nowIso() } : p,
          ),
        })),
      setPrimaryKtru: (productId, code) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === productId ? { ...p, ktru: setPrimaryEntry(p.ktru, code), updatedAt: nowIso() } : p,
          ),
        })),

      // ── товарные группы ──
      addGroup: (name, description) => {
        const id = gid()
        const now = nowIso()
        set((s) => ({
          groups: [...s.groups, { id, name: name.trim() || 'Группа', description: description?.trim() || undefined, ktru: [], createdAt: now, updatedAt: now }],
        }))
        return id
      },
      updateGroup: (id, patch) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === id ? { ...g, ...patch, name: (patch.name ?? g.name).trim() || g.name, updatedAt: nowIso() } : g,
          ),
        })),
      removeGroup: (id) =>
        set((s) => ({
          groups: s.groups.filter((g) => g.id !== id),
          products: s.products.map((p) => (p.groupId === id ? { ...p, groupId: undefined, updatedAt: nowIso() } : p)),
        })),
      getGroup: (id) => get().groups.find((g) => g.id === id),
      setGroupKtru: (groupId, entries) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, ktru: setKtruList<ProductGroupKtru>(entries, 'user'), updatedAt: nowIso() } : g,
          ),
        })),
      addGroupKtru: (groupId, code, role = 'alternative') =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, ktru: addKtruEntry(g.ktru, code, role, 'user'), updatedAt: nowIso() } : g,
          ),
        })),
      removeGroupKtru: (groupId, code) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, ktru: removeKtruEntry(g.ktru, code), updatedAt: nowIso() } : g,
          ),
        })),
      setGroupPrimaryKtru: (groupId, code) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, ktru: setPrimaryEntry(g.ktru, code), updatedAt: nowIso() } : g,
          ),
        })),

      // ── массовые операции ──
      createGroupWithProducts: (name, productIds, description) => {
        const id = get().addGroup(name, description)
        get().assignProductsToGroup(productIds, id)
        return id
      },
      assignProductsToGroup: (productIds, groupId) => {
        const ids = new Set(productIds)
        set((s) => ({
          products: s.products.map((p) => (ids.has(p.id) ? { ...p, groupId, updatedAt: nowIso() } : p)),
        }))
      },
      removeProductFromGroup: (productId) =>
        set((s) => ({
          products: s.products.map((p) => (p.id === productId ? { ...p, groupId: undefined, updatedAt: nowIso() } : p)),
        })),

      // ── «в работе» ──
      toWork: (item) =>
        set((s) => ({
          working: [
            ...s.working.filter((w) => w.lotId !== item.lotId),
            { ...item, addedAt: nowIso(), status: 'work' },
          ],
        })),
      fromWork: (lotId) => set((s) => ({ working: s.working.filter((w) => w.lotId !== lotId) })),
      setWorkStatus: (lotId, status) =>
        set((s) => ({ working: s.working.map((w) => (w.lotId === lotId ? { ...w, status } : w)) })),
      moveWorkStage: (lotId, dir) =>
        set((s) => ({
          working: s.working.map((w) => {
            if (w.lotId !== lotId) return w
            const cur = KANBAN_STAGES.indexOf((w.kanbanStage ?? 'review') as KanbanStage)
            const next = Math.max(0, Math.min(KANBAN_STAGES.length - 1, cur + dir))
            return { ...w, kanbanStage: KANBAN_STAGES[next] }
          }),
        })),
      isInWork: (lotId) => get().working.some((w) => w.lotId === lotId),

      // ── кэш ──
      cacheAnalysis: (lotId, result) =>
        set((s) => ({ analysisCache: { ...s.analysisCache, [lotId]: { result, at: nowIso() } } })),
      getCachedAnalysis: (lotId) => get().analysisCache[lotId],
      cacheKtruChars: (key, result) =>
        set((s) => ({ ktruCharCache: { ...s.ktruCharCache, [key]: { result, at: nowIso() } } })),
      getKtruChars: (key) => get().ktruCharCache[key],

      ensureDemoSeed: () => {
        const s = get()
        if (s._seeded || s.products.length > 0) {
          if (!s._seeded) set({ _seeded: true })
          return
        }
        const id = uid()
        const now = nowIso()
        set({
          products: [
            {
              ...DEMO_PRODUCT,
              ktru: ktruListFromCodes(['222929.900.000114'], 'system'),
              id,
              createdAt: now,
              updatedAt: now,
            },
          ],
          _seeded: true,
        })
      },
    }),
    {
      name: 'smart-ktru-v1', // ключ localStorage не меняем (иначе потеря данных); миграция — через version
      version: 2,
      migrate: (persisted) =>
        migrateSmartKtru(persisted) as Pick<
          SmartKtruState,
          'products' | 'groups' | 'working' | 'analysisCache' | 'ktruCharCache' | '_seeded'
        >,
      partialize: (s) => ({
        products: s.products,
        groups: s.groups,
        working: s.working,
        analysisCache: s.analysisCache,
        ktruCharCache: s.ktruCharCache,
        _seeded: s._seeded,
      }),
    },
  ),
)

export const emptyChar = (): ProductCharacteristic => ({ name: '', value: '', unit: '' })
