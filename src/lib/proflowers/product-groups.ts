import { createAdminClient } from '@/lib/supabase/admin'
import { createProflowersClientFromEnv } from './client'

// syncProductGroups(): дорогой обход — один GET на КАЖДЫЙ листовой pf_catalog_groups (has_children
// =false) активной номенклатуры (+ доп. страницы, если в листе > 60 товаров), т.к. group_ids[]
// не даёт метки группы на самом товаре — привязку узнаём только по факту «этот товар пришёл в
// ответе на group_ids[]=<лист>» (подтверждено разведкой 24.09.2026: 58 листьев декора = ровно
// 2278 товаров дня, пересечений между листьями не найдено). НЕ вызывать из основного 3-часового
// крона (pf-sync) — отдельный редкий крон (см. /api/cron/pf-sync-product-groups).
//
// Требует, чтобы pf_catalog_groups уже был наполнен (см. groups.ts → syncCatalogGroups) —
// листья берём из БД, не пересобираем дерево здесь.
//
// Атомарность НА УРОВЕНЬ ЛИСТА, не на весь обход: каждый лист — либо полностью успешен
// (все страницы собраны без ошибок → upsert новых связей + удаление устаревших ТОЛЬКО этого
// листа), либо при любой ошибке внутри листа — вообще ничего не пишем и не удаляем для него,
// старые связи остаются как были (retry на следующем прогоне). Один упавший лист не портит
// результат остальных 72.

type AdminClient = ReturnType<typeof createAdminClient>

interface LeafRow {
  pf_group_id: number
  name: string
}

interface ProductGroupRow {
  product_id: number
  pf_group_id: number
  synced_at: string
}

export interface SyncProductGroupsResult {
  leavesProcessed: number
  leavesFailed: number
  linksUpserted: number
  linksDeleted: number
  failedLeaves: { pf_group_id: number; name: string; error: string }[]
}

async function fetchLeaves(admin: AdminClient, nomenclatureId: number | null): Promise<LeafRow[]> {
  let query = admin.from('pf_catalog_groups').select('pf_group_id, name').eq('has_children', false)
  query = nomenclatureId == null ? query.is('nomenclature_id', null) : query.eq('nomenclature_id', nomenclatureId)
  const { data, error } = await query
  if (error) throw new Error(`select pf_catalog_groups (leaves, nomenclature=${nomenclatureId}): ${error.message}`)
  return (data ?? []) as LeafRow[]
}

export async function syncProductGroups(log: (message: string) => void = () => {}): Promise<SyncProductGroupsResult> {
  const admin = createAdminClient()
  const client = createProflowersClientFromEnv(log)
  const activeDays = await client.getActiveTradingDays()

  let leavesProcessed = 0
  let leavesFailed = 0
  let linksUpserted = 0
  let linksDeleted = 0
  const failedLeaves: SyncProductGroupsResult['failedLeaves'] = []
  const seenNomenclature = new Set<number | null>()

  for (const day of activeDays) {
    const nomenclatureId = day.nomenclatureId ?? null
    if (seenNomenclature.has(nomenclatureId)) continue // один обход листьев на номенклатуру, не на день
    seenNomenclature.add(nomenclatureId)

    const leaves = await fetchLeaves(admin, nomenclatureId)
    if (leaves.length === 0) {
      log(`номенклатура ${nomenclatureId} (день ${day.id}): нет листьев в pf_catalog_groups — сперва прогнать syncCatalogGroups`)
      continue
    }
    log(`номенклатура ${nomenclatureId} (день ${day.id}): листьев к обходу ${leaves.length}`)

    for (const leaf of leaves) {
      const runStartedAt = new Date().toISOString()
      try {
        let page = 1
        let collected = 0
        let total = 0
        const rows: ProductGroupRow[] = []
        while (true) {
          const catalogPage = await client.getCatalogPage(page, {
            ipp: 60,
            tradingDayIds: [day.id],
            groupIds: [leaf.pf_group_id],
          })
          total = catalogPage.pages.total
          const list = catalogPage.list
          for (const item of list) rows.push({ product_id: item.product_id, pf_group_id: leaf.pf_group_id, synced_at: runStartedAt })
          collected += list.length
          // Останавливаемся по факту собранного (см. docs/PROFLOWERS_SYNC.md — сервер молча
          // капает ipp, доверять надо только реальному собранному count vs pages.total).
          if (list.length === 0 || collected >= total) break
          page += 1
        }

        // Дедуп на случай дрожания сортировки между страницами одного большого листа (видели на
        // разведке: 2278 collected vs 2277 unique product_id) — Postgres иначе упадёт на
        // "ON CONFLICT DO UPDATE command cannot affect row a second time" при дубле в одном batch.
        const dedup = new Map<string, ProductGroupRow>()
        for (const r of rows) dedup.set(`${r.product_id}:${r.pf_group_id}`, r)
        const uniqueRows = [...dedup.values()]

        if (uniqueRows.length > 0) {
          const { error: upErr } = await admin
            .from('pf_product_groups')
            .upsert(uniqueRows, { onConflict: 'product_id,pf_group_id' })
          if (upErr) throw new Error(`upsert: ${upErr.message}`)
        }

        // Чистим устаревшие связи ТОЛЬКО этого листа и ТОЛЬКО потому, что дошли досюда без
        // ошибок (весь лист реально дообойдён) — см. комментарий класса выше.
        const { data: deleted, error: delErr } = await admin
          .from('pf_product_groups')
          .delete()
          .eq('pf_group_id', leaf.pf_group_id)
          .lt('synced_at', runStartedAt)
          .select('product_id')
        if (delErr) throw new Error(`delete stale: ${delErr.message}`)

        linksUpserted += uniqueRows.length
        linksDeleted += deleted?.length ?? 0
        leavesProcessed += 1
        log(`лист ${leaf.pf_group_id} "${leaf.name}": total=${total}, upserted=${uniqueRows.length}, удалено устаревших=${deleted?.length ?? 0}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        leavesFailed += 1
        failedLeaves.push({ pf_group_id: leaf.pf_group_id, name: leaf.name, error: message })
        log(`лист ${leaf.pf_group_id} "${leaf.name}": ОШИБКА ${message} — связи по этому листу НЕ тронуты (ни запись, ни удаление)`)
      }
    }
  }

  return { leavesProcessed, leavesFailed, linksUpserted, linksDeleted, failedLeaves }
}
