import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'
import { slugify } from '@/lib/slug'

// fs-доступ → только Node-рантайм (не edge)
export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BYTES = 8 * 1024 * 1024 // 8 МБ — фото уже сжато клиентом

function extFromType(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

// Слить ключ цвета в products.color_images (jsonb). value=null → удалить ключ.
async function mergeColorImage(productId: number, color: string, value: string | null) {
  const sb = createAdminClient()
  const { data } = await sb.from('products').select('color_images').eq('id', productId).single()
  const map: Record<string, string> = { ...(data?.color_images ?? {}) }
  if (value === null) delete map[color]
  else map[color] = value
  await sb.from('products').update({ color_images: map }).eq('id', productId)
}

/**
 * Загрузка отдельного фото под конкретный цвет товара.
 * VPS: пишет `{id}_{slug(цвет)}.{ext}` в MEDIA_DIR, публичный url под MEDIA_PUBLIC_BASE.
 * Без MEDIA_DIR (превью): фолбэк в Supabase Storage (бакет product-images).
 * Имя файла детерминировано (id + slug цвета) → повторная загрузка перезаписывает;
 * для сброса кэша браузера к url добавляется ?v=timestamp. URL пишется в color_images[цвет].
 * Это чистый UI-свап главного фото — склад/резервы/заказы не затронуты.
 */
export async function POST(req: NextRequest) {
  try {
    const authed = await getAuthedWithRole(req, ['admin', 'manager'])
    if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file')
    const productId = Number(form.get('productId'))
    const color = String(form.get('color') || '').trim()

    if (!(file instanceof File)) return NextResponse.json({ error: 'no file' }, { status: 400 })
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: 'bad productId' }, { status: 400 })
    if (!color) return NextResponse.json({ error: 'no color' }, { status: 400 })
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'not an image' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_BYTES) return NextResponse.json({ error: 'bad size' }, { status: 400 })

    const slug = slugify(color)
    if (!slug) return NextResponse.json({ error: 'unslugifiable color' }, { status: 400 })
    const ext = extFromType(file.type)
    const fname = `${productId}_${slug}.${ext}`
    const ver = `?v=${Date.now()}`

    const mediaDir = process.env.MEDIA_DIR
    const publicBase = process.env.MEDIA_PUBLIC_BASE?.replace(/\/$/, '')

    // ── VPS: запись на диск ──────────────────────────────────────────────
    if (mediaDir && publicBase) {
      await mkdir(mediaDir, { recursive: true })
      await writeFile(path.join(mediaDir, fname), buf)
      const url = `${publicBase}/${fname}${ver}`
      await mergeColorImage(productId, color, url)
      return NextResponse.json({ url, color })
    }

    // ── Фолбэк (превью): Supabase Storage ────────────────────────────────
    const sb = createAdminClient()
    const { error } = await sb.storage.from('product-images').upload(fname, buf, { contentType: file.type, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data } = sb.storage.from('product-images').getPublicUrl(fname)
    const url = data.publicUrl + ver
    await mergeColorImage(productId, color, url)
    return NextResponse.json({ url, color })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'upload failed' }, { status: 500 })
  }
}

/** Удаление per-color фото: чистит ключ из color_images и удаляет файл best-effort. */
export async function DELETE(req: NextRequest) {
  try {
    const authed = await getAuthedWithRole(req, ['admin', 'manager'])
    if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { productId?: number; color?: string }
    const productId = Number(body.productId)
    const color = String(body.color || '').trim()
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: 'bad productId' }, { status: 400 })
    if (!color) return NextResponse.json({ error: 'no color' }, { status: 400 })

    // удалить файл, если он наш (под MEDIA_PUBLIC_BASE)
    const sb = createAdminClient()
    const { data } = await sb.from('products').select('color_images').eq('id', productId).single()
    const oldUrl: string = (data?.color_images ?? {})[color] ?? ''
    const mediaDir = process.env.MEDIA_DIR
    const publicBase = process.env.MEDIA_PUBLIC_BASE?.replace(/\/$/, '')
    if (mediaDir && publicBase && oldUrl.startsWith(publicBase + '/')) {
      const oldName = oldUrl.slice(publicBase.length + 1).split('?')[0]
      if (oldName && /^[\w.\-]+$/.test(oldName)) {
        unlink(path.join(mediaDir, oldName)).catch(() => {})
      }
    }
    await mergeColorImage(productId, color, null)
    return NextResponse.json({ ok: true, color })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'delete failed' }, { status: 500 })
  }
}
