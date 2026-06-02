// import-accessories.mjs
// Запуск: node --env-file=.env.local scripts/import-accessories.mjs [subcategory|ALL] [path/to/file.jsonl]
//
// Примеры:
//   node --env-file=.env.local scripts/import-accessories.mjs ALL
//   node --env-file=.env.local scripts/import-accessories.mjs packaging
//   node --env-file=.env.local scripts/import-accessories.mjs soil
//
// Подкатегории: packaging / soil / lawns / pots / garden / artificial / toys

import fs from 'fs'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_JSONL   = 'C:\\Users\\Владелец\\Desktop\\urfl_parser\\products.jsonl'
const JSONL_PATH      = process.argv[3] || DEFAULT_JSONL
const SUBCAT_FILTER   = (process.argv[2] || 'ALL').toLowerCase()

// Нормализация старых ключей парсера → актуальные ключи сайта
const SUBCAT_NORM = {
  'lawn_cover': 'lawns',
  'pots_decor': 'pots',
}
const norm = (s) => SUBCAT_NORM[s] ?? s

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Загрузка JSONL ────────────────────────────────────────────────────────────

async function loadJsonl() {
  const items = []
  const rl = readline.createInterface({ input: fs.createReadStream(JSONL_PATH, { encoding: 'utf-8' }) })
  for await (const line of rl) {
    if (!line.trim()) continue
    try { items.push(JSON.parse(line)) } catch {}
  }
  return items
}

// ── Загрузка существующих товаров (ключ: name) ────────────────────────────────

async function loadExisting() {
  const PAGE = 900
  const map  = new Map()
  let from   = 0
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, image_url, source')
      .eq('category', 'accessories')
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    for (const p of data) map.set(p.name.trim(), p)
    if (data.length < PAGE) break
    from += PAGE
  }
  return map
}

// ── Основной импорт ───────────────────────────────────────────────────────────

async function run() {
  console.log(`\n📦 Импорт аксессуаров | файл: ${JSONL_PATH}`)
  console.log(`   фильтр подкатегории: ${SUBCAT_FILTER === 'all' ? 'ALL' : SUBCAT_FILTER}\n`)

  const all = await loadJsonl()

  const items = all
    .map(i => ({ ...i, subcategory: norm(i.subcategory) }))
    .filter(i => SUBCAT_FILTER === 'all' || i.subcategory === SUBCAT_FILTER)

  if (!items.length) {
    console.log('Нет позиций по фильтру. Доступные подкатегории:')
    const cats = [...new Set(all.map(i => norm(i.subcategory)))]
    cats.forEach(c => console.log(`  ${c}`))
    return
  }

  console.log(`Позиций в файле: ${items.length}`)

  const existing = await loadExisting()
  console.log(`Существующих accessories в БД: ${existing.size}\n`)

  const toInsert = []
  const toUpdate = []

  for (const item of items) {
    const name   = item.name?.trim()
    if (!name) continue

    const found = existing.get(name)

    if (found) {
      // UPDATE: ставим subcategory, source; image_url только если пустое
      const upd = {
        subcategory: item.subcategory,
        source:      'uralsk_site',
      }
      if (!found.image_url && item.image_url) upd.image_url = item.image_url
      toUpdate.push({ id: found.id, upd })
    } else {
      toInsert.push({
        name,
        display_name:  name,
        category:      'accessories',
        subcategory:   item.subcategory,
        image_url:     item.image_url || null,
        source:        'uralsk_site',
        is_active:     false,
        qty:           0,
        price:         0,
      })
    }
  }

  console.log(`Новых (INSERT): ${toInsert.length}`)
  console.log(`Обновлений (UPDATE): ${toUpdate.length}\n`)

  // INSERT батчами по 100
  let created = 0, createErrors = 0
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100)
    const { error } = await supabase.from('products').insert(batch)
    if (error) {
      console.error(`  ❌ INSERT batch ${i}–${i + batch.length}: ${error.message}`)
      createErrors += batch.length
    } else {
      created += batch.length
      process.stdout.write(`  ✅ Создано: ${created}/${toInsert.length}\r`)
    }
  }
  if (toInsert.length) console.log()

  // UPDATE по одному (чтобы видеть конкретные ошибки)
  let updated = 0, updateErrors = 0
  for (const { id, upd } of toUpdate) {
    const { error } = await supabase.from('products').update(upd).eq('id', id)
    if (error) {
      console.error(`  ❌ UPDATE id=${id}: ${error.message}`)
      updateErrors++
    } else {
      updated++
    }
  }

  console.log('\n── Итог ──────────────────────────────────────────')
  console.log(`  Создано:    ${created}  (ошибок: ${createErrors})`)
  console.log(`  Обновлено:  ${updated}  (ошибок: ${updateErrors})`)
  console.log(`  Всего:      ${created + updated} из ${items.length}`)
  console.log('──────────────────────────────────────────────────\n')
}

run().catch(console.error)
