import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'

// fs-доступ → только Node-рантайм (не edge)
export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BYTES = 8 * 1024 * 1024 // 8 МБ — фото уже сжато клиентом (JPEG 88%, ≤1200px)

function extFromType(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Приём готового (обработанного на клиенте) фото товара.
 * VPS: пишет файл в MEDIA_DIR, отдаёт публичный url под MEDIA_PUBLIC_BASE.
 * Без MEDIA_DIR (Vercel-превью): фолбэк в Supabase Storage (бакет product-images).
 * Старый файл (oldUrl) удаляется best-effort — на том бэкенде, где он лежал.
 * Имя файла генерится сервером из productId — клиент путь не контролирует (нет path traversal).
 */
export async function POST(req: NextRequest) {
  try {
    // Серверная авторизация: только admin/manager (паттерн как у import-xls/*).
    const authed = await getAuthedWithRole(req, ['admin', 'manager'])
    if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file')
    const productId = Number(form.get('productId'))
    const slot = String(form.get('slot') || 'main')
    const oldUrl = form.get('oldUrl') ? String(form.get('oldUrl')) : ''

    if (!(file instanceof File)) return NextResponse.json({ error: 'no file' }, { status: 400 })
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: 'bad productId' }, { status: 400 })
    if (slot !== 'main' && slot !== 'campaign') return NextResponse.json({ error: 'bad slot' }, { status: 400 })
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'not an image' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_BYTES) return NextResponse.json({ error: 'bad size' }, { status: 400 })

    const ext = extFromType(file.type)
    const fname = `${slot === 'campaign' ? `campaign_${productId}` : productId}_${Date.now()}.${ext}`

    const mediaDir = process.env.MEDIA_DIR
    const publicBase = process.env.MEDIA_PUBLIC_BASE?.replace(/\/$/, '')

    // ── VPS: запись на диск ──────────────────────────────────────────────
    if (mediaDir && publicBase) {
      await mkdir(mediaDir, { recursive: true })
      await writeFile(path.join(mediaDir, fname), buf)
      // удалить старый файл, если он был нашим (под MEDIA_PUBLIC_BASE)
      if (oldUrl.startsWith(publicBase + '/')) {
        const oldName = oldUrl.slice(publicBase.length + 1).split('?')[0]
        if (oldName && /^[\w.\-]+$/.test(oldName)) {
          unlink(path.join(mediaDir, oldName)).catch(() => {})
        }
      }
      return NextResponse.json({ url: `${publicBase}/${fname}` })
    }

    // ── Фолбэк (превью): Supabase Storage ────────────────────────────────
    const sb = createAdminClient()
    const { error } = await sb.storage.from('product-images').upload(fname, buf, { contentType: file.type, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (oldUrl.includes('/product-images/')) {
      const oldPath = decodeURIComponent(oldUrl.split('/product-images/')[1].split('?')[0])
      sb.storage.from('product-images').remove([oldPath]).catch(() => {})
    }
    const { data } = sb.storage.from('product-images').getPublicUrl(fname)
    return NextResponse.json({ url: data.publicUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'upload failed' }, { status: 500 })
  }
}
