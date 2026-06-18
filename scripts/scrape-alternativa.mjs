// scripts/scrape-alternativa.mjs — добор фото/характеристик «Альтернатива».
// Запуск:  node --env-file=.env.local scripts/scrape-alternativa.mjs [--dry] [--links]
//
// ПОВЕРХ ХАРНЕСА: вся инфраструктура (worklist, fetch, processImg, uploadVPS,
// writeDraft с аллоулистом, readBack, транслит, CONTRACT) — в scrape-harness.mjs.
//
// ДВА РЕЖИМА:
//  • (по умолчанию) КРАУЛ+МАТЧ: обход каталога cvety, строгий матч модель+цвет.
//  • --links: РЕЖИМ ПО ССЫЛКАМ — берём прямые URL товаров из xlsx (id|имя|URL),
//    выбираем нужный вариант по oid/объёму/цвету, парсим блок характеристик.
// Запись ТОЛЬКО через H.writeDraft (аллоулист). image_url/is_active/qty/price не трогаем.

import * as H from './scrape-harness.mjs'
import XLSX from 'xlsx'

const DRY = process.argv.includes('--dry')
const LINKS = process.argv.includes('--links')
const AUTO = process.argv.includes('--auto')
const HOST = 'https://www.alternat.ru'
const log = (...a) => console.log(...a)

// ──────────────────────────────────────────────────────────────────────────────
// КРАУЛ каталога cvety (для worklist-режима)
// ──────────────────────────────────────────────────────────────────────────────
const CAT_BASE = `${HOST}/catalog/dom/cvety`
// ⚠ slug «gorshok-dlya-сvetov» — с КИРИЛЛИЧЕСКОЙ «с» (так на сайте; латинская c → 404/0).
const SUBS = ['vazon', 'vaza', 'kashpo', 'podves', 'gorshok-dlya-сvetov', 'yashchik-dlya-сvetov']

function parseListing(html) {
  const items = []
  const re = /<div class="desc_name"><a href="(\/catalog\/product\/[^"]+)"><span>([^<]+)<\/span>/g
  let m
  while ((m = re.exec(html))) {
    items.push({ url: m[1], title: m[2].replace(/&quot;/g, '"').replace(/&laquo;|&raquo;/g, '"').trim() })
  }
  return items
}

async function crawlCatalog() {
  const all = new Map()
  for (const sub of SUBS) {
    let page = 1, maxp = 1
    do {
      const url = `${CAT_BASE}/${sub}/${page > 1 ? `?PAGEN_1=${page}` : ''}`
      let html
      try { html = await H.fetchHtml(url, { vpsFallback: true }) } catch { break }
      if (page === 1) {
        const pg = (html.match(/PAGEN_1=(\d+)/g) || []).map(x => +x.split('=')[1])
        maxp = pg.length ? Math.max(...pg) : 1
      }
      const items = parseListing(html)
      for (const it of items) if (!all.has(it.url)) all.set(it.url, { ...it, sub })
      log(`  ${sub} p${page}/${maxp}: +${items.length} (всего ${all.size})`)
      page++
      await H.sleep(400)
    } while (page <= maxp && page <= 10)
  }
  return [...all.values()]
}

// ──────────────────────────────────────────────────────────────────────────────
// МАТЧ — нормализация модели/цвета/литража
// ──────────────────────────────────────────────────────────────────────────────
const STOP = new Set(['кашпо', 'горшок', 'цветочный', 'ваза', 'вазон', 'поддон',
  'цв', 'для', 'д', 'с', 'на', 'под', 'срезку', 'уп', 'шт', 'мм', 'см', 'л', 'мл', 'ур'])
function model(n) {
  const q = String(n).match(/"([^"]+)"|«([^»]+)»/)
  if (q) return (q[1] || q[2]).trim().toLowerCase()
  const s = String(n).toLowerCase().replace(/ё/g, 'е')
    .split(/[(\d*×]/)[0]
    .replace(/[\/.]/g, ' ')
  const toks = s.split(/[^a-zа-я]+/).filter(w => w && !STOP.has(w))
  return toks.join(' ') || null
}
const modelHead = mod => (String(mod).split(/\s+/).filter(w => w.length > 2).sort((a, b) => b.length - a.length)[0] || mod)

const litres = s => { const m = String(s).match(/(\d+[.,]?\d*)\s*л(?![а-яёa-z])/i); return m ? +m[1].replace(',', '.') : null }
const diaFrom = s => { const m = String(s).match(/(?:⌀|ø|d|диам[а-я]*\.?)\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:см|cm)?/i); return m ? +m[1].replace(',', '.') : null }
const heightFrom = s => { const m = String(s).match(/(?:\bh\b|выс[а-я]*\.?)\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:см|cm)?/i); return m ? +m[1].replace(',', '.') : null }

const FEAT = /автополив|дренаж|с\s*под|подвес|двойн|на\s*высок|трос|уп\.|систем|вставк|квадрат|оваль|настен|шт|^м?\d+$|прикорнев|полив|^\//i
const parenColor = name => {
  const ps = [...String(name).matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim()).filter(x => !FEAT.test(x))
  return ps.length ? ps[ps.length - 1] : ''
}

const COLOR_BASE = [
  [/серебр/, 'серебряный'], [/антрац/, 'антрацит'], [/графит|^граф/, 'графит'],
  [/коричн|^корич|^кор\b|^кор$/, 'коричневый'], [/бежев|^беж/, 'бежевый'],
  [/^бел/, 'белый'], [/^чер/, 'черный'], [/^сер/, 'серый'], [/медн|^мед/, 'медный'],
  [/прозрач|^прозр/, 'прозрачный'], [/оливк|^олив/, 'оливковый'], [/какао/, 'какао'],
  [/зелен|^зел/, 'зеленый'], [/^крем/, 'кремовый'], [/^золот|^зол/, 'золотой'],
  [/лаванд/, 'лавандовый'], [/терракот|терacot/, 'терракотовый'], [/^крас/, 'красный'],
  [/^син|голуб/, 'синий'], [/^желт/, 'желтый'], [/^роз/, 'розовый'], [/мрамор/, 'мраморный'],
  [/мокко|шоколад/, 'мокко'],
]
const TINT = [[/фиолет|сирен/, 'фиолетовый'], [/зелен|зел/, 'зеленый'], [/син|голуб/, 'синий'],
  [/желт/, 'желтый'], [/роз/, 'розовый'], [/дым/, 'дымчатый'], [/янтар/, 'янтарный']]
function colorCanon(text) {
  if (text == null) return null
  const x = String(text).toLowerCase().replace(/ё/g, 'е').replace(/[.()«»"]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!x) return null
  if (/прозрач/.test(x)) {
    const rest = x.replace(/прозрач[а-я]*/g, ' ')
    const hue = TINT.find(([re]) => re.test(rest))
    if (hue) return { key: 'prozrach-' + hue[1], label: 'прозрачно-' + hue[1] }
  }
  const sv = /(^|\s)(св\.?|светл)/.test(x), tm = /(^|\s)(т\.?|темн)/.test(x)
  for (const [re, c] of COLOR_BASE) if (re.test(x)) {
    return { key: (sv ? 'sv-' : tm ? 'tm-' : '') + c, label: (sv ? 'светло-' : tm ? 'тёмно-' : '') + c }
  }
  return null
}
function cardColor(name) {
  const p = colorCanon(parenColor(name))
  if (p) return p
  for (const w of String(name).toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я-]+/)) {
    if (w.length < 3) continue
    const c = colorCanon(w)
    if (c) return c
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────────────
// РАЗБОР OFFERS — два варианта парсера
// ──────────────────────────────────────────────────────────────────────────────
// внутренности блоков OFFERS (brace-matching)
function offerBlocks(html) {
  const i = html.indexOf("OFFERS':[")
  if (i < 0) return []
  const st = i + 8
  let d = 0, end = st
  for (let k = st; k < html.length; k++) { const c = html[k]; if (c === '[') d++; else if (c === ']') { d--; if (!d) { end = k + 1; break } } }
  const arr = html.slice(st, end)
  const blocks = []
  let s = -1, b = 0
  for (let k = 0; k < arr.length; k++) { const c = arr[k]; if (c === '{') { if (!b) s = k; b++ } else if (c === '}') { b--; if (!b) blocks.push(arr.slice(s, k + 1)) } }
  return blocks
}
function offerHero(o) {
  let src = null
  const dp = o.indexOf("'DETAIL_PICTURE'")
  if (dp >= 0) { const m = o.slice(dp, dp + 400).match(/'SRC':'([^']+\.(?:jpg|jpeg|png|webp))'/i); if (m) src = m[1] }
  if (!src) { const m = o.match(/'SRC':'([^']+\.(?:jpg|jpeg|png|webp))'/i); if (m) src = m[1] }
  return src
}
// краткий парсер (worklist-режим)
function parseOffers(html) {
  const out = []
  for (const o of offerBlocks(html)) {
    const name = ((o.match(/'NAME':'([^']*)'/) || [])[1] || '').replace(/\\"/g, '"').trim()
    if (!name) continue
    out.push({ name, litres: litres(name), color: colorCanon(parenColor(name)), src: offerHero(o), dia: diaFrom(name), height: heightFrom(name) })
  }
  return out
}
// полный парсер (links-режим): + oid + свойства {code: value}
function parseOffersFull(html) {
  const out = []
  for (const o of offerBlocks(html)) {
    const oid = (o.match(/^\{'ID':'(\d+)'/) || [])[1] || null
    const name = ((o.match(/'NAME':'([^']*)'/) || [])[1] || '').replace(/\\"/g, '"').trim()
    if (!name) continue
    const props = {}
    for (const m of o.matchAll(/'NAME':'([^']*)','VALUE':'([^']*)','CODE':'([^']*)'/g)) if (!(m[3] in props)) props[m[3]] = m[2]
    out.push({ oid, name, litres: litres(name), color: colorCanon(parenColor(name)), src: offerHero(o), props })
  }
  return out
}

// характеристики из свойств оффера (коды сверены по карточкам alternat)
const kgToG = v => { const m = String(v).match(/([\d.,]+)/); return m ? Math.round(parseFloat(m[1].replace(',', '.')) * 1000) : null }
const intOf = v => { const m = String(v).match(/\d+/); return m ? +m[0] : null }
function pickChars(props) {
  return {
    tnved_code: props.tnved || null,
    dimensions_unpacked: props.item_size_tp || null,   // «Размеры изделия (ДхШхВ)»
    dimensions_packed: props.size_pack_tp || null,      // «Размеры упаковки (ДхШхВ)»
    weight_gram: props.ves_tp ? kgToG(props.ves_tp) : null,
    pack_size: props.KOEF ? intOf(props.KOEF) : null,
    volume_item: props.volume_item ? litres(props.volume_item) : null, // «Объём изделия»
  }
}
// «ДхШхВ мм» → диаметр(Д) и высота(В) в СМ (мм/10)
function dimsFromItemSize(s) {
  const m = String(s).match(/(\d+)\D+(\d+)\D+(\d+)/)
  if (!m) return {}
  return { dia: +m[1] / 10, height: +m[3] / 10 }
}

// ──────────────────────────────────────────────────────────────────────────────
// ТЕКСТ (формат CONTRACT)
// ──────────────────────────────────────────────────────────────────────────────
const KIND = sub => (sub === 'kashpo' ? 'Кашпо' : 'Горшок')
const MAT_ADJ = sub => (sub === 'kashpo' ? 'пластиковое' : 'пластиковый')
function buildPotText({ subcategory, material, colorLabel, dia, height, volume, variantCount }) {
  const kind = KIND(subcategory)
  const shortBits = [`${kind} ${MAT_ADJ(subcategory)}`]
  if (dia) shortBits.push(`Ø${dia} см`)
  if (height) shortBits.push(`высота ${height} см`)
  if (volume) shortBits.push(`${volume} л`)
  if (colorLabel) shortBits.push(colorLabel)
  const short_description = shortBits.join(', ')
  const sent = []
  let lead = `${kind} «${material}» производства «Альтернатива»`
  if (colorLabel) lead += `, цвет — ${colorLabel}`
  sent.push(lead + '.')
  const dims = []
  if (dia) dims.push(`диаметр ${dia} см`)
  if (height) dims.push(`высота ${height} см`)
  if (volume) dims.push(`объём ${volume} л`)
  if (dims.length) sent.push(`Размеры: ${dims.join(', ')}.`)
  sent.push(`Изготовлен из пластика, подходит для комнатных и балконных растений.`)
  if (variantCount > 1) sent.push(`Модель выпускается в ${variantCount} цветах.`)
  return { short_description, description: sent.join(' ') }
}
// тип-слово из имени для не-горшковых (Ведро / Лейка / Кувшин / Диван / Ваза / Щётка / Ящик)
const itemKind = name => String(name).split(/["«(\d]/)[0].replace(/[,\s]+$/, '').replace(/\s+/g, ' ').trim() || 'Изделие'
function buildItemText({ name, colorLabel, volume, variantCount }) {
  const kind = itemKind(name)
  const shortBits = [kind]
  if (volume) shortBits.push(`${volume} л`)
  if (colorLabel) shortBits.push(colorLabel)
  const short_description = shortBits.join(', ')
  const sent = []
  let lead = `${kind} производства «Альтернатива»`
  if (colorLabel) lead += `, цвет — ${colorLabel}`
  sent.push(lead + '.')
  if (volume) sent.push(`Объём ${volume} л.`)
  sent.push(`Изготовлен из пластика.`)
  if (variantCount > 1) sent.push(`Доступно цветов: ${variantCount}.`)
  return { short_description, description: sent.join(' ') }
}

// ──────────────────────────────────────────────────────────────────────────────
// ОБЩИЕ ХЕЛПЕРЫ ЗАЛИВКИ
// ──────────────────────────────────────────────────────────────────────────────
async function fetchProcessed(src) {
  const url = src.startsWith('http') ? src : HOST + src
  const buf = await H.fetchImg(url, { vpsFallback: true })
  if (!/^(ffd8|89504e47)/.test(buf.subarray(0, 4).toString('hex'))) throw new Error('не изображение')
  return { url, raw: buf, draft: await H.processImg(buf) }
}
const uploadCache = new Map()
async function uploadColor(modSlug, color, src) {
  const name = `alt-${H.tr(modSlug)}-${H.tr(color.label)}.jpg`
  if (uploadCache.has(name)) return uploadCache.get(name)
  if (DRY) { const u = `(dry)${name}`; uploadCache.set(name, u); return u }
  const { draft } = await fetchProcessed(src)
  const u = await H.uploadVPS(draft, name)
  uploadCache.set(name, u)
  return u
}

// ══════════════════════════════════════════════════════════════════════════════
// РЕЖИМ 1 — WORKLIST (краул + строгий матч модель+цвет)
// ══════════════════════════════════════════════════════════════════════════════
const offersByUrl = {}
let pagesByModel = {}
async function offersFor(url) {
  if (offersByUrl[url]) return offersByUrl[url]
  let html
  try { html = await H.fetchHtml(HOST + url, { vpsFallback: true }) } catch { offersByUrl[url] = []; return [] }
  offersByUrl[url] = parseOffers(html)
  await H.sleep(300)
  return offersByUrl[url]
}
async function modelOffers(mod) {
  const acc = []
  for (const p of pagesByModel[mod] || []) for (const o of await offersFor(p.url)) acc.push({ ...o, url: p.url })
  return acc
}

async function runWorklistMode() {
  const work = await H.worklist(q => q.eq('supplier', 'Альтернатива').in('subcategory', ['pots', 'kashpo']))
  log(`worklist (Альтернатива pots/kashpo без фото): ${work.length}`)

  log('\n[1/3] краул каталога alternat.ru …')
  const index = await crawlCatalog()
  log(`индекс товаров: ${index.length}`)

  const models = [...new Set(work.map(p => model(p.name)).filter(Boolean))]
  for (const mod of models) {
    const head = modelHead(mod).replace(/[^а-яёa-z0-9]/gi, '')
    if (!head) { pagesByModel[mod] = []; continue }
    pagesByModel[mod] = index.filter(x => new RegExp(head, 'i').test(x.title.replace(/ё/gi, 'е')))
  }

  log('\n[2/3] разбор страниц товаров (OFFERS) …')
  log('\n[3/3] матч (модель+цвет строго) + запись черновиков …')
  const report = []
  for (const p of work) {
    const mod = model(p.name)
    const wantColor = cardColor(p.name)
    const wantL = litres(p.name)
    const rec = { id: p.id, name: p.name, model: mod, color: wantColor?.label || null, litres: wantL, found: false, reason: '' }

    if (!mod) { rec.reason = 'модель не распознана'; report.push(rec); log(`NF ${p.id} «${p.name}» — ${rec.reason}`); continue }
    if (!wantColor) { rec.reason = 'цвет не распознан в названии'; report.push(rec); log(`NF ${p.id} ${mod} — ${rec.reason}`); continue }

    const offers = (await modelOffers(mod)).filter(o => o.src)
    if (!offers.length) { rec.reason = 'модель не найдена на alternat'; report.push(rec); log(`NF ${p.id} ${mod} — ${rec.reason}`); continue }

    const sameColor = offers.filter(o => o.color && o.color.key === wantColor.key)
    if (!sameColor.length) { rec.reason = `цвет «${wantColor.label}» отсутствует на сайте (добор: +7 347 673-22-44)`; report.push(rec); log(`NF ${p.id} ${mod} «${wantColor.label}» — ${rec.reason}`); continue }

    const exact = sameColor.find(o => wantL != null && o.litres === wantL)
    const hero = exact || sameColor[0]
    rec.exact_litres = !!exact
    rec.url = HOST + hero.url

    const variants = new Map()
    for (const o of offers) if (o.color && !variants.has(o.color.key)) variants.set(o.color.key, o)
    rec.variant_count = variants.size

    try {
      let heroDraftUrl, heroRawUrl
      if (DRY) {
        heroDraftUrl = `(dry)${p.id}_draft.jpg`; heroRawUrl = `(dry)${p.id}_draft_raw.jpg`
      } else {
        const { raw, draft } = await fetchProcessed(hero.src)
        heroDraftUrl = await H.uploadVPS(draft, `${p.id}_draft.jpg`)
        heroRawUrl = await H.uploadVPS(raw, `${p.id}_draft_raw.jpg`)
      }
      const color_images = {}
      const colors = []
      for (const o of variants.values()) {
        const u = await uploadColor(mod, o.color, o.src)
        color_images[o.color.label] = u
        colors.push(o.color.label)
      }
      const { short_description, description } = buildPotText({
        subcategory: p.subcategory, material: mod, colorLabel: wantColor.label,
        dia: hero.dia, height: hero.height, volume: hero.litres, variantCount: variants.size,
      })
      const draftFields = {
        image_draft_url: heroDraftUrl, image_draft_raw_url: heroRawUrl,
        image_status: 'draft', image_source: HOST + hero.url,
        pot_material: 'пластик', pot_color: wantColor.label,
        pot_diameter: hero.dia ?? null, pot_height: hero.height ?? null, volume_l: hero.litres ?? null,
        colors, color_images, short_description, description,
      }
      if (DRY) {
        rec.found = true
        log(`OK(dry) ${p.id} ${mod} «${wantColor.label}» vol=${hero.litres ?? '-'} colors=${colors.length}`)
      } else {
        const res = await H.writeDraft(p.id, draftFields)
        rec.found = res.updated; rec.reason = res.error || ''
        log(`${res.updated ? 'OK ' : 'ERR'} ${p.id} ${mod} «${wantColor.label}» vol=${hero.litres ?? '-'} colors=${colors.length}${res.error ? ' :: ' + res.error : ''}`)
      }
    } catch (e) {
      rec.reason = 'ошибка разбора/заливки: ' + String(e.message || e).slice(0, 120)
      log(`ERR ${p.id} ${mod}: ${rec.reason}`)
    }
    report.push(rec)
  }

  const ok = report.filter(r => r.found)
  log(`\n=== ПРОГОН ===`)
  log(`worklist: ${work.length} | found: ${ok.length} | not_found: ${report.length - ok.length}`)
  const reasons = {}
  for (const r of report.filter(x => !x.found)) reasons[r.reason] = (reasons[r.reason] || 0) + 1
  log('причины not_found:', JSON.stringify(reasons, null, 1))

  if (!DRY) {
    const rb = await H.readBack(q => q.eq('supplier', 'Альтернатива').in('subcategory', ['pots', 'kashpo']))
    log(`\n=== READ-BACK (Альтернатива pots/kashpo) ===`)
    log(`count: ${rb.count} | found(draft): ${rb.found} | with_image_url(=0?): ${rb.with_image_url} | with_color_images: ${rb.with_color_images}`)
    log('примеры (3):', JSON.stringify(rb.examples, null, 1))
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// РЕЖИМ 2 — ПО ССЫЛКАМ (xlsx с прямыми URL товаров)
// ══════════════════════════════════════════════════════════════════════════════
const LINK_FILE = 'C:/Users/Владелец/Downloads/Альтернатива_все_251_ссылки.xlsx'
const LINK_IDS = [5588, 5589, 5691, 5692, 5696, 5701, 5703, 5704, 5714, 5723, 5726, 5564,
  5669, 5670, 5645, 5658, 5674, 5677, 5679, 5610, 5571, 5572, 5573, 5646]
const LINK_SKIP = new Set([5642, 5643])
const URL_OVERRIDE = {
  5610: 'https://www.alternat.ru/catalog/product/gorshok_tsvetochnyy_leya_5l_dvoynoy_s_avtopolivom/?oid=60856',
}

// выбор оффера по имени нашей карточки: отличит. номер (№N) + цвет + объём
function pickByName(offers, cardName) {
  const cl = litres(cardName), cc = cardColor(cardName)
  const num = (cardName.match(/№\s*(\d+)/) || [])[1]
  let pool = offers.filter(o => o.src)
  if (num) { const byNum = pool.filter(o => new RegExp('№\\s*' + num).test(o.name)); if (!byNum.length) return null; pool = byNum }
  if (cc) { const byC = pool.filter(o => o.color && o.color.key === cc.key); if (byC.length) pool = byC }
  if (cl != null) { const byL = pool.find(o => o.litres === cl); if (byL) return byL }
  return pool[0] || null
}

async function runLinksMode() {
  // 1) xlsx → id → {name, url}
  const wb = XLSX.readFile(LINK_FILE)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  const linkById = {}
  for (const r of rows) {
    const id = Number(r[0]); if (!id) continue
    const urlCell = r.find((c, idx) => idx > 0 && /alternat\.ru\/catalog/i.test(String(c)))
    linkById[id] = { name: String(r[1] || ''), url: urlCell ? String(urlCell) : '' }
  }
  // какие oid общие у >1 карточки (тогда выбор по oid некорректен → по имени)
  const oidCount = {}
  for (const id of LINK_IDS) { const u = URL_OVERRIDE[id] || linkById[id]?.url || ''; const o = (u.match(/[?&]oid=(\d+)/) || [])[1]; if (o) oidCount[o] = (oidCount[o] || 0) + 1 }

  // 2) имена/категории из БД
  const { data: dbRows } = await H.sb.from('products').select('id,name,subcategory,category').in('id', LINK_IDS)
  const dbById = Object.fromEntries((dbRows || []).map(r => [r.id, r]))

  log(`\n[links] обрабатываю ${LINK_IDS.length} id (skip: ${[...LINK_SKIP].join(',')})`)
  const report = []
  for (const id of LINK_IDS) {
    if (LINK_SKIP.has(id)) { log(`SKIP ${id}`); continue }
    const db = dbById[id]
    const name = db?.name || linkById[id]?.name || ''
    const sub = db?.subcategory || ''
    const url = URL_OVERRIDE[id] || linkById[id]?.url || ''
    const rec = { id, name, sub, found: false, reason: '' }

    if (!/alternat\.ru\/catalog\/product/i.test(url)) { rec.reason = URL_OVERRIDE[id] ? 'оверрайд-URL невалиден' : 'в xlsx нет ссылки на товар (поиск/пусто)'; report.push(rec); log(`NF ${id} «${name.slice(0, 40)}» — ${rec.reason}`); continue }

    let html
    try { html = await H.fetchHtml(url, { vpsFallback: true }) } catch (e) { rec.reason = 'страница не открылась: ' + e.message; report.push(rec); log(`NF ${id} — ${rec.reason}`); continue }
    const offers = parseOffersFull(html)
    if (!offers.length) { rec.reason = 'нет OFFERS на странице'; report.push(rec); log(`NF ${id} — ${rec.reason}`); continue }
    await H.sleep(300)

    // выбрать hero-оффер
    const oidWant = (url.match(/[?&]oid=(\d+)/) || [])[1] || null
    const oidShared = oidWant && oidCount[oidWant] > 1
    let hero = null, mmode = ''
    if (oidWant && !oidShared) { hero = offers.find(o => o.oid === oidWant); if (hero) mmode = 'oid' }
    if (!hero) { hero = pickByName(offers, name); if (hero) mmode = 'name' }
    if (!hero) {
      rec.reason = oidShared
        ? `вариант по имени не найден среди ${offers.length} офферов (oid ${oidWant} общий)`
        : `oid ${oidWant} не найден среди ${offers.length} офферов`
      report.push(rec); log(`NF ${id} «${name.slice(0, 40)}» — ${rec.reason}`); continue
    }
    rec.match_mode = mmode; rec.offer = hero.name

    // характеристики + размеры
    const chars = pickChars(hero.props)
    const dims = dimsFromItemSize(hero.props.item_size_tp || '')
    const heroColor = hero.color || cardColor(name)
    const volume = chars.volume_item ?? litres(name) ?? hero.litres ?? null
    const isPot = /кашпо|горшок/i.test(name) && !/ваза/i.test(name)

    // все цвета модели
    const variants = new Map()
    for (const o of offers) if (o.color && o.src && !variants.has(o.color.key)) variants.set(o.color.key, o)

    try {
      // hero KB всегда считаем (читаем картинку); заливаем/пишем — только в бою
      const { raw, draft } = await fetchProcessed(hero.src)
      rec.hero_kb = Math.round(draft.length / 1024)
      let heroDraftUrl = `(dry)${id}_draft.jpg`, heroRawUrl = `(dry)${id}_draft_raw.jpg`
      if (!DRY) {
        heroDraftUrl = await H.uploadVPS(draft, `${id}_draft.jpg`)
        heroRawUrl = await H.uploadVPS(raw, `${id}_draft_raw.jpg`)
      }
      const modSlug = model(name) || itemKind(name)
      const color_images = {}, colors = []
      for (const o of variants.values()) {
        const u = await uploadColor(modSlug, o.color, o.src)
        color_images[o.color.label] = u
        colors.push(o.color.label)
      }
      const txt = isPot
        ? buildPotText({ subcategory: sub, material: model(name) || itemKind(name), colorLabel: heroColor?.label || null, dia: dims.dia, height: dims.height, volume, variantCount: variants.size })
        : buildItemText({ name, colorLabel: heroColor?.label || null, volume, variantCount: variants.size })

      const draftFields = {
        image_draft_url: heroDraftUrl, image_draft_raw_url: heroRawUrl,
        image_status: 'draft', image_source: url,
        colors, color_images,
        short_description: txt.short_description, description: txt.description,
        // характеристики (null если поля нет)
        tnved_code: chars.tnved_code, dimensions_packed: chars.dimensions_packed,
        dimensions_unpacked: chars.dimensions_unpacked, weight_gram: chars.weight_gram,
        pack_size: chars.pack_size, volume_l: volume,
        // pot_* только для настоящих горшков/кашпо
        ...(isPot ? { pot_material: 'пластик', pot_color: heroColor?.label || null, pot_diameter: dims.dia ?? null, pot_height: dims.height ?? null } : {}),
      }
      rec.preview = { isPot, colors: colors.length, volume, dia: dims.dia ?? null, tnved: chars.tnved_code, dim_packed: chars.dimensions_packed, dim_unpacked: chars.dimensions_unpacked, weight_gram: chars.weight_gram, pack_size: chars.pack_size }

      if (DRY) {
        rec.found = true
        log(`OK(dry) ${id} [${mmode}|${isPot ? 'pot' : 'item'}] «${hero.name.slice(0, 45)}» ${rec.hero_kb}KB colors=${colors.length}`)
      } else {
        const res = await H.writeDraft(id, draftFields)
        rec.found = res.updated; rec.reason = res.error || ''
        log(`${res.updated ? 'OK ' : 'ERR'} ${id} [${mmode}|${isPot ? 'pot' : 'item'}] ${rec.hero_kb}KB colors=${colors.length}${res.error ? ' :: ' + res.error : ''}`)
      }
    } catch (e) {
      rec.reason = 'ошибка разбора/заливки: ' + String(e.message || e).slice(0, 120)
      log(`ERR ${id}: ${rec.reason}`)
    }
    report.push(rec)
  }

  // сводка
  const ok = report.filter(r => r.found)
  log(`\n=== ПРОГОН (links) ===`)
  log(`обработано(ок): ${ok.length} | not_found: ${report.length - ok.length}`)
  for (const r of report.filter(x => !x.found)) log(`  NF ${r.id} «${r.name.slice(0, 45)}» — ${r.reason}`)

  if (DRY) {
    log('\n=== ТАБЛИЦА (--dry): id | hero KB | цвета | объём/Ø | tnved | dim_packed | dim_unpacked | вес ===')
    for (const r of ok) {
      const v = r.preview
      log([r.id, (r.hero_kb ?? '-') + 'KB', v.colors + 'цв', `${v.volume ?? '-'}л/Ø${v.dia ?? '-'}`, v.tnved ?? '-', v.dim_packed ?? '-', v.dim_unpacked ?? '-', (v.weight_gram ?? '-') + 'г'].join(' | '))
    }
    log('\n(--dry: заливка и запись пропущены)')
  } else {
    const rb = await H.readBack(q => q.in('id', LINK_IDS))
    const withTnved = (await H.sb.from('products').select('id,tnved_code').in('id', LINK_IDS)).data?.filter(r => r.tnved_code).length || 0
    log(`\n=== READ-BACK (links, ${LINK_IDS.length} id) ===`)
    log(`обработано(draft): ${rb.found} | with_image_url(=0?): ${rb.with_image_url} | with_color_images: ${rb.with_color_images} | с tnved: ${withTnved}`)
    log('примеры (3):', JSON.stringify(rb.examples, null, 1))
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ОБЩИЙ КОММИТ МАТЧА (используется links- и auto-режимами)
// ══════════════════════════════════════════════════════════════════════════════
async function commitMatch({ id, name, sub, sourceUrl, hero, offers }) {
  const chars = pickChars(hero.props || {})
  const dims = dimsFromItemSize(hero.props?.item_size_tp || '')
  const heroColor = hero.color || cardColor(name)
  const volume = chars.volume_item ?? litres(name) ?? hero.litres ?? null
  const isPot = /кашпо|горшок|вазон/i.test(name) && !/ваза\b/i.test(name)
  const variants = new Map()
  for (const o of offers) if (o.color && o.src && !variants.has(o.color.key)) variants.set(o.color.key, o)

  const { raw, draft } = await fetchProcessed(hero.src)
  const hero_kb = Math.round(draft.length / 1024)
  let heroDraftUrl = `(dry)${id}_draft.jpg`, heroRawUrl = `(dry)${id}_draft_raw.jpg`
  if (!DRY) {
    heroDraftUrl = await H.uploadVPS(draft, `${id}_draft.jpg`)
    heroRawUrl = await H.uploadVPS(raw, `${id}_draft_raw.jpg`)
  }
  const modSlug = model(name) || itemKind(name)
  const color_images = {}, colors = []
  for (const o of variants.values()) {
    const u = await uploadColor(modSlug, o.color, o.src)
    color_images[o.color.label] = u
    colors.push(o.color.label)
  }
  const txt = isPot
    ? buildPotText({ subcategory: sub, material: model(name) || itemKind(name), colorLabel: heroColor?.label || null, dia: dims.dia, height: dims.height, volume, variantCount: variants.size })
    : buildItemText({ name, colorLabel: heroColor?.label || null, volume, variantCount: variants.size })

  const draftFields = {
    image_draft_url: heroDraftUrl, image_draft_raw_url: heroRawUrl,
    image_status: 'draft', image_source: sourceUrl,
    colors, color_images, short_description: txt.short_description, description: txt.description,
    tnved_code: chars.tnved_code, dimensions_packed: chars.dimensions_packed,
    dimensions_unpacked: chars.dimensions_unpacked, weight_gram: chars.weight_gram,
    pack_size: chars.pack_size, volume_l: volume,
    ...(isPot ? { pot_material: 'пластик', pot_color: heroColor?.label || null, pot_diameter: dims.dia ?? null, pot_height: dims.height ?? null } : {}),
  }
  const preview = { isPot, colors: colors.length, volume, dia: dims.dia ?? null, tnved: chars.tnved_code, dim_packed: chars.dimensions_packed, dim_unpacked: chars.dimensions_unpacked, weight_gram: chars.weight_gram, pack_size: chars.pack_size, hero_kb }
  if (DRY) return { ok: true, hero_kb, preview }
  const res = await H.writeDraft(id, draftFields)
  return { ok: res.updated, error: res.error, hero_kb, preview }
}

// ══════════════════════════════════════════════════════════════════════════════
// РЕЖИМ 3 — АВТО-КАТАЛОГ (полный краул + строгий матч модель+цвет+литраж)
// ══════════════════════════════════════════════════════════════════════════════
// сигнатура имени: значимые токены (тип+модель), цвета/размеры/декор-слова выброшены,
// горшок/кашпо/вазон → единый класс 'pot' (в БД названия плавают: «Горшок-Кашпо» vs «Кашпо»).
const STOP2 = new Set(['цв', 'цветочный', 'для', 'д', 'с', 'на', 'под', 'со', 'из', 'в', 'и',
  'уп', 'шт', 'мм', 'см', 'л', 'мл', 'ур', 'кг', 'г', 'россия', 'российская', 'сорт', 'рф',
  'системой', 'система', 'системы', 'дренажной', 'дренажная', 'дренаж', 'дренажем',
  'автополивом', 'автополив', 'двойной', 'двойная', 'подвесное', 'подвесной', 'подвесом', 'подвес',
  'трос', 'тросе', 'вставкой', 'вставка', 'поддоном', 'поддон', 'высокой', 'ножке', 'ножках',
  'овальный', 'овальная', 'оваль', 'настенное', 'настенный', 'прикорневой', 'полив',
  'квадратное', 'квадратный', 'круглое', 'круглый', 'набор', 'перепад', 'детская', 'детский',
  'жидкости', 'пэт', 'жесткая', 'мягкая', 'черенком', 'местный', 'местная', 'угловой', 'без', 'подушки'])
function sigTokens(name) {
  const s = String(name).toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)/g, ' ').replace(/[«»"]/g, ' ')
  const out = new Set()
  for (let t of s.split(/[^a-zа-я]+/)) {
    if (!t || t.length < 2 || STOP2.has(t)) continue
    // выбросить как цвет ТОЛЬКО при совпадении префикса с канон-меткой
    // (иначе модель «Розалия» съест /роз/ → розовый; «роз»=розовый — съест, «розалия» — нет)
    const c = colorCanon(t)
    if (c) { const base = c.label.replace(/^(светло-|тёмно-|прозрачно-)/, ''); const n = Math.min(4, t.length, base.length); if (t.slice(0, n) === base.slice(0, n)) continue }
    if (/^(горшок|кашпо|вазон)$/.test(t)) t = 'pot'
    out.add(t)
  }
  return out
}
const sigEq = (a, b) => a.size === b.size && [...a].every(t => b.has(t))

const AUTO_PARENTS = ['/catalog/dom/', '/catalog/sad/', '/catalog/mebel/', '/catalog/ekonom/', '/catalog/kuhnya/', '/catalog/otdykh/']
const CVETY_SUBS = SUBS.map(s => `/catalog/dom/cvety/${s}/`)
async function discoverSections() {
  let html = ''
  try { html = await H.fetchHtml(HOST + '/catalog/', { vpsFallback: true }) } catch {}
  const secs = [...new Set([...html.matchAll(/href="(\/catalog\/[a-zа-я0-9_\-\/]+\/)"/gi)].map(m => m[1]))].filter(u => !/\/product\//.test(u))
  const rel = secs.filter(u => AUTO_PARENTS.some(p => u.startsWith(p)) && u.split('/').filter(Boolean).length >= 3)
  return [...new Set([...rel, ...CVETY_SUBS])]
}
async function crawlSections(sections) {
  const all = new Map()
  for (const sec of sections) {
    let page = 1, maxp = 1
    do {
      const url = `${HOST}${sec}${page > 1 ? `?PAGEN_1=${page}` : ''}`
      let html
      try { html = await H.fetchHtml(url, { vpsFallback: true }) } catch { break }
      if (page === 1) { const pg = (html.match(/PAGEN_1=(\d+)/g) || []).map(x => +x.split('=')[1]); maxp = pg.length ? Math.max(...pg) : 1 }
      for (const it of parseListing(html)) if (!all.has(it.url)) all.set(it.url, it)
      page++
      await H.sleep(250)
    } while (page <= maxp && page <= 25)
  }
  return [...all.values()]
}

async function runAutoMode() {
  log('[auto] discovery секций каталога…')
  const sections = await discoverSections()
  log(`секций к краулу: ${sections.length}`)
  log('[auto] краул листингов (PAGEN_1)…')
  const prodIndex = await crawlSections(sections)
  log(`товаров в индексе: ${prodIndex.length}`)

  const { data: ours } = await H.sb.from('products').select('id,name,subcategory,category').eq('supplier', 'Альтернатива').order('id')
  log(`наших товаров (supplier=Альтернатива): ${ours.length}`)

  // сбор OFFERS со ВСЕХ товаров каталога → глобальный пул (модель/цвет/литраж/src/props в офферах,
  // т.к. заголовок листинга часто generic — «Горшок для цветов», а вариант только в OFFERS).
  log('[auto] сбор OFFERS со всех товаров…')
  const pool = []
  let done = 0
  for (const pr of prodIndex) {
    let html
    try { html = await H.fetchHtml(HOST + pr.url, { vpsFallback: true }) } catch { done++; continue }
    const pageSig = sigTokens(pr.title)
    for (const o of parseOffersFull(html)) if (o.src) pool.push({ ...o, url: pr.url, nameSig: sigTokens(o.name), pageSig })
    if (++done % 50 === 0) log(`  offers ${done}/${prodIndex.length} (пул ${pool.length})`)
    await H.sleep(200)
  }
  log(`пул офферов: ${pool.length}`)

  log('[auto] строгий матч модель+цвет+литраж…')
  const report = []
  for (const p of ours) {
    const ourSig = sigTokens(p.name), cc = cardColor(p.name), cl = litres(p.name)
    const rec = { id: p.id, name: p.name, found: false, reason: '', mode: '' }
    if (!ourSig.size) { rec.reason = 'пустая сигнатура имени'; report.push(rec); continue }
    if ([...ourSig].every(t => t === 'pot')) { rec.reason = 'слишком общая сигнатура (нет модели)'; report.push(rec); continue }

    // строгий гейт: цвет (если есть) + литраж (если есть) + модель ⊆ (оффер ∪ заголовок)
    const m = pool.filter(o =>
      (cc ? (o.color && o.color.key === cc.key) : true) &&
      (cl != null ? o.litres === cl : true) &&
      [...ourSig].every(t => o.nameSig.has(t) || o.pageSig.has(t)))
    if (!m.length) { rec.reason = cc ? 'нет оффера модель+цвет+литраж' : 'нет оффера модель+литраж'; report.push(rec); continue }

    const exact = m.find(o => sigEq(ourSig, o.nameSig))
    const hero = exact || m[0]
    const mode = exact ? 'exact' : 'loose'
    const heroOffers = pool.filter(o => o.url === hero.url)
    rec.mode = mode; rec.url = HOST + hero.url; rec.offer = hero.name

    try {
      const r = await commitMatch({ id: p.id, name: p.name, sub: p.subcategory, sourceUrl: HOST + hero.url, hero, offers: heroOffers })
      rec.found = r.ok; rec.reason = r.error || ''; rec.hero_kb = r.hero_kb; rec.preview = r.preview
      log(`${r.ok ? 'OK ' : 'ERR'} ${p.id} [${mode}|${r.preview.isPot ? 'pot' : 'item'}] ${r.hero_kb}KB cv=${r.preview.colors} «${hero.name.slice(0, 42)}»${r.error ? ' :: ' + r.error : ''}`)
    } catch (e) {
      rec.reason = 'ошибка заливки: ' + String(e.message || e).slice(0, 120)
      log(`ERR ${p.id}: ${rec.reason}`)
    }
    report.push(rec)
  }

  const ok = report.filter(r => r.found)
  log(`\n=== ПРОГОН (auto) ===`)
  log(`наших: ${ours.length} | сматчено: ${ok.length} | not_found: ${report.length - ok.length}`)
  log(`режим матча: exact=${ok.filter(r => r.mode === 'exact').length} loose=${ok.filter(r => r.mode === 'loose').length}`)

  if (DRY) {
    log('\n5 примеров матча:')
    for (const r of ok.slice(0, 5)) log(`  ${r.id} [${r.mode}] ${r.hero_kb}KB cv=${r.preview.colors} «${r.name.slice(0, 40)}» → ${r.url}`)
    log('\n(--dry: заливка и запись пропущены)')
  } else {
    const ids = ok.map(r => r.id)
    const rb = await H.readBack(q => q.in('id', ids.length ? ids : [-1]))
    const withTnved = ids.length ? ((await H.sb.from('products').select('id,tnved_code').in('id', ids)).data?.filter(r => r.tnved_code).length || 0) : 0
    log(`\n=== READ-BACK (auto) ===`)
    log(`сматчено(draft): ${rb.found} | with_image_url(=0?): ${rb.with_image_url} | with_color_images: ${rb.with_color_images} | с tnved: ${withTnved}`)
    log('примеры (3):', JSON.stringify(rb.examples, null, 1))
  }
  const nf = report.filter(r => !r.found)
  log(`\nnot_found (${nf.length}):`)
  for (const r of nf) log(`  ${r.id} «${r.name.slice(0, 50)}» — ${r.reason}`)
}

// ── dispatch ──
if (AUTO) await runAutoMode()
else if (LINKS) await runLinksMode()
else await runWorklistMode()
