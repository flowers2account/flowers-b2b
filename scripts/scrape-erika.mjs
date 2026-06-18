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
}
const SUBCAT = { paper: 'paper', upakovka: 'film' }

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
// hero: /750/ (НЕ /426/-thumb); цвет-вариации: /public/catalog/source/ с суффиксом цвета.
const COLOR_RU = [
  ['зел', 'зелёный'], ['фиолет', 'фиолетовый'], ['розов', 'розовый'], ['красн', 'красный'],
  ['син', 'синий'], ['голуб', 'голубой'], ['сирен', 'сиреневый'], ['золот', 'золотой'],
  ['серебр', 'серебряный'], ['белы', 'белый'], ['малин', 'малиновый'], ['пудр', 'пудровый'],
  ['персик', 'персиковый'], ['бордо', 'бордовый'], ['корич', 'коричневый'], ['черн', 'чёрный'],
  ['green', 'зелёный'], ['red', 'красный'], ['blue', 'синий'], ['pink', 'розовый'], ['gold', 'золотой'],
]
const colorRu = s => { const x = s.toLowerCase(); for (const [k, ru] of COLOR_RU) if (x.includes(k)) return ru; return null }
const upgrade750 = u => u.replace(/\/public\/catalog\/(426|280|240|120)\//, '/public/catalog/750/')

function parsePage(html, slug, tokens) {
  const abs = u => (u.startsWith('http') ? u : 'https://erikapack.ru' + u)
  // og:image → hero (апгрейд до /750/)
  let hero = (html.match(/property="og:image"\s+content="([^"]+)"/i) || [])[1]
  // все товарные картинки /public/catalog/750/ (исключая меню-иконки scr/ и категории)
  const all = [...new Set((html.match(/\/public\/catalog\/(?:750|426|280)\/[a-z0-9_\-]+\.(?:jpg|jpeg|png|webp)/gi) || []))]
    .map(upgrade750)
  if (!hero && all.length) hero = all[0]
  hero = hero ? abs(upgrade750(hero)) : null
  // цвет-вариации: ТОЛЬКО картинки ЭТОГО узора (имя файла содержит узор/бренд-токен) с цветом.
  // Иначе ловим чужие «красный/red» с посторонних элементов страницы.
  const variants = {}
  const ownPat = tokens.filter(t => t.length >= 4)   // значимые токены узора/бренда
  for (const u of all) {
    const fname = u.split('/').pop().toLowerCase()
    if (ownPat.length && !ownPat.some(t => fname.includes(t))) continue
    const c = colorRu(fname)
    if (c && !variants[c]) variants[c] = abs(u)
  }
  return { hero, variants }
}

// ── ОСНОВНОЙ ПРОХОД ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const mode = (args.find(a => !a.startsWith('--')) || 'paper').toLowerCase()
const sections = SECTIONS[mode]
if (!sections) { console.error('mode: paper|upakovka  [--dry]'); process.exit(1) }

console.error(`=== scrape-erika [${mode}]${DRY ? ' --dry (без записи/VPS)' : ''} ===`)
const index = []
for (const sec of sections) {
  const items = await crawlSection(sec)
  index.push(...items)
  console.error(`crawl ${sec}: ${items.length}`)
}
console.error(`index: ${index.length}`)

const cards = await H.worklist(q => q.eq('subcategory', SUBCAT[mode]))
console.error(`worklist: ${cards.length}`)

const log = []
for (const card of cards) {
  const m = matchTokens(card.name)
  if (!m) { log.push({ id: card.id, found: false, reason: 'узор/тип не у Эрики' }); continue }
  const toks = m.toks
  // тип секции Эрики обязан совпасть с типом карточки (для film-секций SEC_TYPE пуст → не фильтруем)
  const hit = index.find(it => (!SEC_TYPE[it.sec] || SEC_TYPE[it.sec] === m.type) && toks.every(t => segHas(it.slug, t)))
  if (!hit) { log.push({ id: card.id, found: false, reason: `нет [${m.type}:${toks.join('+')}] у Эрики` }); continue }
  if (DRY) { log.push({ id: card.id, found: true, slug: hit.slug, colors: 0, dry: true }); console.error(`DRY ${card.id} -> ${hit.slug}`); continue }
  try {
    const html = await H.fetchHtml(hit.url, { vpsFallback: true })
    const { hero, variants } = parsePage(html, hit.slug, toks)
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
    const tipo = /крафт/i.test(card.name) ? 'крафт-бумага' : /эколюкс/i.test(card.name) ? 'бумага эколюкс' : /гофрир/i.test(card.name) ? 'гофрированная бумага' : 'упаковочная бумага'
    const parts = [`${card.name.replace(/\s+/g, ' ').trim()} — ${tipo} для упаковки цветов и подарков (Erika Pack)`]
    const sd = [tipo[0].toUpperCase() + tipo.slice(1)]
    if (dens[0]) { parts.push(`плотность ${dens[1]} ${dens[2]}`); sd.push(`${dens[1]} ${dens[2]}`) }
    if (width[0]) { parts.push(`ширина ${width[1]} ${width[2]}`); sd.push(`${width[1]} ${width[2]}`) }
    if (len[0]) parts.push(`длина ${len[1]} м`)
    if (colors.length) parts.push(`доступные цвета: ${colors.join(', ')}`)
    const description = parts.join(', ') + '.'
    const short_description = sd.join(', ') + '.'
    const fields = { image_draft_url: heroUrl, image_draft_raw_url: `${heroUrl.replace('_draft.jpg', '_draft_raw.jpg')}`, image_status: 'approved_dealer', image_source: hit.url, description, short_description }
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
for (const l of log.filter(x => x.found)) console.log(`  ${l.id} ${l.slug} colors=${l.colors}`)
