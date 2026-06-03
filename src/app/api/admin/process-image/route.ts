import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
function slugify(s: string) {
  return s.toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function extractStoragePath(url: string): string | null {
  const marker = '/product-images/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const productId = formData.get('productId') as string | null

    if (!file || !productId) {
      return NextResponse.json({ error: 'file и productId обязательны' }, { status: 400 })
    }

    const apiKey = process.env.REMOVE_BG_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'REMOVE_BG_API_KEY не настроен' }, { status: 500 })
    }

    // ── call remove.bg ──────────────────────────────────────────────────────────
    const rbForm = new FormData()
    rbForm.append('image_file', file)
    rbForm.append('size', process.env.REMOVE_BG_SIZE || 'auto')
    rbForm.append('bg_color', 'ffffff')
    rbForm.append('format', 'jpg')

    let processedBytes: ArrayBuffer
    let skipBg = false
    let noCreditsMsg: string | null = null

    const callRemoveBg = () =>
      fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: rbForm,
      })

    let rbRes = await callRemoveBg()

    if (rbRes.status === 429) {
      const delay = parseInt(rbRes.headers.get('Retry-After') || '5', 10) * 1000
      await new Promise(r => setTimeout(r, delay))
      rbRes = await callRemoveBg()
    }

    if (rbRes.status === 402) {
      skipBg = true
      noCreditsMsg = 'Кредиты remove.bg закончились, фото сохранено без обработки'
      processedBytes = await file.arrayBuffer()
    } else if (!rbRes.ok) {
      const errText = await rbRes.text().catch(() => '')
      return NextResponse.json(
        { error: `remove.bg вернул ${rbRes.status}${errText ? ': ' + errText.slice(0, 200) : ''}` },
        { status: 502 }
      )
    } else {
      processedBytes = await rbRes.arrayBuffer()
    }

    // ── get product info ────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: product } = await supabase
      .from('products')
      .select('name, image_url')
      .eq('id', productId)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })
    }

    // ── remove old image ────────────────────────────────────────────────────────
    if (product.image_url) {
      const oldPath = extractStoragePath(product.image_url)
      if (oldPath) await supabase.storage.from('product-images').remove([oldPath])
    }

    // ── upload to storage ───────────────────────────────────────────────────────
    const ext = skipBg ? (file.name.split('.').pop() || 'jpg') : 'jpg'
    const contentType = skipBg ? file.type : 'image/jpeg'
    const path = `${slugify(product.name)}_${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('product-images')
      .upload(path, processedBytes, { upsert: false, contentType })

    if (uploadErr) {
      return NextResponse.json({ error: `Storage: ${uploadErr.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)

    await supabase.from('products').update({ image_url: publicUrl }).eq('id', productId)

    return NextResponse.json({ url: publicUrl, message: noCreditsMsg })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
