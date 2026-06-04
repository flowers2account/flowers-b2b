// Удаление фона пакетно через @imgly/background-removal-node
// Запуск: node --env-file=.env.local scripts/remove-bg-batch.mjs [subcategory] [limit] [--dry-run]
//
// Примеры:
//   node --env-file=.env.local scripts/remove-bg-batch.mjs film_bags 2 --dry-run   # тест
//   node --env-file=.env.local scripts/remove-bg-batch.mjs film_bags 2             # реально 2 шт

import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'module'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const require = createRequire(import.meta.url)

const subcategory = process.argv[2] || 'film_bags'
const limit = parseInt(process.argv[3] || '2', 10)
const dryRun = process.argv.includes('--dry-run')

console.log(`\n🔍 Обработка: subcategory=${subcategory}, limit=${limit}${dryRun ? ' [DRY RUN]' : ''}\n`)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
function slugify(s) {
  return s.toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Загрузка изображения с URL
async function fetchImageBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

// Удаление фона → прозрачный PNG, потом белый фон через Jimp
async function removeBg(inputBuffer, mimeType = 'image/jpeg') {
  const { removeBackground } = await import('@imgly/background-removal-node')
  const { Jimp } = await import('jimp')

  // 1. PNG с прозрачностью
  const blob = new Blob([inputBuffer], { type: mimeType })
  const pngBlob = await removeBackground(blob, { output: { format: 'image/png' } })
  const pngBuf = Buffer.from(await pngBlob.arrayBuffer())

  // 2. Белая подложка + наложение PNG через Jimp
  const fg = await Jimp.fromBuffer(pngBuf)
  const bg = new Jimp({ width: fg.width, height: fg.height, color: 0xFFFFFFFF }) // белый
  bg.composite(fg, 0, 0)
  return await bg.getBuffer('image/jpeg', { quality: 88 })
}

// Композитинг: PNG без фона → JPEG на белом
async function compositeWhite(pngBuffer) {
  const sharp = require('sharp')
  return sharp({
    create: { width: 1, height: 1, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    // Создаём белую подложку нужного размера
    .composite([]) // placeholder
    .toBuffer()
    .then(async () => {
      const meta = await sharp(pngBuffer).metadata()
      const { width, height } = meta
      return sharp({
        create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } }
      })
        .composite([{ input: pngBuffer, blend: 'over' }])
        .jpeg({ quality: 88 })
        .toBuffer()
    })
}

// ── main ──────────────────────────────────────────────────────────────────────

const { data: products, error } = await supabase
  .from('products')
  .select('id, name, image_url')
  .eq('subcategory', subcategory)
  .eq('is_active', true)
  .not('image_url', 'is', null)
  .order('qty', { ascending: false })
  .limit(limit)

if (error) { console.error('DB error:', error.message); process.exit(1) }
console.log(`Найдено ${products.length} товаров с фото\n`)

let ok = 0, fail = 0

for (const p of products) {
  console.log(`→ [${p.id}] ${p.name}`)
  console.log(`  URL: ${p.image_url}`)

  if (dryRun) {
    console.log(`  [dry-run] пропускаем обработку\n`)
    continue
  }

  try {
    // 1. Скачать
    console.log(`  1/4 Скачиваем...`)
    const original = await fetchImageBuffer(p.image_url)
    console.log(`       ${(original.length / 1024).toFixed(0)} КБ`)

    // 2. Удалить фон + белый фон (JPEG output)
    console.log(`  2/3 Удаляем фон (imgly → JPEG белый)...`)
    const jpegBuf = await removeBg(original)
    console.log(`       JPEG ${(jpegBuf.length / 1024).toFixed(0)} КБ`)

    // 3. Загрузить в Storage + обновить БД
    console.log(`  3/3 Загружаем в Storage...`)
    const storagePath = `${slugify(p.name)}_${Date.now()}.jpg`

    // Удаляем старое если оно в нашем бакете
    if (p.image_url?.includes('supabase.co')) {
      const marker = '/product-images/'
      const idx = p.image_url.indexOf(marker)
      if (idx !== -1) {
        const oldPath = decodeURIComponent(p.image_url.slice(idx + marker.length).split('?')[0])
        await supabase.storage.from('product-images').remove([oldPath])
      }
    }

    const { error: upErr } = await supabase.storage
      .from('product-images')
      .upload(storagePath, jpegBuf, { contentType: 'image/jpeg', upsert: false })
    if (upErr) throw new Error(`Storage: ${upErr.message}`)

    const publicUrl = supabase.storage.from('product-images').getPublicUrl(storagePath).data.publicUrl
    await supabase.from('products').update({ image_url: publicUrl }).eq('id', p.id)

    console.log(`  ✓ Готово: ${publicUrl}\n`)
    ok++
  } catch (err) {
    console.error(`  ✗ Ошибка: ${err.message}\n`)
    fail++
  }
}

console.log(`\nИтого: ✓ ${ok} обработано, ✗ ${fail} ошибок`)
if (dryRun) console.log('(dry-run — ничего не изменено)')
