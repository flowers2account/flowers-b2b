// scripts/scrape-erika.mjs — скрейпер erikapack.ru поверх харнеса.
// Запуск: node --env-file=.env.local scripts/scrape-erika.mjs [paper|upakovka]   (по умолчанию paper)
// Контракт (фото/характеристики/текст/матч/read-back) — в H.CONTRACT, тут НЕ дублируем.
// В этом файле только: секции краула, матч-логика (тип+бренд+узор по сегментам слага), разбор страницы.
import * as H from './scrape-harness.mjs'

const ROOT = 'https://erikapack.ru/upakovka-dlya-cvetov'

// ── СЕКЦИИ КРАУЛА ──────────────────────────────────────────────────────────────
const SECTIONS = {
  paper: [
    'bumaga-dlya-tsvetov/bumaga-ekolyuks',
    'bumaga-dlya-tsvetov/kraft-bumaga-belaya',
    'bumaga-dlya-tsvetov/kraft-bumaga',
    'bumaga-dlya-tsvetov/gofrirovanaya-florima',
  ],
  // упаковка (плёнка и пр.) — задел на следующий проход
  upakovka: [
    'plenka-dlya-tsvetov/plenka-s-belym-risunkom',
    'plenka-dlya-tsvetov/plenka-s-tsvetnym-risunkom',
    'plenka-dlya-tsvetov/plenka-lak',
    'plenka-dlya-tsvetov/plenka-matovaya-koreya',
    'plenka-dlya-tsvetov/plenka-metallizirovannaya',
  ],
  // лента — матч по явному маппингу RIBBON_MAP (строго тип+ширина), не по токенам
  ribbon: [
    'lenta-dlya-tsvetov/lenta-atlasnaya',
    'lenta-dlya-tsvetov/lenta-prostaya-italiya',
  ],
}
const SUBCAT = { paper: 'paper', upakovka: 'film', ribbon: 'ribbon', napkins: 'napkins', floral_foam: 'floral_foam', paints: 'paints' }

// ── MAP-режим: явный детерминированный маппинг id карточки → ПОЛНЫЙ URL товара Эрики.
// Применяется там, где токен-правила опасны (нерегулярные узоры/ширины/типы) и где надёжен
// только ручной строгий матч. onlyColor — карточка одноцветная: берём из таблицы только этот цвет.
const E = 'https://erikapack.ru'
const RIBBON_MAP = {
  6055: { url: `${E}/upakovka-dlya-cvetov/lenta-dlya-tsvetov/lenta-atlasnaya/lenta-atlasnaya-dekorativnaya-2-5-25/` },   // атлас 2,5см
  6074: { url: `${E}/upakovka-dlya-cvetov/lenta-dlya-tsvetov/lenta-prostaya-italiya/lenta-2-100-italiya-polipropilenovaya/` }, // ПП 2см
  6075: { url: `${E}/upakovka-dlya-cvetov/lenta-dlya-tsvetov/lenta-prostaya-italiya/lenta-2-100-italiya-polipropilenovaya/` },
  // 6076 «ПП 2см чёрная» — у Эрики в этой ленте чёрного нет → not_found
  6077: { url: `${E}/upakovka-dlya-cvetov/lenta-dlya-tsvetov/lenta-prostaya-italiya/lenta-2-100-italiya-polipropilenovaya/` },
}
const NAPKIN_MAP = {
  6405: { url: `${E}/upakovka-dlya-cvetov/salfetka-dlya-tsvetov/salfetki-matovye/salfetka-matovaya-cartapack-tsvetnoy-goroshek/` }, // матовая горошек
}
const FOAM_MAP = {
  5994: { url: `${E}/floristicheskie-materialy/floristicheskaya-gubka/floristicheskaya-gubka-oazis-classic/` }, // Оазис Classic
}
const PAINT_MAP = {
  6421: { url: `${E}/floristicheskie-materialy/kraska-glittery/sprey-lak-dlya-dlya-tsvetov-i-listev/` }, // спрей-лак для листьев
}
const MAPS = { ribbon: RIBBON_MAP, napkins: NAPKIN_MAP, floral_foam: FOAM_MAP, paints: PAINT_MAP }

// ── ТИП бумаги по секции Эрики (для строгого совпадения тип↔тип) ────────────────
const SEC_TYPE = {
  'bumaga-dlya-tsvetov/bumaga-ekolyuks': 'ekolyuks',
  'bumaga-dlya-tsvetov/kraft-bumaga-belaya': 'kraft',
  'bumaga-dlya-tsvetov/kraft-bumaga': 'kraft',
  'bumaga-dlya-tsvetov/gofrirovanaya-florima': 'gofre',
}

// ── КРАУЛ: секция → товары {sec, url, slug} ────────────────────────────────────
async function crawlSection(sec) {
  const urls = new Set()
  for (let pg = 1; pg <= 5; pg++) {
    const u = `${ROOT}/${sec}/${pg > 1 ? `?PAGEN_1=${pg}` : ''}`
    let html
    try { html = await H.fetchHtml(u, { vpsFallback: true }) } catch { break }
    const re = new RegExp(`/upakovka-dlya-cvetov/${sec.replace(/[/]/g, '\\/')}/[a-z0-9-]+/`, 'gi')
    const prods = [...new Set((html.match(re) || []))].filter(x => !/\/(filter|sort)\b/.test(x))
    if (!prods.length) break
    const before = urls.size
    prods.forEach(x => urls.add(x))
    if (urls.size === before) break
    await H.sleep(150)
  }
  return [...urls].map(u => ({ sec, url: 'https://erikapack.ru' + u, slug: u.split('/').filter(Boolean).pop() }))
}

// ── МАТЧ: сегмент слага, НЕ substring (Роза≠proza) ─────────────────────────────
const segHas = (slug, tok) => slug.split('-').includes(tok) || slug.includes('-' + tok + '-') || slug.endsWith('-' + tok)

// из имени карточки → { type, toks }. ТИП обязателен и должен совпасть с типом секции
// Эрики (SEC_TYPE). Узор ищется ВНУТРИ совпавшего типа. Тип не распознан / узор не у
// Эрики → null (not_found). Тип ≠ — даже похожий узор не подставляем.
function matchTokens(name) {
  const s = name.toLowerCase().replace(/ё/g, 'е')
  // явно НЕ у Эрики
  if (/креп|кальк|атлас|рисов|италюкс/.test(s)) return null
  if (/lamore|riola|tranzit|жардин|romantik|надежд|люрекс|золот|тонировк/.test(s)) return null

  // ── ТИП бумаги — ОБЯЗАТЕЛЕН ──
  const type = /эколюкс/.test(s) ? 'ekolyuks'
             : /гофрир/.test(s)  ? 'gofre'
             : /крафт/.test(s)   ? 'kraft'
             : null
  if (!type) return null

  // ── узор ВНУТРИ типа ──
  if (type === 'kraft') {
    if (/lavander|лавандер/.test(s))        return { type, toks: ['lavander'] }
    if (/кутюрье|kutyure/.test(s))          return { type, toks: ['kutyure'] }
    if (/peones|пеонес|пионес|реонес|reones/.test(s)) return { type, toks: ['reones'] }
    if (/compliment|комплимент/.test(s))    return { type, toks: ['compliment'] }
    if (/горох|goroh/.test(s))              return { type, toks: ['goroh'] }
    // крафт без распознанного узора (однотонный/коричневая/Beatriz/Скарлет/Полоска — у Эрики
    // это гофре, не крафт) → not_found
    return null
  }
  if (type === 'gofre') {
    if (/beatriz|беатриз/.test(s)) return { type, toks: ['beatriz'] }
    if (/горох|goroh/.test(s))     return { type, toks: ['goroh'] }
    if (/полоск/.test(s))          return { type, toks: ['poloska'] }
    return { type, toks: ['odnotonnaya'] }   // плейн гофре → одноцветная
  }
  // ekolyuks (жатая)
  if (/двухцветн|2-х цветн|2х цветн/.test(s)) return { type, toks: ['dvuhtsvetnaya'] }
  if (/однотон/.test(s))                      return { type, toks: ['odnotonnaya'] }
  return { type, toks: ['ekolyuks'] }
}

// ── РАЗБОР СТРАНИЦЫ ────────────────────────────────────────────────────────────
// hero: og:image (апгрейд → /750/). Цвет-вариации: страница товара = ТАБЛИЦА SKU,
// каждая строка: arr_img[N]='...src="URL"...' (фото) + <span class="_name">Цвет</span>
// (имя цвета по-русски). Индексы _name и arr_img совпадают по порядку строк. Связанные
// товары («с этим покупают») в arr_img НЕ попадают, поэтому ложных цветов нет.
const upgrade750 = u => u.replace(/\/public\/catalog\/(source|426|280|240|120)\//, '/public/catalog/750/')

// → [{ name, url }] в порядке строк таблицы вариаций
function parseColorVariants(html) {
  const abs = u => (u.startsWith('http') ? u : 'https://erikapack.ru' + u)
  const names = [...html.matchAll(/<span class="_name\s*">([^<]+)<\/span>/g)].map(m => m[1])
  const imgs = [...html.matchAll(/arr_img\[(\d+)\]\s*=\s*'[^']*?src="([^"]+)"/g)]
    .sort((a, b) => (+a[1]) - (+b[1])).map(m => abs(upgrade750(m[2])))
  const n = Math.min(names.length, imgs.length)
  // вариант = ЦВЕТ, а не размер/фасовка. Отсекаем «750мл», «35 шт», «в коробке», «рулон» и пр.,
  // иначе у губки/красок объёмы/штуки попадут в colors как фейковые «цвета».
  // ⚠ JS \b НЕ работает после кириллицы → используем lookahead (?![а-яёa-z])
  const SIZE_RE = /(\d+\s*(мл|шт|см|мм|гр|кг|л|м)(?![а-яёa-z]))|коробк|рулон|метр|лист|упаков/i
  const out = [], seen = new Set()
  for (let i = 0; i < n; i++) {
    const name = names[i].replace(/\s+/g, ' ').trim()
    if (!name || seen.has(name) || SIZE_RE.test(name)) continue
    seen.add(name)
    out.push({ name, url: imgs[i] })
  }
  return out
}

function parsePage(html) {
  const abs = u => (u.startsWith('http') ? u : 'https://erikapack.ru' + u)
  let hero = (html.match(/property="og:image"\s+content="([^"]+)"/i) || [])[1]
  if (!hero) hero = (html.match(/\/public\/catalog\/(?:750|426|source)\/[a-z0-9_\-]+\.(?:jpg|jpeg|png|webp)/i) || [])[0] || null
  hero = hero ? abs(upgrade750(hero)) : null
  const variants = {}
  for (const v of parseColorVariants(html)) if (!variants[v.name]) variants[v.name] = v.url
  return { hero, variants }
}

// ── ОСНОВНОЙ ПРОХОД ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const mode = (args.find(a => !a.startsWith('--')) || 'paper').toLowerCase()
const MAP = MAPS[mode] || null
const sections = SECTIONS[mode] || []
if (!MAP && !sections.length) { console.error('mode: ' + [...Object.keys(SECTIONS), ...Object.keys(MAPS)].join('|') + '  [--dry]'); process.exit(1) }

console.error(`=== scrape-erika [${mode}]${DRY ? ' --dry (без записи/VPS)' : ''} ===`)
const index = []
if (!MAP) {   // краул нужен только токен-режимам; MAP-режимы бьют по прямым URL
  for (const sec of sections) {
    const items = await crawlSection(sec)
    index.push(...items)
    console.error(`crawl ${sec}: ${items.length}`)
  }
  console.error(`index: ${index.length}`)
}

const cards = await H.worklist(q => q.eq('subcategory', SUBCAT[mode]))
console.error(`worklist: ${cards.length}`)

const log = []
for (const card of cards) {
  // ── матч: либо явный маппинг (MAP-режим), либо токены типа/узора (paper) ──
  let hit, onlyColor = null
  if (MAP) {
    const t = MAP[card.id]
    if (!t) { log.push({ id: card.id, found: false, reason: 'нет строгого матча' }); continue }
    hit = { url: t.url, slug: t.url.split('/').filter(Boolean).pop() }
    onlyColor = t.onlyColor || null
  } else {
    const m = matchTokens(card.name)
    if (!m) { log.push({ id: card.id, found: false, reason: 'узор/тип не у Эрики' }); continue }
    const toks = m.toks
    // тип секции Эрики обязан совпасть с типом карточки (для film-секций SEC_TYPE пуст → не фильтруем)
    hit = index.find(it => (!SEC_TYPE[it.sec] || SEC_TYPE[it.sec] === m.type) && toks.every(t => segHas(it.slug, t)))
    if (!hit) { log.push({ id: card.id, found: false, reason: `нет [${m.type}:${toks.join('+')}] у Эрики` }); continue }
  }
  let html
  try { html = await H.fetchHtml(hit.url, { vpsFallback: true }) }
  catch (e) { log.push({ id: card.id, found: false, reason: 'fetch err: ' + e.message.slice(0, 30) }); continue }
  let { hero, variants } = parsePage(html)
  // одноцветная карточка: оставляем только её цвет из таблицы + герой = это фото
  if (onlyColor) {
    const re = new RegExp(onlyColor, 'i')
    variants = Object.fromEntries(Object.entries(variants).filter(([n]) => re.test(n)))
    const first = Object.values(variants)[0]
    if (first) hero = first
  }
  const colorNames = Object.keys(variants)
  if (DRY) {
    log.push({ id: card.id, found: true, slug: hit.slug, colors: colorNames.length, names: colorNames, dry: true })
    console.error(`DRY ${card.id} ${hit.slug} colors=${colorNames.length}: ${colorNames.join(' | ') || '—'}`)
    continue
  }
  try {
    if (!hero) { log.push({ id: card.id, found: false, reason: 'нет hero на странице' }); continue }
    // hero → VPS
    const raw = await H.fetchImg(hero, { vpsFallback: true })
    const draft = await H.processImg(raw)
    const heroUrl = await H.uploadVPS(draft, `${card.id}_draft.jpg`)
    await H.uploadVPS(raw, `${card.id}_draft_raw.jpg`)
    // цвет-вариации → color_images
    const color_images = {}, colors = []
    for (const [ru, vurl] of Object.entries(variants)) {
      try {
        const vraw = await H.fetchImg(vurl, { vpsFallback: true })
        const vjpg = await H.processImg(vraw)
        const url = await H.uploadVPS(vjpg, `${card.id}_${H.tr(ru)}.jpg`)
        color_images[ru] = url; colors.push(ru)
      } catch {}
    }
    // характеристики из имени (упаковка: материал/плотность/ширина/узор) → текст
    const dens = (card.name.match(/(\d+)\s*(гр|мкр|мик|mic)/i) || [])
    const width = (card.name.match(/(\d+)\s*(мм|см)/i) || [])
    const len = (card.name.match(/(\d+)\s*м(?![а-яёкм])/i) || [])
    const tipo = mode === 'ribbon'
      ? (/атлас/i.test(card.name) ? 'атласная лента' : /полипропилен/i.test(card.name) ? 'полипропиленовая лента' : /рафия/i.test(card.name) ? 'рафия' : /белатекс/i.test(card.name) ? 'лента белатекс' : 'лента')
      : mode === 'napkins' ? 'флористическая салфетка'
      : mode === 'floral_foam' ? 'флористическая губка (оазис)'
      : mode === 'paints' ? 'спрей для флористики'
      : (/крафт/i.test(card.name) ? 'крафт-бумага' : /эколюкс/i.test(card.name) ? 'бумага эколюкс' : /гофрир/i.test(card.name) ? 'гофрированная бумага' : 'упаковочная бумага')
    const parts = [`${card.name.replace(/\s+/g, ' ').trim()} — ${tipo} для упаковки цветов и подарков (Erika Pack)`]
    const sd = [tipo[0].toUpperCase() + tipo.slice(1)]
    if (dens[0]) { parts.push(`плотность ${dens[1]} ${dens[2]}`); sd.push(`${dens[1]} ${dens[2]}`) }
    if (width[0]) { parts.push(`ширина ${width[1]} ${width[2]}`); sd.push(`${width[1]} ${width[2]}`) }
    if (len[0]) parts.push(`длина ${len[1]} м`)
    if (colors.length) parts.push(`доступные цвета: ${colors.join(', ')}`)
    const description = parts.join(', ') + '.'
    const short_description = sd.join(', ') + '.'
    const fields = { image_draft_url: heroUrl, image_draft_raw_url: `${heroUrl.replace('_draft.jpg', '_draft_raw.jpg')}`, image_status: 'approved_dealer', image_source: hit.url, source_url: hit.url, description, short_description }
    // всегда задаём (null если вариаций нет) — чтобы перезатереть возможные прежние спуриозные значения
    fields.color_images = colors.length ? color_images : null
    fields.colors = colors.length ? colors : null
    const res = await H.writeDraft(card.id, fields)
    log.push({ id: card.id, found: true, slug: hit.slug, colors: colors.length, updated: res.updated })
    console.error(`OK ${card.id} ${hit.slug} colors=${colors.length}`)
    await H.sleep(120)
  } catch (e) { log.push({ id: card.id, found: false, reason: 'err: ' + e.message.slice(0, 40) }) }
}

// ── READ-BACK ─────────────────────────────────────────────────────────────────
const rb = await H.readBack(q => q.eq('subcategory', SUBCAT[mode]))
console.log('\n=== READ-BACK', mode, '===')
console.log(JSON.stringify({ found_this_run: log.filter(l => l.found).length, not_found_this_run: log.filter(l => !l.found).length, ...rb }, null, 1))
console.log('\nnot_found причины:')
for (const l of log.filter(x => !x.found)) console.log(`  ${l.id} — ${l.reason}`)
console.log('\nfound:')
for (const l of log.filter(x => x.found)) console.log(`  ${l.id} ${l.slug} colors=${l.colors}${l.names?.length ? ' [' + l.names.join(' | ') + ']' : ''}`)
