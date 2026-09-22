import { createAdminClient } from '@/lib/supabase/admin'
import { ProflowersError, createProflowersClientFromEnv } from './client'
import type { PfListItem, PfNumeric } from './types'

// syncTradingDay(): полный прогон каталога Proflowers → pf_trading_days / pf_products / pf_offers.
//
// Обход ОДИН на весь прогон (не «страница на активный день»): /catalog/products не принимает
// параметр дня, а объект дня вложен в каждый товар (list[].trading_day) — один проход по
// страницам 1..ceil(total/ipp) покрывает все активные дни сразу (подтверждено владельцем).
//
// Порядок записи в рамках каждой страницы СТРОГО: сначала уникальные торговые дни этой
// страницы, потом уникальные товары, и только потом офферы — у pf_offers FK на оба.
//
// Идемпотентность: upsert по pf_id / pf_product_id / pf_offer_id. Повторный прогон того же дня
// не плодит дубли — обновляет last_seen_at и цену/остаток (first_seen_at не трогаем: он не
// входит в payload апдейта, так что при INSERT срабатывает DEFAULT now(), при UPDATE колонка
// не переписывается).
//
// is_available=false проставляется только офферам ТЕХ торговых дней, что реально участвовали
// в этом прогоне (processedDayIds) — прошлый/чужой день это не гасит.

type AdminClient = ReturnType<typeof createAdminClient>

export interface SyncTradingDayResult {
  status: 'success' | 'no_active_days'
  tradingDayIds: number[]
  tradingDayTypes: string[]
  pagesFetched: number
  productsUpserted: number
  offersUpserted: number
  markedUnavailable: number
  skippedInvalidOffers: number
}

const DEFAULT_IPP = 60

function toNumeric(value: PfNumeric | undefined | null): number | null {
  if (value === undefined || value === null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toInt(value: number | undefined | null): number | null {
  if (value === undefined || value === null) return null
  const n = Math.trunc(value)
  return Number.isFinite(n) ? n : null
}

interface TradingDayRow {
  pf_id: number
  type: string
  date: string | null
  name: string | null
  nomenclature_name: string | null
  is_active: boolean
  synced_at: string
}

interface ProductRow {
  pf_product_id: number
  name: string
  characteristics: string | null
  color_name: string | null
  country: string | null
  trademark: string | null
  height: number | null
  length: number | null
  diameter: number | null
  barcode: string | null
  image_url: string | null
  photos: string[] | null
  updated_at: string
}

interface OfferRow {
  pf_offer_id: number
  product_id: number
  trading_day_id: number
  purchase_price: number
  box_purchase_price: number | null
  count_left: number | null
  multiplicity: number | null
  box_multiplicity: number | null
  is_sold_in_box: boolean | null
  is_box_only: boolean | null
  is_promotion: boolean | null
  is_available: boolean
  last_seen_at: string
}

function tradingDayRowFromItem(item: PfListItem, now: string): TradingDayRow {
  const day = item.trading_day
  return {
    pf_id: day.id,
    type: day.type,
    date: day.normalized_date ?? day.date ?? null,
    name: day.name ?? null,
    nomenclature_name: day.nomenclature_name ?? null,
    is_active: true,
    synced_at: now,
  }
}

function productRowFromItem(item: PfListItem, now: string): ProductRow {
  return {
    pf_product_id: item.product_id,
    name: item.name,
    characteristics: item.characteristics ?? null,
    color_name: item.color_name ?? null,
    country: item.country?.name ?? null,
    trademark: item.trademark ?? null,
    height: toNumeric(item.height),
    length: toNumeric(item.length),
    diameter: toNumeric(item.diameter),
    barcode: item.barcode ?? null,
    image_url: item.image_show ?? null,
    photos: Array.isArray(item.photos) ? item.photos : null,
    updated_at: now,
  }
}

// null, если у товара нет пригодной закупочной цены (purchase_price NOT NULL в БД) — такой
// оффер пропускаем, а не роняем весь прогон.
function offerRowFromItem(item: PfListItem, now: string): OfferRow | null {
  const purchasePrice = toNumeric(item.price_with_discount)
  if (purchasePrice === null) return null

  return {
    pf_offer_id: item.id,
    product_id: item.product_id,
    trading_day_id: item.trading_day.id,
    purchase_price: purchasePrice,
    box_purchase_price: toNumeric(item.box_price_with_discount),
    count_left: toInt(item.count_left),
    multiplicity: toInt(item.multiplicity),
    box_multiplicity: toInt(item.box_multiplicity),
    is_sold_in_box: item.is_sold_in_box ?? null,
    is_box_only: item.is_box_only ?? null,
    is_promotion: item.is_promotion ?? null,
    is_available: true,
    last_seen_at: now,
  }
}

async function upsertTradingDays(admin: AdminClient, rows: TradingDayRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('pf_trading_days').upsert(rows, { onConflict: 'pf_id' })
  if (error) throw new Error(`upsert pf_trading_days: ${error.message}`)
}

async function upsertProducts(admin: AdminClient, rows: ProductRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('pf_products').upsert(rows, { onConflict: 'pf_product_id' })
  if (error) throw new Error(`upsert pf_products: ${error.message}`)
}

async function upsertOffers(admin: AdminClient, rows: OfferRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('pf_offers').upsert(rows, { onConflict: 'pf_offer_id' })
  if (error) throw new Error(`upsert pf_offers: ${error.message}`)
}

// Гасит офферы, которые пропали из выдачи: is_available=true, last_seen_at до начала этого
// прогона, и только в пределах дня, реально обработанного сейчас.
async function markStaleOffersUnavailable(
  admin: AdminClient,
  tradingDayId: number,
  runStartedAt: string,
): Promise<number> {
  const { data, error } = await admin
    .from('pf_offers')
    .update({ is_available: false })
    .eq('trading_day_id', tradingDayId)
    .eq('is_available', true)
    .lt('last_seen_at', runStartedAt)
    .select('id')
  if (error) throw new Error(`mark unavailable (trading_day_id=${tradingDayId}): ${error.message}`)
  return data?.length ?? 0
}

interface RunLogRow {
  started_at: string
  trading_day_id: number | null
  trading_day_type: string | null
  pages_fetched: number
  offers_upserted: number
  products_upserted: number
  marked_unavailable: number
  status: 'success' | 'error'
  error: string | null
  finished_at: string
}

async function recordRun(admin: AdminClient, row: RunLogRow): Promise<void> {
  const { error } = await admin.from('pf_sync_runs').insert(row)
  if (error) throw new Error(`insert pf_sync_runs: ${error.message}`)
}

export async function syncTradingDay(
  log: (message: string) => void = () => {},
): Promise<SyncTradingDayResult> {
  const admin = createAdminClient()
  const client = createProflowersClientFromEnv(log)
  const startedAt = new Date().toISOString()

  const activeDays = await client.getActiveTradingDays()
  if (activeDays.length === 0) {
    log('нет активных торговых дней — прогон пропущен')
    await recordRun(admin, {
      started_at: startedAt,
      trading_day_id: null,
      trading_day_type: null,
      pages_fetched: 0,
      offers_upserted: 0,
      products_upserted: 0,
      marked_unavailable: 0,
      status: 'success',
      error: null,
      finished_at: new Date().toISOString(),
    })
    return {
      status: 'no_active_days',
      tradingDayIds: [],
      tradingDayTypes: [],
      pagesFetched: 0,
      productsUpserted: 0,
      offersUpserted: 0,
      markedUnavailable: 0,
      skippedInvalidOffers: 0,
    }
  }
  log(`активных дней: ${activeDays.length} (${activeDays.map((d) => `${d.id}:${d.type}`).join(', ')})`)

  // Стаб-строки по данным /trading-days/ — гарантируют, что день есть в БД, даже если в
  // каталоге на него пока 0 товаров (например, только что открывшийся preorder).
  await upsertTradingDays(
    admin,
    activeDays.map((day) => ({
      pf_id: day.id,
      type: day.type,
      date: day.dateTimeNormalized ?? null,
      name: day.name ?? null,
      nomenclature_name: null,
      is_active: true,
      synced_at: startedAt,
    })),
  )

  const processedDayIds = new Set<number>(activeDays.map((d) => d.id))
  const processedDayTypeById = new Map<number, string>(activeDays.map((d) => [d.id, d.type]))
  const productPfIdsSeen = new Set<number>()

  let pagesFetched = 0
  let offersUpserted = 0
  let skippedInvalidOffers = 0
  let page = 1
  let totalPages = 1

  try {
    do {
      const catalogPage = await client.getCatalogPage(page, { ipp: DEFAULT_IPP })
      totalPages = Math.max(1, Math.ceil(catalogPage.pages.total / catalogPage.pages.ipp))
      pagesFetched += 1

      const now = new Date().toISOString()
      const items = catalogPage.list

      // 1) уникальные торговые дни этой страницы (уточняют стаб данными из товара: nomenclature_name и т.п.)
      const dayRowsByPfId = new Map<number, TradingDayRow>()
      for (const item of items) dayRowsByPfId.set(item.trading_day.id, tradingDayRowFromItem(item, now))
      await upsertTradingDays(admin, [...dayRowsByPfId.values()])
      for (const dayId of dayRowsByPfId.keys()) {
        processedDayIds.add(dayId)
        const type = dayRowsByPfId.get(dayId)?.type
        if (type) processedDayTypeById.set(dayId, type)
      }

      // 2) уникальные товары этой страницы
      const productRowsByPfId = new Map<number, ProductRow>()
      for (const item of items) productRowsByPfId.set(item.product_id, productRowFromItem(item, now))
      await upsertProducts(admin, [...productRowsByPfId.values()])
      for (const id of productRowsByPfId.keys()) productPfIdsSeen.add(id)

      // 3) только теперь офферы — оба FK (product_id, trading_day_id) уже на месте
      const offerRows: OfferRow[] = []
      for (const item of items) {
        const row = offerRowFromItem(item, now)
        if (row) offerRows.push(row)
        else {
          skippedInvalidOffers += 1
          // Сырые ценовые поля — чтобы по логу сразу было видно, какое поле не смапилось,
          // не перезаходя на сайт.
          log(
            `пропущен оффер без валидной закупочной цены: offer id=${item.id}, product_id=${item.product_id}, ` +
              `raw=${JSON.stringify({
                price: item.price,
                box_price: item.box_price,
                price_with_discount: item.price_with_discount,
                box_price_with_discount: item.box_price_with_discount,
              })}`,
          )
        }
      }
      await upsertOffers(admin, offerRows)
      offersUpserted += offerRows.length

      log(`страница ${page}/${totalPages}: дней=${dayRowsByPfId.size}, товаров=${productRowsByPfId.size}, офферов=${offerRows.length}`)
      page += 1
    } while (page <= totalPages)
  } catch (error) {
    const message = error instanceof ProflowersError ? `${error.kind}: ${error.message}` : String(error)
    await recordRun(admin, {
      started_at: startedAt,
      trading_day_id: processedDayIds.size === 1 ? [...processedDayIds][0] : null,
      trading_day_type: processedDayIds.size === 1 ? processedDayTypeById.get([...processedDayIds][0]) ?? null : null,
      pages_fetched: pagesFetched,
      offers_upserted: offersUpserted,
      products_upserted: productPfIdsSeen.size,
      marked_unavailable: 0,
      status: 'error',
      error: message,
      finished_at: new Date().toISOString(),
    })
    throw error
  }

  // Гасим то, что пропало из выдачи — но только для дней, реально обработанных в этом прогоне.
  let markedUnavailable = 0
  for (const dayId of processedDayIds) {
    markedUnavailable += await markStaleOffersUnavailable(admin, dayId, startedAt)
  }

  const tradingDayIds = [...processedDayIds]
  await recordRun(admin, {
    started_at: startedAt,
    trading_day_id: tradingDayIds.length === 1 ? tradingDayIds[0] : null,
    trading_day_type: tradingDayIds.length === 1 ? processedDayTypeById.get(tradingDayIds[0]) ?? null : null,
    pages_fetched: pagesFetched,
    offers_upserted: offersUpserted,
    products_upserted: productPfIdsSeen.size,
    marked_unavailable: markedUnavailable,
    status: 'success',
    error: null,
    finished_at: new Date().toISOString(),
  })

  log(
    `готово: страниц=${pagesFetched}, товаров=${productPfIdsSeen.size}, офферов=${offersUpserted}, ` +
      `погашено=${markedUnavailable}, пропущено=${skippedInvalidOffers}`,
  )

  return {
    status: 'success',
    tradingDayIds,
    tradingDayTypes: tradingDayIds.map((id) => processedDayTypeById.get(id) ?? ''),
    pagesFetched,
    productsUpserted: productPfIdsSeen.size,
    offersUpserted,
    markedUnavailable,
    skippedInvalidOffers,
  }
}

