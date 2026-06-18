// scripts/scrape-neman.mjs — обогащение карточек стеклянных ваз «Неман» ПОВЕРХ харнеса.
// Запуск:  node --env-file=.env.local scripts/scrape-neman.mjs
//          DRY=1 node --env-file=.env.local scripts/scrape-neman.mjs   (без VPS/записи — проверка матча)
//
// Источник: shop.neman.by, раздел «Вазы и изделия для флористики» (1C-Bitrix).
// Контракт обогащения — H.CONTRACT (фото + характеристики ТОЛЬКО в черновики). Здесь —
// лишь специфика Немана: КРАУЛ раздела, МАТЧ по номеру модели, РАЗБОР карточки.
//
// Границы (из CONTRACT, не дублирую формулировки):
//  • Пишем только H.writeDraft (жёсткий аллоулист). image_url/is_active/qty/price не трогаем.
//  • Это НЕ горшок → pot_* не заполняем. Размеры вазы идут в текст; volume_l — если есть число.
//  • Фон не удаляем (H.processImg).

import * as H from './scrape-harness.mjs'

const ORIGIN = 'https://shop.neman.by'
const DRY = process.env.DRY === '1'
const FETCH = { vpsFallback: true } // локальный fetch, при блокировке — curl через VPS (только чтение)

// SCOPE — реальный набор ваз Немана в базе: category='accessories', subcategory IS NULL,
// имя — стеклянная посуда (ваза/аквариум/подсвечник). НЕ subcategory='vases' (там другой,
// старый набор). Один и тот же колбэк идёт и в worklist, и в readBack — единый scope.
const SCOPE = q => q.eq('category', 'accessories').is('subcategory', null)
  .or('name.ilike.%ваз%,name.ilike.%аквариум%,name.ilike.%подсвечник%')

// ── утилиты разбора HTML (без браузера: харнес даёт только fetchHtml/fetchImg) ──
const stripTags = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
  .replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
const numFrom = s => { const m = String(s ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null }
const abs = href => { try { return new URL(href, ORIGIN).href } catch { return null } }

// Bitrix resize_cache → оригинал: /upload/resize_cache/iblock/abc/.../file.jpg → /upload/iblock/abc/file.jpg
function toOriginal(src) {
  const m = src.match(/\/upload\/resize_cache\/iblock\/([0-9a-f]{3})\/(?:([0-9a-f]{32})\/)?[^/]+\/([^/?#]+)$/i)
  if (!m) return src
  return `${ORIGIN}/upload/iblock/${m[1]}/${m[2] ? m[2] + '/' : ''}${m[3]}`
}

// ── НОМЕР МОДЕЛИ ────────────────────────────────────────────────────────────────
// Номер модели (= код 1С) в наших именах стоит где угодно: в начале («5578 Ваза…»),
// в конце («…хол.отр. 7095»), в скобках («…рис.9049 (7017)») или с № («Трубка №1769»).
// Перед извлечением выбиваем «обманки»: пачку 100/1, рисунок рис.9049, объём/размер с
// единицей (10,0 л), диаметр/высоту д.180 / в.300, метки H68 D25.
function cleanForModels(name) {
  return String(name ?? '')
    .replace(/\d+\s*\/\s*\d+/g, ' ')                          // пачка 100/1, 200/1
    .replace(/рис\.?\s*\d+(?:\s*\/\s*\d+)?/gi, ' ')           // рисунок рис.9049 / рис.9049/1
    .replace(/\d+[.,]?\d*\s*(?:мл|см|мм|кг|гр|г|шт|л)(?![а-яёa-z])/gi, ' ') // объём/вес/размер (кириллица: \b не годится)
    .replace(/[дДвВ]\.?\s*\d+/g, ' ')                         // диаметр д.180 / высота в.300
    .replace(/[HhDd]\s*\d+/g, ' ')                            // H68 D25
}
function ourModels(name) {
  return [...new Set([...cleanForModels(name).matchAll(/\b(\d{4,5})\b/g)].map(m => m[1]))]
}
// Номер модели из текста/слага карточки Немана — те же обманки выбиваем для симметрии.
function modelsFrom(text) {
  return [...new Set([...cleanForModels(text).matchAll(/\b(\d{4,5})\b/g)].map(m => m[1]))]
}

// ── CRAWL: индекс {номер модели → URL карточки} ────────────────────────────────
// 1) находим URL раздела «Вазы … флористики» (слаг заранее не зашит — ищем по тексту ссылки);
// 2) пагинируем (?PAGEN_1=N), собираем ссылки на карточки + их подписи;
// 3) из подписи/слага вытягиваем номер модели.
const SECTION_RE = /ваз\w*[^<|]{0,40}флористик/i
const SECTION_GUESSES = [
  '/catalog/vazy_i_izdeliya_dlya_floristiki/',
  '/catalog/vazy-i-izdeliya-dlya-floristiki/',
  '/catalog/floristika/',
]

async function findSectionPath() {
  for (const entry of ['/catalog/', '/']) {
    let html
    try { html = await H.fetchHtml(ORIGIN + entry, FETCH) } catch { continue }
    for (const m of html.matchAll(/<a\b[^>]*href="([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      if (SECTION_RE.test(stripTags(m[2])) && /\/catalog\//.test(m[1])) {
        return new URL(m[1], ORIGIN).pathname
      }
    }
  }
  return SECTION_GUESSES[0] // последний шанс — известный слаг (логируем при крауле)
}

async function buildIndex() {
  const sectionPath = await findSectionPath()
  console.log(`раздел: ${ORIGIN}${sectionPath}`)
  const isProductHref = href => {
    const p = (abs(href) ? new URL(abs(href)).pathname : '')
    // карточка = глубже раздела хотя бы на один сегмент и оканчивается '/'
    return p.startsWith(sectionPath) && p.length > sectionPath.length && p.endsWith('/')
  }
  const labelByUrl = new Map() // url → накопленная подпись (текст ссылок + слаг)
  let firstPageSig = null
  for (let pg = 1; pg <= 40; pg++) {
    const url = `${ORIGIN}${sectionPath}${pg > 1 ? `?PAGEN_1=${pg}` : ''}`
    let html
    try { html = await H.fetchHtml(url, FETCH) } catch (e) { console.log(`стр.${pg}: ошибка ${String(e).slice(0, 80)}`); break }
    const sig = html.length // грубая защита от «зацикленной» последней страницы
    if (pg > 1 && sig === firstPageSig) break
    if (pg === 1) firstPageSig = sig
    let onPage = 0
    for (const m of html.matchAll(/<a\b[^>]*href="([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      if (!isProductHref(m[1])) continue
      const url = abs(m[1]).split(/[?#]/)[0]
      const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || ''
      const prev = labelByUrl.get(url) || ''
      labelByUrl.set(url, `${prev} ${stripTags(m[2])} ${slug}`.trim())
      onPage++
    }
    console.log(`стр.${pg}: карточек на странице ${onPage}, всего url ${labelByUrl.size}`)
    if (onPage === 0) break
    await H.sleep(400)
  }
  // карта номер → url (первый встреченный)
  const index = new Map()
  for (const [url, label] of labelByUrl) {
    for (const n of modelsFrom(label)) if (!index.has(n)) index.set(n, url)
  }
  console.log(`индекс: ${index.size} номеров из ${labelByUrl.size} карточек`)
  return index
}

// ── РАЗБОР КАРТОЧКИ ─────────────────────────────────────────────────────────────
// hero (макс. разрешение), характеристики в текст, цветное стекло → color_images.
function specValue(flat, labelRe) {
  // flat — текст карточки с разделителями '|'; ищем «Метка | значение»
  const m = flat.match(new RegExp(`(?:${labelRe})\\s*[|:]+\\s*([^|]{1,60})`, 'i'))
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

function vaseType(text) {
  const t = String(text).toLowerCase()
  if (/подсвечник/.test(t)) return 'ваза-подсвечник'
  if (/аквариум/.test(t)) return 'аквариум'
  if (/шар/.test(t)) return 'ваза-шар'
  if (/бокал/.test(t)) return 'ваза-бокал'
  if (/цилиндр/.test(t)) return 'ваза-цилиндр'
  if (/конус/.test(t)) return 'ваза-конус'
  if (/трубк/.test(t)) return 'ваза-трубка'
  if (/кашпо/.test(t)) return 'кашпо'
  if (/ваз/.test(t)) return 'ваза'
  return 'изделие'
}

// parseOurName — характеристики из НАШЕГО имени 1С (источник авторитетнее, чем неизвестная
// разметка Немана; страница Немана нужна прежде всего ради ФОТО). Диаметр/высота — в мм
// (как пишет 1С: «д. 180»), объём — в литрах. Отделка и обработка стекла — словарём.
function parseOurName(name) {
  const t = String(name ?? '')
  const dM = t.match(/д\.?\s*(\d{2,4})/i)
  const hM = t.match(/в\.?\s*(\d{2,4})/i)
  const vM = t.match(/(\d+[.,]?\d*)\s*л(?![а-яёa-z])/i) // «10,0 л» (\b не работает после кириллицы)
  const finish = []
  if (/гладь|гладк/i.test(t)) finish.push('гладкое стекло')
  if (/рифл/i.test(t)) finish.push('рифлёное стекло')
  if (/кракле/i.test(t)) finish.push('кракле')
  if (/кос\.?\s*ср/i.test(t)) finish.push('косая срезка')
  if (/кристальн|дыхание огня/i.test(t)) finish.push('декор «Кристальная линия»')
  let treat = null
  if (/хол\w*\.?\s*отр/i.test(t)) treat = 'холодный отрезок'
  else if (/гор\w*\.?\s*отр/i.test(t)) treat = 'горячая отрезка'
  return {
    type: vaseType(t),
    diameter_mm: dM ? Number(dM[1]) : null,
    height_mm: hM ? Number(hM[1]) : null,
    volume_l: vM ? Number(vM[1].replace(',', '.')) : null,
    finish, treat,
  }
}

// извлечение крупных фото iblock со страницы (оригиналы, без thumbnail)
function heroCandidates(html) {
  const urls = new Set()
  for (const m of html.matchAll(/(?:src|data-src|href|data-big|data-zoom-image)="([^"]*\/upload\/[^"]+\.(?:jpe?g|png))"/gi)) {
    if (!/\/upload\/iblock\//i.test(m[1])) continue
    if (/\/(?:80|100|120|150)_/.test(m[1])) continue // явные мелкие thumbnail
    urls.add(toOriginal(abs(m[1])))
  }
  return [...urls]
}

// цветовые вариации (Bitrix SKU): swatch-блоки с подписью цвета + картинкой
function colorVariants(html) {
  const out = [] // { color, imgUrl }
  // вариант 1: элементы со title="...цвет..." и data-картинкой
  for (const m of html.matchAll(/<[^>]*\b(?:title|data-name|alt)="([^"]{2,40})"[^>]*\bdata-(?:src|big|image|slide)="([^"]+\.(?:jpe?g|png))"/gi)) {
    const color = m[1].replace(/^цвет[:\s]*/i, '').trim()
    if (/\/upload\/iblock\//i.test(m[2])) out.push({ color, imgUrl: toOriginal(abs(m[2])) })
  }
  // dedupe по цвету
  const seen = new Set()
  return out.filter(v => { const k = v.color.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
}

// merged: { model, type, diameter_mm, height_mm, volume_l, glass[], color }
function composeText(m) {
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
  const sizes = []
  if (m.diameter_mm != null) sizes.push(`Ø${m.diameter_mm} мм`)
  if (m.height_mm != null) sizes.push(`высота ${m.height_mm} мм`)
  if (m.volume_l != null) sizes.push(`${m.volume_l} л`)
  const glass = (m.glass || []).filter(Boolean)
  const head = `${cap(m.type)} «Неман» №${m.model}`
  const short = [cap(m.type) + ` №${m.model}`, ...sizes, ...glass].filter(Boolean).join(', ')
  const sent = [`${head} — изделие из стекла белорусского завода «Неман».`]
  if (sizes.length) sent.push(`Размеры: ${sizes.join(', ')}.`)
  if (glass.length) sent.push(`Стекло: ${glass.join(', ')}.`)
  if (m.color) sent.push(`Цвет: ${m.color}.`)
  return { short_description: short.slice(0, 200), description: sent.join(' ') }
}

async function parseCard(item, url) {
  const html = await H.fetchHtml(url, FETCH)
  const flat = stripTags(html.replace(/<\/(div|li|td|tr|dd|dt|span|p)>/gi, '$& | '))
  const pageText = stripTags(html).slice(0, 4000)

  // характеристики со страницы Немана — заполняют пробелы нашего имени
  const page = {
    dia: numFrom(specValue(flat, 'диаметр|ø')),
    height: numFrom(specValue(flat, 'высот')),
    volume: numFrom(specValue(flat, 'объ[её]м|вместимост')),
    glass: specValue(flat, 'обработк|декор|оформлен|техник'),
  }
  return { page, heroes: heroCandidates(html), colors: colorVariants(html) }
}

// ── ЗАГРУЗКА ФОТО + ЗАПИСЬ ЧЕРНОВИКА ───────────────────────────────────────────
async function uploadHero(id, rawUrl) {
  const raw = await H.fetchImg(rawUrl, FETCH)
  const draft = await H.processImg(raw) // фон НЕ удаляем
  if (DRY) return { draftUrl: `[dry]${id}_draft.jpg`, kb: (draft.length / 1024) | 0 }
  const draftUrl = await H.uploadVPS(draft, `${id}_draft.jpg`)
  return { draftUrl, kb: (draft.length / 1024) | 0 }
}

async function processItem(item, url, report) {
  const parsed = await parseCard(item, url)
  if (!parsed.heroes.length) {
    report.not_found.push({ id: item.id, model: item.matchedModel, reason: 'на карточке нет фото iblock' })
    console.log(`NF  ${item.id} №${item.matchedModel} (нет фото)`)
    return
  }

  // hero — первый оригинал
  const hero = await uploadHero(item.id, parsed.heroes[0])

  // цветное стекло
  let color_images = null, colors = null, singleColor = null
  if (parsed.colors.length > 1) {
    color_images = {}; colors = []
    for (const v of parsed.colors) {
      try {
        const raw = await H.fetchImg(v.imgUrl, FETCH)
        const draft = await H.processImg(raw)
        const fname = `${item.id}_${H.tr(v.color)}.jpg`
        const cu = DRY ? `[dry]${fname}` : await H.uploadVPS(draft, fname)
        color_images[v.color] = cu
        colors.push(v.color.toLowerCase())
      } catch (e) { console.log(`  цвет «${v.color}» пропущен: ${String(e).slice(0, 60)}`) }
    }
    if (!Object.keys(color_images).length) { color_images = null; colors = null }
  } else if (parsed.colors.length === 1) {
    singleColor = parsed.colors[0].color
  }

  // МЕРЖ: наше имя 1С (авторитетно) + добор со страницы Немана
  const our = parseOurName(item.name)
  const merged = {
    model: item.matchedModel,
    type: our.type,
    diameter_mm: our.diameter_mm ?? parsed.page.dia,
    height_mm: our.height_mm ?? parsed.page.height,
    volume_l: our.volume_l ?? parsed.page.volume,
    glass: [...our.finish, our.treat, parsed.page.glass].filter(Boolean),
    color: singleColor,
  }
  const txt = composeText(merged)

  const draftFields = {
    image_draft_url: hero.draftUrl,
    image_draft_raw_url: parsed.heroes[0],
    image_status: 'draft',          // изготовитель
    image_source: url,              // URL Немана
    description: txt.description,
    short_description: txt.short_description,
    ...(merged.volume_l != null ? { volume_l: merged.volume_l } : {}),
    ...(color_images ? { color_images, colors } : {}),
    // pot_* НЕ трогаем — это не горшок
  }

  if (DRY) {
    report.found.push({ id: item.id, model: item.matchedModel })
    console.log(`DRY ${item.id} №${item.matchedModel} ${merged.type} | Ø${merged.diameter_mm ?? '-'} h${merged.height_mm ?? '-'} v${merged.volume_l ?? '-'} | "${txt.short_description}" | hero ${hero.kb}KB | цветов ${parsed.colors.length}`)
    return
  }
  const res = await H.writeDraft(item.id, draftFields)
  if (res.updated) {
    report.found.push({ id: item.id, model: item.matchedModel })
    console.log(`OK  ${item.id} №${item.matchedModel} ${merged.type} | поля: ${res.fields.join(',')} | цветов ${parsed.colors.length}`)
  } else {
    report.not_found.push({ id: item.id, model: item.matchedModel, reason: `writeDraft: ${res.error || res.reason}` })
    console.log(`ERR ${item.id} №${item.matchedModel}: ${res.error || res.reason}`)
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== scrape-neman${DRY ? ' [DRY]' : ''} ===`)
  // worklist — фикс-условия (нет фото, не плейсхолдер) уже в харнесе; SCOPE сужает до ваз
  // Немана (accessories + sub=null + стекло); ключ матча — номер модели.
  const items = await H.worklist(SCOPE)
  console.log(`worklist (вазы Немана, без фото): ${items.length}`)
  if (!items.length) console.log('Пусто — проверь SCOPE/readBack.')

  const index = await buildIndex()

  const report = { found: [], not_found: [] }
  for (const item of items) {
    const models = ourModels(item.name)
    const hits = [...new Set(models.map(n => index.get(n)).filter(Boolean))]
    if (models.length === 0) {
      report.not_found.push({ id: item.id, model: null, reason: `нет номера модели в имени «${item.name}»` })
      console.log(`NF  ${item.id} (нет номера в имени)`); continue
    }
    if (hits.length === 0) {
      report.not_found.push({ id: item.id, model: models.join('/'), reason: 'номер не найден на shop.neman.by (добор письмом neman.by)' })
      console.log(`NF  ${item.id} №${models.join('/')} (нет на Немане)`); continue
    }
    if (hits.length > 1) {
      report.not_found.push({ id: item.id, model: models.join('/'), reason: `неоднозначный матч: ${hits.length} карточек — не угадываем` })
      console.log(`NF  ${item.id} №${models.join('/')} (неоднозначно)`); continue
    }
    item.matchedModel = models.find(n => index.get(n))
    try {
      await processItem(item, hits[0], report)
    } catch (e) {
      report.not_found.push({ id: item.id, model: item.matchedModel, reason: `ошибка разбора: ${String(e).slice(0, 80)}` })
      console.log(`ERR ${item.id} №${item.matchedModel}: ${String(e).slice(0, 100)}`)
    }
    await H.sleep(500)
  }

  console.log(`\n=== ИТОГ матча ===`)
  console.log(`обработано ${items.length} | найдено ${report.found.length} | not_found ${report.not_found.length}`)
  for (const nf of report.not_found) console.log(`  NF ${nf.id} №${nf.model ?? '-'}: ${nf.reason}`)

  // ── READ-BACK (через харнес, тот же scope) ────────────────────────────────────
  if (!DRY) {
    const rb = await H.readBack(SCOPE)
    console.log(`\n=== READ-BACK (вазы Немана) ===`)
    console.log(`count=${rb.count} found=${rb.found} not_found=${rb.not_found.length}`)
    console.log(`with_image_url=${rb.with_image_url} (ожидаем 0) with_color_images=${rb.with_color_images}`)
    console.log('причины not_found:')
    for (const nf of rb.not_found.slice(0, 50)) console.log(`  ${nf.id} ${nf.name}: ${nf.reason}`)
    console.log('примеры (3):')
    for (const ex of rb.examples) console.log(`  ${ex.id} ${ex.name} → ${ex.image_draft_url}`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
