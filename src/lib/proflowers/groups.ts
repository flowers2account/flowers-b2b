import { createAdminClient } from '@/lib/supabase/admin'
import { createProflowersClientFromEnv } from './client'
import type { PfCatalogGroupNode } from './types'

// syncCatalogGroups(): дешёвый запрос (ipp=1) на КАЖДЫЙ активный торговый день → дерево
// catalogGroups этой номенклатуры → плоские строки с parent_pf_group_id из вложенности
// __children → upsert pf_catalog_groups. Дёшево (1 запрос на номенклатуру, не на лист) —
// отдельно от дорогого обхода pf_product_groups (58 запросов на лист, см. syncProductGroups
// в этом же модуле, шаг 2). Одно дерево на номенклатуру: если два активных дня одной
// номенклатуры (маловероятно, но не исключено), второй запрос просто пропускаем — дерево то же.

type AdminClient = ReturnType<typeof createAdminClient>

interface CatalogGroupRow {
  pf_group_id: number
  parent_pf_group_id: number | null
  name: string
  nomenclature_id: number | null
  has_children: boolean
  synced_at: string
}

function flattenTree(
  nodes: PfCatalogGroupNode[],
  parentId: number | null,
  nomenclatureId: number | null,
  now: string,
  acc: CatalogGroupRow[] = [],
): CatalogGroupRow[] {
  for (const node of nodes) {
    const children = node.__children ?? []
    const hasChildren = children.length > 0
    acc.push({
      pf_group_id: node.id,
      parent_pf_group_id: parentId,
      name: node.name,
      nomenclature_id: node.nomenclature_id ?? nomenclatureId,
      has_children: hasChildren,
      synced_at: now,
    })
    if (hasChildren) flattenTree(children, node.id, node.nomenclature_id ?? nomenclatureId, now, acc)
  }
  return acc
}

function maxDepth(nodes: PfCatalogGroupNode[], depth = 1): number {
  let max = depth
  for (const node of nodes) {
    if (node.__children?.length) max = Math.max(max, maxDepth(node.__children, depth + 1))
  }
  return max
}

async function upsertGroups(admin: AdminClient, rows: CatalogGroupRow[]): Promise<void> {
  if (rows.length === 0) return
  // flattenTree — pre-order обход (узел кладётся ПЕРЕД его __children), поэтому rows уже в
  // топологическом порядке: родитель всегда раньше потомка. FK parent_pf_group_id → pf_group_id
  // (immediate, не deferred) проверяется Postgres по мере обработки строк одного INSERT —
  // более ранние строки того же вызова уже видны последующим, один batch-upsert безопасен
  // на любой глубине дерева.
  const { error } = await admin.from('pf_catalog_groups').upsert(rows, { onConflict: 'pf_group_id' })
  if (error) throw new Error(`upsert pf_catalog_groups: ${error.message}`)
}

export interface SyncCatalogGroupsResult {
  nomenclatures: { nomenclatureId: number | null; tradingDayId: number; nodesUpserted: number; maxDepth: number }[]
  totalUpserted: number
}

export async function syncCatalogGroups(log: (message: string) => void = () => {}): Promise<SyncCatalogGroupsResult> {
  const admin = createAdminClient()
  const client = createProflowersClientFromEnv(log)
  const activeDays = await client.getActiveTradingDays()

  const seenNomenclature = new Set<number>()
  const results: SyncCatalogGroupsResult['nomenclatures'] = []
  let totalUpserted = 0

  for (const day of activeDays) {
    const nomenclatureId = day.nomenclatureId ?? null
    if (nomenclatureId != null && seenNomenclature.has(nomenclatureId)) {
      log(`номенклатура ${nomenclatureId} уже собрана (день ${day.id}) — пропуск, дерево общее`)
      continue
    }
    if (nomenclatureId != null) seenNomenclature.add(nomenclatureId)

    const page = await client.getCatalogPage(1, { ipp: 1, tradingDayIds: [day.id] })
    const tree = page.catalogGroups ?? []
    const now = new Date().toISOString()
    const rows = flattenTree(tree, null, nomenclatureId, now)
    await upsertGroups(admin, rows)

    const depth = maxDepth(tree)
    totalUpserted += rows.length
    results.push({ nomenclatureId, tradingDayId: day.id, nodesUpserted: rows.length, maxDepth: depth })
    log(`день ${day.id} (номенклатура ${nomenclatureId}): узлов=${rows.length}, макс. глубина=${depth}`)
  }

  return { nomenclatures: results, totalUpserted }
}
