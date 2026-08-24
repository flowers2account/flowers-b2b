import type { SupabaseClient } from '@supabase/supabase-js'
import { computeDeliveryCost, getCityDeliveryFee } from '@/lib/delivery'

const CART_NOTE = '[customer_cart]'

export type ServerCartItem = {
  id: number
  name: string
  price: number
  qty: number
  available: number
  category: string
  image_url?: string | null
  unit?: string | null
  subcategory?: string | null
  color?: string | null
}

const PRODUCT_SELECT = 'id, name, display_name, price, qty, site_qty, category, subcategory, image_url, campaign_image_url, unit, is_active, source'

function cleanItem(raw: any): ServerCartItem | null {
  const id = Number(raw?.id ?? raw?.product_id)
  const qty = Math.floor(Number(raw?.qty))
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(qty) || qty <= 0) return null
  return {
    id,
    name: String(raw?.name || ''),
    price: Number(raw?.price) || 0,
    qty,
    available: Math.max(0, Number(raw?.available) || 0),
    category: String(raw?.category || 'accessories'),
    image_url: raw?.image_url ?? null,
    unit: raw?.unit ?? null,
    subcategory: raw?.subcategory ?? null,
    color: raw?.color ?? null,
  }
}

function lineKey(item: Pick<ServerCartItem, 'id' | 'color'>) {
  return `${item.id}:${item.color ?? ''}`
}

export function normalizeCartItems(rawItems: unknown): ServerCartItem[] {
  if (!Array.isArray(rawItems)) return []
  const merged = new Map<string, ServerCartItem>()
  for (const raw of rawItems) {
    const item = cleanItem(raw)
    if (!item) continue
    const key = lineKey(item)
    const prev = merged.get(key)
    merged.set(key, prev ? { ...prev, qty: prev.qty + item.qty } : item)
  }
  return [...merged.values()].slice(0, 200)
}

async function getCartOrderId(sb: SupabaseClient, clientId: string): Promise<number | null> {
  const { data, error } = await sb
    .from('orders')
    .select('id, created_at')
    .eq('client_id', clientId)
    .eq('status', 'cart')
    .eq('notes', CART_NOTE)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  const rows = data ?? []
  const keep = Number(rows[0]?.id) || null
  const extras = rows.slice(1).map((r: any) => Number(r.id)).filter(Boolean)
  if (extras.length > 0) await sb.from('orders').delete().in('id', extras)
  return keep
}

async function ensureCartOrder(sb: SupabaseClient, clientId: string): Promise<number> {
  const existing = await getCartOrderId(sb, clientId)
  if (existing) return existing

  const { data, error } = await sb
    .from('orders')
    .insert({
      client_id: clientId,
      status: 'cart',
      total: 0,
      notes: CART_NOTE,
    })
    .select('id')
    .single()
  if (error) throw error
  return Number(data.id)
}

async function productMap(sb: SupabaseClient, productIds: number[]) {
  if (productIds.length === 0) return new Map<number, any>()
  const { data, error } = await sb
    .from('products')
    .select(PRODUCT_SELECT)
    .in('id', productIds)
  if (error) throw error
  return new Map((data ?? []).map((p: any) => [Number(p.id), p]))
}

function hydrate(saved: any, product: any | undefined): ServerCartItem {
  const price = Number(product?.price ?? saved.price) || 0
  const qty = Math.max(1, Number(saved.qty) || 1)
  const available = Math.max(0, Number(product?.qty ?? 0) || 0, Number(product?.site_qty ?? 0) || 0)
  const name = String(product?.display_name || product?.name || saved.name || '')
  return {
    id: Number(saved.product_id),
    name,
    price,
    qty: available > 0 ? Math.min(qty, available) : qty,
    available,
    category: String(product?.category || saved.category || 'accessories'),
    image_url: product?.campaign_image_url || product?.image_url || saved.image_url || null,
    unit: product?.unit ?? saved.unit ?? null,
    subcategory: product?.subcategory ?? saved.subcategory ?? null,
    color: saved.color ?? null,
  }
}

export async function getClientCart(sb: SupabaseClient, clientId: string) {
  const orderId = await getCartOrderId(sb, clientId)
  if (!orderId) return { items: [] as ServerCartItem[], updated_at: null as string | null }

  const { data: rows, error } = await sb
    .from('order_items')
    .select('product_id, color, qty, price')
    .eq('order_id', orderId)
    .order('id', { ascending: true })
  if (error) throw error

  const ids = [...new Set((rows ?? []).map((r: any) => Number(r.product_id)).filter(Boolean))]
  const products = await productMap(sb, ids)
  return {
    items: (rows ?? []).map((r: any) => hydrate(r, products.get(Number(r.product_id)))),
    updated_at: null as string | null,
  }
}

export async function replaceClientCart(sb: SupabaseClient, clientId: string, rawItems: unknown) {
  const orderId = await ensureCartOrder(sb, clientId)
  const items = normalizeCartItems(rawItems)
  const products = await productMap(sb, items.map((i) => i.id))
  const rows = items.map((item) => {
    const product = products.get(item.id)
    const available = Math.max(0, Number(product?.qty ?? 0) || 0, Number(product?.site_qty ?? 0) || 0, Number(item.available) || 0)
    return {
      order_id: orderId,
      product_id: item.id,
      color: item.color ?? null,
      qty: available > 0 ? Math.min(item.qty, available) : item.qty,
      price: Number(product?.price ?? item.price) || 0,
      name: String(product?.display_name || product?.name || item.name || ''),
      image_url: product?.campaign_image_url || product?.image_url || item.image_url || null,
      unit: product?.unit ?? item.unit ?? null,
      category: product?.category ?? item.category ?? 'accessories',
      subcategory: product?.subcategory ?? item.subcategory ?? null,
    }
  }).filter((row) => row.qty > 0)

  const { error: delError } = await sb.from('order_items').delete().eq('order_id', orderId)
  if (delError) throw delError

  if (rows.length > 0) {
    const { error: insError } = await sb.from('order_items').insert(rows.map((r) => ({
      order_id: r.order_id,
      product_id: r.product_id,
      color: r.color,
      qty: r.qty,
      price: r.price,
    })))
    if (insError) throw insError
  }

  // Доставка (delivery_cost) не пересоздаётся тут — orders.fulfillment_type/delivery_city
  // уже сохранены на заказе (напр. проставлены вручную из консоли). Но если их НЕ
  // пересчитать при каждой синхронизации корзины, любое добавление/удаление товара
  // молча стирает доставку из total (delivery_cost остаётся, total — нет). Тот же класс
  // бага, что чинили в OrderEditModal — здесь ещё и срабатывает автоматически, без
  // участия оператора, на каждый заход клиента в корзину.
  const goodsTotal = rows.reduce((sum, r) => sum + Number(r.price || 0) * Number(r.qty || 0), 0)
  const { data: orderMeta } = await sb
    .from('orders')
    .select('fulfillment_type, delivery_city')
    .eq('id', orderId)
    .maybeSingle()
  const fee = await getCityDeliveryFee(sb)
  const deliveryCost = computeDeliveryCost(orderMeta?.fulfillment_type, orderMeta?.delivery_city, fee, goodsTotal)
  const total = goodsTotal + deliveryCost
  const { error: orderError } = await sb
    .from('orders')
    .update({ total, delivery_cost: deliveryCost || null })
    .eq('id', orderId)
  if (orderError) throw orderError

  return getClientCart(sb, clientId)
}

export async function addClientCartItem(
  sb: SupabaseClient,
  clientId: string,
  rawItem: unknown,
) {
  const current = await getClientCart(sb, clientId)
  const nextItems = normalizeCartItems([
    ...current.items,
    rawItem,
  ])

  return replaceClientCart(sb, clientId, nextItems)
}
