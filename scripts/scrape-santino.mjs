// scripts/scrape-santino.mjs — матч карточек Santino (горшки/вазоны) с дилерским фотобанком
// «Сантино для Цветы Оптом» (cloud.mail.ru/public/6bGE/LMNBWyuyv). Фото скачаны в tmp-santino/.
// Запуск:
//   node --env-file=.env.local scripts/scrape-santino.mjs            # DRY: план матча + READ-BACK
//   node --env-file=.env.local scripts/scrape-santino.mjs --commit   # запись draft-полей + VPS
//
// Матч по СЕРИЯ + ЦВЕТ (+ ОБЪЁМ как тай-брейк). Пишем ТОЛЬКО draft-поля (через H.writeDraft):
//   image_draft_url, image_draft_raw_url, colors, color_images,
//   image_status='approved_dealer', image_source='Santino фотобанк'.
// Витрину (image_url/is_active/qty/price) не трогаем.

import * as H from './scrape-harness.mjs'
import { readFileSync } from 'fs'

const COMMIT = process.argv.includes('--commit')
const OUT = 'tmp-santino'
const SUPPLIER = 'Сантино'
const SOURCE = 'Santino фотобанк'

// ── нормализация / стем (гасим морфологию 5-симв. префиксом) ─────────────────────
const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е')
  .replace(/[«»"'(),:.;\\/\-–—]+/g, ' ').replace(/\s+/g, ' ').trim()  // дефис — разделитель: «красный-черный»=«красный - черный»
const STEM = w => (w.length >= 5 ? w.slice(0, 5) : w)

// ── серии (алиасы RU/EN). \b НЕ используем: в JS он не работает с кириллицей
// (кир. буквы — не \w), поэтому матчим подстрокой. Порядок: специфичные раньше. ─────
const SERIES = [
  ['deco_twin', /деко\s*твин|deco\s*twin/i],
  ['orchidea',  /орхидея|orchidea/i],
  ['calipso',   /калипсо|calipso/i],
  ['latana',    /латана|latana/i],
  ['latina',    /латина|latina/i],
  ['lilia',     /лили[яй]/i],
  ['arte',      /арте|arte/i],
  ['dali',      /дали|dali/i],
  ['asti',      /асти|asti/i],
  ['vista',     /виста|vista/i],
]
const detectSeries = s => SERIES.find(([, re]) => re.test(s))?.[0] ?? null

// СТОП-слова (форма/упаковка/серия/служебное) — всё, что НЕ цвет. Токен-фильтр вместо
// \b-регэкспов (надёжно для кириллицы). Нижний регистр, ё→е.
const STOP = new Set([
  'горшок', 'вазон', 'двойной', 'балконный', 'ящик', 'картриджем', 'картриджами', 'картридж',
  'подвеской', 'подвеска', 'подвесная', 'подвесной', 'подвес', 'подвсеная', 'автополивом',
  'пластик', 'окошком', 'окошко', 'цвет', 'шт', 'на', 'ножке', 'window', 'box', 'plus', 'twin',
  'deco', 'деко', 'твин', 'orchidea', 'орхидея', 'calipso', 'калипсо', 'latana', 'латана',
  'латина', 'latina', 'лилия', 'лилий', 'арте', 'arte', 'дея', 'дали', 'dali', 'asti', 'асти',
  'vista', 'виста', 'santino', 'сантино', 'ассортим', 'ассортименте', 'ассортиме', 'см', 'мл',
])
const isColorWord = w => w && w.length >= 3 && !/\d/.test(w) && !STOP.has(w)

// цвет: набор стем-токенов + человекочитаемая метка
function colorOf(name) {
  const words = norm(name).split(' ').filter(isColorWord)
  return { label: words.join('-'), toks: new Set(words.map(STEM)) }
}

// объёмы из строки → числа (норм заменяет «,»/«.» на пробел, поэтому по сырой строке)
function vols(s) {
  return [...String(s).matchAll(/(\d+[.,]?\d*)\s*л\b/gi)].map(m => Number(m[1].replace(',', '.')))
}

// ── загрузка товаров Santino ────────────────────────────────────────────────────
const { data: prodRows, error } = await H.sb.from('products')
  .select('id,name,display_name,volume_l,colors,color_images,image_url,image_draft_url')
  .eq('supplier', SUPPLIER).order('id')
if (error) { console.error('DB:', error.message); process.exit(1) }

const products = prodRows.map(p => {
  const c = colorOf(p.name)
  return { ...p, series: detectSeries(p.name), vol: p.volume_l ?? vols(p.name)[0] ?? null, colorLabel: c.label, colorToks: c.toks }
})

// карта: цвет-токен → множество серий (для фото без явной серии — авто-привязка, если однозначно)
const tokSeries = new Map()
for (const p of products) if (p.series) for (const t of p.colorToks) {
  if (!tokSeries.has(t)) tokSeries.set(t, new Set())
  tokSeries.get(t).add(p.series)
}

// ── разбор фотобанка ────────────────────────────────────────────────────────────
const files = JSON.parse(readFileSync(`${OUT}/_files.json`, 'utf8'))
// служебные/чужие/архив — не товарные фото
const NON_PRODUCT = /интерьер|листовка|в разрезе|^\d+$|не наш|пробный|старый|\.rar$/i
const photoColor = name => colorOf(name.replace(/\.[a-z0-9]+$/i, '')).toks

const photos = files.filter(f => !NON_PRODUCT.test(f.orig)).map(f => {
  const series = detectSeries(f.orig)
  const ctoks = photoColor(f.orig)
  let effSeries = series
  if (!effSeries) {                          // фото без серии: привязать по цвету, если он однозначен
    const inter = [...ctoks].map(t => tokSeries.get(t)).filter(Boolean)
    if (inter.length) {
      let acc = new Set(inter[0])
      for (const s of inter.slice(1)) acc = new Set([...acc].filter(x => s.has(x)))
      if (acc.size === 1) effSeries = [...acc][0]
    }
  }
  return { ...f, series, effSeries, ctoks, vols: vols(f.orig) }
})

// ── МАТЧ: серия совпала + РОВНО тот же набор цветов-тонов + объём как тай-брейк ──
// Требуем РАВЕНСТВО наборов цветов (не подмножество): иначе фото «красный-белый»
// ложно совпало бы с одноцветным товаром «белый».
function scorePhoto(prod, ph) {
  if (!prod.series || ph.effSeries !== prod.series) return -1
  if (!prod.colorToks.size || prod.colorToks.size !== ph.ctoks.size) return -1
  if (![...prod.colorToks].every(t => ph.ctoks.has(t))) return -1
  let s = 10
  if (ph.series) s += 3                                    // явная серия в имени фото надёжнее цвет-привязки
  if (prod.vol != null && ph.vols.length) s += ph.vols.includes(prod.vol) ? 4 : -1
  s += Math.min(3, ph.kb / 400)                            // выше разрешение — небольшой бонус
  return s
}

const matches = []   // { prod, photo, score }
const usedPhotos = new Set()
for (const prod of products) {
  // кандидаты с одинаковым набором цвет+серия — это дубли/ракурсы ОДНОГО товара,
  // не неоднозначность: берём лучший по (score, разрешение).
  let best = null, bestKey = [-1, -1]
  for (const ph of photos) {
    const sc = scorePhoto(prod, ph)
    if (sc < 0) continue
    const key = [sc, ph.kb]
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) { best = ph; bestKey = key }
  }
  if (best) { matches.push({ prod, photo: best, score: +bestKey[0].toFixed(1) }); usedPhotos.add(best.local) }
  else matches.push({ prod, photo: null, reason: 'нет фото по серии+цвету' })
}

// ── запись черновиков (только --commit) ─────────────────────────────────────────
const uploaded = new Map()  // photo.local → { draftUrl, rawUrl }
async function ensureUpload(ph) {
  if (uploaded.has(ph.local)) return uploaded.get(ph.local)
  const buf = readFileSync(`${OUT}/${ph.local}`)
  const ext = ph.local.split('.').pop().toLowerCase() === 'png' ? 'png' : 'jpg'
  const draft = await H.processImg(buf)
  const base = `santino_p${String(ph.idx).padStart(2, '0')}`
  const rawUrl = await H.uploadVPS(buf, `${base}_raw.${ext}`)
  const draftUrl = await H.uploadVPS(draft, `${base}.jpg`)
  const u = { draftUrl, rawUrl }
  uploaded.set(ph.local, u)
  return u
}

let written = 0
const matched = matches.filter(m => m.photo)
for (const m of matched) {
  if (!COMMIT) continue
  const u = await ensureUpload(m.photo)
  const draft = {
    image_draft_url: u.draftUrl,
    image_draft_raw_url: u.rawUrl,
    image_status: 'approved_dealer',
    image_source: SOURCE,
    colors: [m.prod.colorLabel],
    color_images: { [m.prod.colorLabel]: u.draftUrl },
  }
  const w = await H.writeDraft(m.prod.id, draft)
  if (w.updated) written++
  else m.reason = w.error || 'writeDraft не обновил'
}

// ── READ-BACK ───────────────────────────────────────────────────────────────────
const unmatched = matches.filter(m => !m.photo)
const unusedPhotos = photos.filter(p => !usedPhotos.has(p.local))
const skipped = files.filter(f => NON_PRODUCT.test(f.orig))

console.log(`\n═══ Santino фотобанк ↔ карточки (${COMMIT ? 'COMMIT' : 'DRY'}) ═══`)
console.log(`товаров Santino: ${products.length} | фото товарных: ${photos.length} | служебных/архив: ${skipped.length}`)
console.log(`СМАТЧЕНО: ${matched.length}${COMMIT ? ` (записано ${written})` : ''} | БЕЗ МАТЧА: ${unmatched.length}`)

const bySer = {}
for (const m of matched) (bySer[m.prod.series] ??= []).push(m)
console.log(`\n── сматчено по сериям ──`)
for (const [s, arr] of Object.entries(bySer)) console.log(`  ${s}: ${arr.length}`)

console.log(`\n── 3 примера матча ──`)
for (const m of matched.slice(0, 3)) {
  console.log(`  #${m.prod.id} [${m.prod.series}] vol=${m.prod.vol} «${m.prod.colorLabel}»`)
  console.log(`     ← ${m.photo.orig} (${m.photo.kb}KB, score ${m.score}${m.photo.series ? '' : ', цвет-привязка'})`)
}

console.log(`\n── товары БЕЗ матча (${unmatched.length}) ──`)
for (const m of unmatched) console.log(`  #${m.prod.id} [${m.prod.series ?? '?'}] vol=${m.prod.vol} «${m.prod.colorLabel}» — ${m.reason}`)

console.log(`\n── фото БЕЗ сопоставления (${unusedPhotos.length} товарных + ${skipped.length} служебных) ──`)
for (const p of unusedPhotos) console.log(`  ${p.orig}  [серия ${p.effSeries ?? '?'}]`)
console.log(`  служебные/чужие/архив: ${skipped.map(f => f.orig).join(' · ')}`)

if (!COMMIT) console.log(`\n(DRY — в БД/VPS не писали. Запуск с --commit запишет draft-поля.)`)
