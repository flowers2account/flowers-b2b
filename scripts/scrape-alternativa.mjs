// scripts/scrape-alternativa.mjs — добор фото/характеристик «Альтернатива» (горшки/кашпо).
// Запуск:  node --env-file=.env.local scripts/scrape-alternativa.mjs [--dry]
//
// ПОВЕРХ ХАРНЕСА: вся инфраструктура (worklist, fetch, processImg, uploadVPS,
// writeDraft с аллоулистом, readBack, транслит, CONTRACT) — в scrape-harness.mjs.
// Здесь ТОЛЬКО три секции: КРАУЛ alternat.ru, МАТЧ (модель+цвет строго), РАЗБОР страницы.
//
// Это повторный проход по тем карточкам, что в прошлый раз не нашлись: матч строго по
// МОДЕЛИ + ЦВЕТУ. Иной/отсутствующий цвет → not_found, чужой цвет НЕ подставляем
// (жёсткий цвет-гейт). Чего нет на сайте — добор письмом/звонком +7 347 673-22-44.

import * as H from './scrape-harness.mjs'

const DRY = process.argv.includes('--dry')
const HOST = 'https://www.alternat.ru'
const log = (...a) => console.log(...a)

// ── worklist: горшки/кашпо «Альтернатива» без фото (фикс-условия внутри харнеса) ──
const work = await H.worklist(q => q.eq('supplier', 'Альтернатива').in('subcategory', ['pots', 'kashpo']))
log(`worklist (Альтернатива pots/kashpo без фото): ${work.length}`)

// ──────────────────────────────────────────────────────────────────────────────
// СЕКЦИЯ 1. КРАУЛ alternat.ru → индекс товаров {модель+цвет → URL/фото}
// ──────────────────────────────────────────────────────────────────────────────
const CAT_BASE = `${HOST}/catalog/dom/cvety`
// ⚠ slug «gorshok-dlya-сvetov» — с КИРИЛЛИЧЕСКОЙ «с» (так на сайте; латинская c → 404/0).
// Состав и написание сверены с рабочим пилотом tmp-alt-index.mjs (давал 59 товаров).
const SUBS = ['vazon', 'vaza', 'kashpo', 'podves', 'gorshok-dlya-сvetov', 'yashchik-dlya-сvetov']

// листинг каталога: <div class="desc_name"><a href="/catalog/product/..."><span>TITLE</span></a>
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
// СЕКЦИЯ 2. МАТЧ — нормализация модели, цвета, литража; разбор OFFERS со страницы
// ──────────────────────────────────────────────────────────────────────────────

// модель: сначала из кавычек («Лея»/"Сканди"), иначе — из «голого» имени.
// Голые имена alternat: «Кашпо на перила …», «Горшок цв. д/орхидеи …», «ГОРШОК Терра …».
// Срезаем размер/литраж/скобку, «д/» → пробел, отбрасываем тип/служебные токены.
// ⚠ НЕ опираемся на \b (в JS он не работает с кириллицей) и НЕ режем по «х» (есть в «орхидеи»).
const STOP = new Set(['кашпо', 'горшок', 'цветочный', 'ваза', 'вазон', 'поддон',
  'цв', 'для', 'д', 'с', 'на', 'под', 'срезку', 'уп', 'шт', 'мм', 'см', 'л', 'мл', 'ур'])
function model(n) {
  const q = String(n).match(/"([^"]+)"|«([^»]+)»/)
  if (q) return (q[1] || q[2]).trim().toLowerCase()
  const s = String(n).toLowerCase().replace(/ё/g, 'е')
    .split(/[(\d*×]/)[0]                       // отрезать с первого размера/литража/скобки
    .replace(/[\/.]/g, ' ')                    // «д/орхидеи», «цв.» → токены
  const toks = s.split(/[^a-zа-я]+/).filter(w => w && !STOP.has(w))
  return toks.join(' ') || null
}
// «голову» модели (для матча со страницами индекса) берём как самый длинный значимый токен
const modelHead = mod => (String(mod).split(/\s+/).filter(w => w.length > 2).sort((a, b) => b.length - a.length)[0] || mod)

// литраж: «1,4л» / «2 л» (не «литая», не часть слова)
const litres = s => { const m = String(s).match(/(\d+[.,]?\d*)\s*л(?![а-яёa-z])/i); return m ? +m[1].replace(',', '.') : null }

// размеры из ОДНОГО оффера (его собственный объём) — НЕ переносим между объёмами
const diaFrom = s => { const m = String(s).match(/(?:⌀|ø|d|диам[а-я]*\.?)\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:см|cm)?/i); return m ? +m[1].replace(',', '.') : null }
const heightFrom = s => { const m = String(s).match(/(?:\bh\b|выс[а-я]*\.?)\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:см|cm)?/i); return m ? +m[1].replace(',', '.') : null }

// фичи в скобках, которые НЕ являются цветом
const FEAT = /автополив|дренаж|с\s*под|подвес|двойн|на\s*высок|трос|уп\.|систем|вставк|квадрат|оваль|настен|шт|^м?\d+$|прикорнев|полив|^\//i
const parenColor = name => {
  const ps = [...String(name).matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim()).filter(x => !FEAT.test(x))
  return ps.length ? ps[ps.length - 1] : ''
}

// канонизация цвета: { key (для матча), label (по-русски, для color_images/colors[]) } | null
const COLOR_BASE = [
  [/серебр/, 'серебряный'], [/антрац/, 'антрацит'], [/графит|^граф/, 'графит'],
  [/коричн|^корич|^кор\b|^кор$/, 'коричневый'], [/бежев|^беж/, 'бежевый'],
  [/^бел/, 'белый'], [/^чер/, 'черный'], [/^сер/, 'серый'], [/медн|^мед/, 'медный'],
  [/прозрач|^прозр/, 'прозрачный'], [/оливк|^олив/, 'оливковый'], [/какао/, 'какао'],
  [/зелен|^зел/, 'зеленый'], [/^крем/, 'кремовый'], [/^золот|^зол/, 'золотой'],
  [/лаванд/, 'лавандовый'], [/терракот|терacot/, 'терракотовый'], [/^крас/, 'красный'],
  [/^син|голуб/, 'синий'], [/^желт/, 'желтый'], [/^роз/, 'розовый'], [/мрамор/, 'мраморный'],
]
// тонированный прозрачный («прозрачно-фиолетовый», «зел.прозрач.») — ОТДЕЛЬНЫЙ цвет,
// НЕ равен чистому «прозрачный» (иначе подставим чистое фото на тонированный товар).
const TINT = [[/фиолет|сирен/, 'фиолетовый'], [/зелен|зел/, 'зеленый'], [/син|голуб/, 'синий'],
  [/желт/, 'желтый'], [/роз/, 'розовый'], [/дым/, 'дымчатый'], [/янтар/, 'янтарный']]
function colorCanon(text) {
  if (text == null) return null
  const x = String(text).toLowerCase().replace(/ё/g, 'е').replace(/[.()«»"]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!x) return null
  if (/прозрач/.test(x)) {
    // убрать сам токен «прозрач…», чтобы «проз» не ловилось как /роз/ → розовый
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
// цвет нашей карточки: сначала из скобок, иначе по-словно (colorCanon с ^-якорями
// надёжно работает только на отдельном токене, а не на целом предложении).
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

// разобрать OFFERS на странице товара → [{name, litres, color{key,label}, src(full), dia, height}]
function parseOffers(html) {
  const i = html.indexOf("OFFERS':[")
  if (i < 0) return []
  const st = i + 8
  let d = 0, end = st
  for (let k = st; k < html.length; k++) { const c = html[k]; if (c === '[') d++; else if (c === ']') { d--; if (!d) { end = k + 1; break } } }
  const arr = html.slice(st, end)
  const blocks = []
  let s = -1, b = 0
  for (let k = 0; k < arr.length; k++) { const c = arr[k]; if (c === '{') { if (!b) s = k; b++ } else if (c === '}') { b--; if (!b) blocks.push(arr.slice(s, k + 1)) } }
  const out = []
  for (const o of blocks) {
    const name = ((o.match(/'NAME':'([^']*)'/) || [])[1] || '').replace(/\\"/g, '"').trim()
    if (!name) continue
    // полноразмер: приоритет DETAIL_PICTURE, иначе любой SRC
    let src = null
    const dp = o.indexOf("'DETAIL_PICTURE'")
    if (dp >= 0) { const m = o.slice(dp, dp + 400).match(/'SRC':'([^']+\.(?:jpg|jpeg|png|webp))'/i); if (m) src = m[1] }
    if (!src) { const m = o.match(/'SRC':'([^']+\.(?:jpg|jpeg|png|webp))'/i); if (m) src = m[1] }
    out.push({ name, litres: litres(name), color: colorCanon(parenColor(name)), src, dia: diaFrom(name), height: heightFrom(name) })
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────────
// СЕКЦИЯ 3. РАЗБОР СТРАНИЦЫ — текст (формат CONTRACT) из снятых атрибутов
// ──────────────────────────────────────────────────────────────────────────────
const KIND = sub => (sub === 'kashpo' ? 'Кашпо' : 'Горшок')
const MAT_ADJ = sub => (sub === 'kashpo' ? 'пластиковое' : 'пластиковый') // у «Альтернативы» — пластик

function buildText({ subcategory, material, colorLabel, dia, height, volume, variantCount }) {
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

// скачать + обработать (фон НЕ удаляем) изображение по src оффера
async function fetchProcessed(src) {
  const url = src.startsWith('http') ? src : HOST + src
  const buf = await H.fetchImg(url, { vpsFallback: true })
  if (!/^(ffd8|89504e47)/.test(buf.subarray(0, 4).toString('hex'))) throw new Error('не изображение')
  return { url, raw: buf, draft: await H.processImg(buf) }
}

// ──────────────────────────────────────────────────────────────────────────────
// ПРОГОН
// ──────────────────────────────────────────────────────────────────────────────
log('\n[1/3] краул каталога alternat.ru …')
const index = await crawlCatalog()
log(`индекс товаров: ${index.length}`)

// модели из worklist → их страницы на alternat (по первому слову модели)
const models = [...new Set(work.map(p => model(p.name)).filter(Boolean))]
const pagesByModel = {}
for (const mod of models) {
  const head = modelHead(mod).replace(/[^а-яёa-z0-9]/gi, '')
  if (!head) { pagesByModel[mod] = []; continue }
  pagesByModel[mod] = index.filter(x => new RegExp(head, 'i').test(x.title.replace(/ё/gi, 'е')))
}

// офферы по страницам (кэш) + офферы по модели
log('\n[2/3] разбор страниц товаров (OFFERS) …')
const offersByUrl = {}
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

// кэш заливки цвет-вариаций (один файл на модель+цвет — переиспользуем между карточками)
const uploadCache = new Map()
async function uploadColor(mod, color, src) {
  const name = `alt-${H.tr(mod)}-${H.tr(color.label)}.jpg`   // транслит: VPS-имя только [\w.\-]
  if (uploadCache.has(name)) return uploadCache.get(name)
  if (DRY) { const u = `(dry)${name}`; uploadCache.set(name, u); return u }
  const { draft } = await fetchProcessed(src)
  const u = await H.uploadVPS(draft, name)
  uploadCache.set(name, u)
  return u
}

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

  // ЖЁСТКИЙ ЦВЕТ-ГЕЙТ: только офферы строго нашего цвета
  const sameColor = offers.filter(o => o.color && o.color.key === wantColor.key)
  if (!sameColor.length) { rec.reason = `цвет «${wantColor.label}» отсутствует на сайте (добор: +7 347 673-22-44)`; report.push(rec); log(`NF ${p.id} ${mod} «${wantColor.label}» — ${rec.reason}`); continue }

  // hero: точный литраж приоритетнее; объём/размеры — из ВЫБРАННОГО оффера (без переноса)
  const exact = sameColor.find(o => wantL != null && o.litres === wantL)
  const hero = exact || sameColor[0]
  rec.exact_litres = !!exact
  rec.url = HOST + hero.url

  // цвет-вариации модели → color_images + colors[] (по одному фото на цвет)
  const variants = new Map() // key → { color, src }
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

    const { short_description, description } = buildText({
      subcategory: p.subcategory, material: mod, colorLabel: wantColor.label,
      dia: hero.dia, height: hero.height, volume: hero.litres, variantCount: variants.size,
    })

    const draftFields = {
      image_draft_url: heroDraftUrl,
      image_draft_raw_url: heroRawUrl,
      image_status: 'draft',                       // изготовитель — на модерацию
      image_source: HOST + hero.url,
      pot_material: 'пластик',
      pot_color: wantColor.label,
      pot_diameter: hero.dia ?? null,
      pot_height: hero.height ?? null,
      volume_l: hero.litres ?? null,
      colors,
      color_images,
      short_description,
      description,
    }

    if (DRY) {
      rec.found = true; rec.preview = draftFields
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

// ── промежуточная сводка прогона ──────────────────────────────────────────────
const ok = report.filter(r => r.found)
log(`\n=== ПРОГОН ===`)
log(`worklist: ${work.length} | found: ${ok.length} | not_found: ${report.length - ok.length}`)
const reasons = {}
for (const r of report.filter(x => !x.found)) reasons[r.reason] = (reasons[r.reason] || 0) + 1
log('причины not_found:', JSON.stringify(reasons, null, 1))

// ── READ-BACK из БД (через харнес) ────────────────────────────────────────────
if (!DRY) {
  const rb = await H.readBack(q => q.eq('supplier', 'Альтернатива').in('subcategory', ['pots', 'kashpo']))
  log(`\n=== READ-BACK (Альтернатива pots/kashpo) ===`)
  log(`count: ${rb.count} | found(draft): ${rb.found} | not_found: ${rb.not_found.length}`)
  log(`with_image_url (должно быть 0): ${rb.with_image_url}`)
  log(`with_color_images: ${rb.with_color_images}`)
  log('not_found (причины):')
  for (const nf of rb.not_found.slice(0, 30)) log(`  ${nf.id} ${nf.name} — ${nf.reason}`)
  log('примеры (3):', JSON.stringify(rb.examples, null, 1))
} else {
  log('\n=== ТАБЛИЦА FOUND (--dry, до записи) ===')
  log('id\tцвет\tвол.\tимя 1С  ||  URL alternat')
  for (const r of ok) {
    log(`${r.id}\t${r.color}\t${r.litres ?? '-'}\t${r.name}  ||  ${r.url}`)
  }
  log('\n(--dry: запись и read-back пропущены)')
}
