// scripts/scrape-7flowers.mjs — авто-добор фото/характеристик расходки/упаковки с 7flowers-decor.ru.
// Запуск:  node --env-file=.env.local scripts/scrape-7flowers.mjs [--dry] [subcat ...]
//   без аргументов — все целевые подкатегории (bags/foamiran/baskets/paints/decor/film/paper).
//   subcat-аргументы ограничивают прогон (напр. `bags foamiran`).
//
// ПОВЕРХ ХАРНЕСА: worklist/fetch/processImg/uploadVPS/writeDraft(аллоулист)/readBack/CONTRACT — в scrape-harness.mjs.
// Запись ТОЛЬКО через H.writeDraft. image_url/is_active/qty/price НЕ трогаем.
//
// ЛОГИКА:
//  1) КРАУЛ листингов разделов (InSales-движок: /catalog/<sec>/page-N/, 20 карточек/стр до 404).
//     Карточка: data-gid(база)/data-id(оффер), ссылка /products/slug/?oid=, чистое имя+размер в img alt,
//     фото /upload/iblock/<hex>/<hash> → де-резайз в оригинал .jpg (макс. разрешение).
//  2) СТРОГИЙ МАТЧ наших карточек без фото к индексу: тип(раздел) + размер(дхшхв) + значимый токен.
//     Штрихкод 7flowers в матче НЕ участвует (у нас его нет) — сохраняем только в манифест «на будущее».
//     Чужой тип/узор не подставляем (сумка-конус ≠ сумка-домик при совпадении размера).
//  3) Для сматченных — тянем страницу товара за вариациями: offers['offer<oid>']={color,size,barcode,articul}.
//     hero→image_draft_url, цвета→color_images+colors, характеристики→текст, размеры→dimensions_unpacked,
//     source_url=URL товара 7flowers, image_status='approved_dealer', image_source='7flowers-decor'.

import * as H from './scrape-harness.mjs'
import { mkdirSync, writeFileSync } from 'fs'

// 7flowers-decor.ru — TLS-цепочка неполная (нет промежуточного сертификата) → отключаем
// проверку для undici/global fetch. vpsFallback тут не спасёт (curl на VPS без -k), потому off.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const HOST = 'https://www.7flowers-decor.ru'   // www обязателен: апекс отдаёт 301
const OUT = 'tmp-7flowers'
const DRY = process.argv.includes('--dry')
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('--'))
const log = (...a) => console.log(...a)

// ── ЦЕЛЕВЫЕ ПОДКАТЕГОРИИ: наш subcategory → разделы 7flowers для поиска кандидатов ──
const GROUPS = {
  bags:     ['sumki_dlya_tsvetov', 'pakety_podarochnye', 'upakovka_dlya_tsvetov', 'upakovka_dlya_podarkov', 'drugaya_upakovka_dlya_tsvetov_i_podarkov'],
  foamiran: ['foamiran'],
  baskets:  ['pletenye_korziny', 'podarochnye_korziny'],
  paints:   ['kraski_dlya_tsvetov'],
  decor:    ['floristicheskiy_dekor', 'sizal_iskusstvennaya', 'fetr'],
  film:     ['plenka_polipropilen_v_listakh', 'plenka_polipropilen_v_rulonakh'],
  paper:    ['bumaga_dekorativnaya', 'bumaga_podarochnaya'],
}
const SUBCATS = (ARGS.length ? ARGS : Object.keys(GROUPS)).filter(s => GROUPS[s])
if (!SUBCATS.length) { console.error('subcat: ' + Object.keys(GROUPS).join('|') + '  [--dry]'); process.exit(1) }

// ── НОРМАЛИЗАЦИЯ / ТОКЕНЫ / РАЗМЕРЫ ─────────────────────────────────────────────
const decode = s => String(s ?? '').replace(/&quot;/g, '"').replace(/&laquo;|&raquo;/g, '"')
  .replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim()
const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е')
const STEM = w => (w.length >= 6 ? w.slice(0, 6) : w)

// стоп-слова: тип/упаковка/единицы/служебное — всё, что НЕ различает товар
const STOP = new Set([
  'сумка', 'сумочка', 'пакет', 'пакеты', 'аквабокс', 'коробка', 'коробочка', 'корзина', 'корзинка',
  'краска', 'краски', 'плёнка', 'пленка', 'бумага', 'фоамиран', 'сизаль', 'фетр',
  'для', 'цветов', 'цветок', 'подарков', 'подарка', 'набор', 'наборе', 'штук', 'количество',
  'материал', 'цвет', 'размер', 'страна', 'производитель', 'единица', 'продажи', 'ассорт', 'ассортименте',
  'см', 'мм', 'шт', 'упак', 'уп', 'мл', 'россия', 'китай', 'нов', 'новый',
])
const UNIT = /^(см|мм|шт|мл|л|кг|гр|г|d|h|х|x)$/i

// значимые токены имени (стем 6-симв), без стопов/единиц/чисел
function sig(s) {
  const out = new Set()
  for (const t of norm(s).split(/[^a-zа-я0-9]+/)) {
    if (!t || t.length < 3 || STOP.has(t) || UNIT.test(t) || /^\d+$/.test(t)) continue
    out.add(STEM(t))
  }
  return out
}
// «слабые» токены (стиль/материал) — сами по себе матч не подтверждают
const WEAK = new Set(['подаро', 'картон', 'ламина', 'пласти', 'декора', 'матова', 'глянце', 'крафт', 'люкс', 'тиснен'])

// ── ГАРД ПО ТИПУ-ГОЛОВЕ: корзина≠кашпо, сумка≠коробка≠пакет≠аквабокс ─────────────
// Берём первое значащее слово имени и приводим к классу. Класс обязан совпасть у нас и кандидата.
function kindOf(name) {
  const ws = norm(name).split(/[^a-zа-я]+/).filter(Boolean)
  for (const t of ws) {
    if (/^(сумк|сумоч)/.test(t)) return 'sumka'
    if (/^пакет/.test(t)) return 'paket'
    if (/^аквабок/.test(t)) return 'akvabox'
    if (/^(коробк|коробоч)/.test(t)) return 'korobka'
    if (/^корзин/.test(t)) return 'korzina'
    if (/^кашпо/.test(t)) return 'kashpo'
    if (/^(краск|спрей|аэрозол)/.test(t) || t === 'лак') return 'paint'
    if (/^(плёнк|пленк)/.test(t)) return 'plenka'
    if (/^бумаг/.test(t)) return 'bumaga'
    if (/^фоамиран/.test(t)) return 'foamiran'
    if (/^фетр/.test(t)) return 'fetr'
    if (/^сизал/.test(t)) return 'sizal'
  }
  return ws[0] ? STEM(ws[0]) : '?'
}
// «набор (N шт)» — комплектность. Если у обоих указана и различается → разные товары.
const naborOf = s => { const m = String(s).match(/набор\s*\(?\s*(\d+)\s*шт/i); return m ? +m[1] : null }

// размеры: кластер из 2–3 чисел через разделитель (x/×/х/*), терпим к D/H и запятой-десятичной
function dimsOf(raw) {
  const s = String(raw).toLowerCase().replace(/(\d),(\d)/g, '$1.$2')
  const m = s.match(/(?:[dдø]\s*)?\d+(?:\.\d+)?\s*(?:[xх×*]\s*[hвdд]?\s*\d+(?:\.\d+)?\s*){1,2}/i)
  if (!m) return []
  return (m[0].match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n => n > 0 && n < 1000)
}
// наши размеры ⊆ кандидатских (терпимость ±0.6 см)
function dimsMatch(a, b) {
  if (!a.length || !b.length) return false
  const B = [...b], used = new Array(B.length).fill(false)
  for (const x of a) {
    let ok = false
    for (let i = 0; i < B.length; i++) if (!used[i] && Math.abs(B[i] - x) <= 0.6) { used[i] = true; ok = true; break }
    if (!ok) return false
  }
  return true
}

// ── КРАУЛ ЛИСТИНГА: раздел → карточки [{gid,oid,url,slug,title,thumb}] ───────────
function parseCards(html) {
  const out = []
  const re = /data-gid="(\d+)"\s+data-id="(\d+)"/g
  const marks = []
  let m
  while ((m = re.exec(html))) marks.push({ gid: m[1], oid: m[2], pos: m.index })
  for (let i = 0; i < marks.length; i++) {
    const slice = html.slice(marks[i].pos, i + 1 < marks.length ? marks[i + 1].pos : marks[i].pos + 4000)
    const url = (slice.match(/\/products\/[a-z0-9_]+\/\?oid=\d+/i) || [])[0]
    const slug = url ? (url.match(/\/products\/([a-z0-9_]+)\//i) || [])[1] : null
    const thumb = (slice.match(/\/upload\/[^"'\s]+?\.(?:webp|jpg|jpeg|png)/i) || [])[0]
    const alt = (slice.match(/alt="([^"]*)"/i) || [])[1] || ''
    const title = decode(alt).replace(/\s*[-–]\s*фото\s*\d+\s*$/i, '').replace(/^фото\s*\d+\s*[-–]\s*/i, '')
    if (!url || !title) continue
    out.push({ gid: marks[i].gid, oid: marks[i].oid, url: HOST + url, slug, title, thumb })
  }
  return out
}

async function crawlSection(sec) {
  const cards = []
  for (let pg = 1; pg <= 40; pg++) {
    const u = `${HOST}/catalog/${sec}/${pg > 1 ? `page-${pg}/` : ''}`
    let html
    try { html = await H.fetchHtml(u) } catch { break }          // 404 за концом пагинации → стоп
    const got = parseCards(html)
    if (!got.length) break
    cards.push(...got)
    await H.sleep(150)
  }
  return cards
}

// ── де-резайз превью в оригинал /upload/iblock/<hex>/<hash>.<ext> (макс. разрешение) ─
function origImg(u) {
  const m = String(u).match(/iblock\/([0-9a-f]{3})\/(?:[0-9_]+\/)?([0-9a-z]{16,})\.(webp|jpg|jpeg|png)/i)
  if (!m) return null
  return ext => `${HOST}/upload/iblock/${m[1]}/${m[2]}.${ext}`
}
async function fetchHero(thumb) {
  const make = origImg(thumb)
  const tries = make ? ['jpg', 'png', 'jpeg', 'webp'].map(make) : []
  if (thumb) tries.push(thumb.startsWith('http') ? thumb : HOST + thumb)  // как есть (превью) — последний шанс
  for (const url of tries) {
    try {
      const buf = await H.fetchImg(url)
      if (/^(ffd8|89504e47|52494646)/.test(buf.subarray(0, 4).toString('hex'))) return { url, buf }
    } catch {}
  }
  return null
}

// ── offers['offer<oid>'] на странице товара: {gid,id,color,size,barcode,articul,prop} ─
function parseOffers(html) {
  const out = {}
  let idx = 0
  for (;;) {
    const k = html.indexOf("offers['offer", idx)
    if (k < 0) break
    const eq = html.indexOf('=', k)
    const bs = html.indexOf('{', eq)
    if (bs < 0) break
    let d = 0, end = -1
    for (let i = bs; i < html.length; i++) { const c = html[i]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { end = i + 1; break } } }
    if (end < 0) break
    const id = (html.slice(k, eq).match(/offer(\d+)/) || [])[1]
    try { out[id] = JSON.parse(html.slice(bs, end)) } catch {}
    idx = end
  }
  return out
}
// «Длина 12, Ширина 8, Высота 12.5» → "12 × 8 × 12.5 см"
function sizeText(size) {
  const nums = (String(size || '').match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.'))
  return nums.length ? nums.join(' × ') + ' см' : (size || null)
}

// ── ТЕКСТ (формат CONTRACT, расходка/упаковка) ─────────────────────────────────
const KIND_BY_SUB = { bags: 'упаковка для цветов', foamiran: 'фоамиран', baskets: 'корзина', paints: 'краска для флористики', decor: 'флористический декор', film: 'плёнка упаковочная', paper: 'бумага упаковочная' }
function buildText({ sub, title, material, size, colors }) {
  const kind = KIND_BY_SUB[sub] || 'товар для флористики'
  const sd = [title.replace(/\s+/g, ' ').trim()]
  const parts = [`${title.replace(/\s+/g, ' ').trim()} — ${kind} (7flowers-decor)`]
  if (material) { parts.push(`материал: ${material.toLowerCase()}`); sd.push(material) }
  if (size) { parts.push(`размер ${size}`); sd.push(size) }
  if (colors.length > 1) parts.push(`доступные цвета: ${colors.join(', ')}`)
  else if (colors.length === 1) { parts.push(`цвет: ${colors[0]}`); sd.push(colors[0]) }
  return { description: parts.join(', ') + '.', short_description: sd.join(', ') + '.' }
}

// ── ИНДЕКС: краул всех нужных разделов (уникальные по subcategory) ──────────────
const secOfSub = {}
for (const sub of SUBCATS) for (const sec of GROUPS[sub]) (secOfSub[sec] ??= new Set()).add(sub)
const allSecs = Object.keys(secOfSub)

console.error(`=== scrape-7flowers ${DRY ? '[--dry]' : '[LIVE]'} subcats=${SUBCATS.join(',')} ===`)
console.error(`краул ${allSecs.length} разделов…`)
const cardsBySec = {}
for (const sec of allSecs) {
  const c = await crawlSection(sec)
  cardsBySec[sec] = c
  console.error(`  ${sec}: ${c.length} карточек`)
}

// пул кандидатов на subcategory + предрасчёт sig/dims
function poolFor(sub) {
  const seen = new Set(), pool = []
  for (const sec of GROUPS[sub]) for (const c of cardsBySec[sec] || []) {
    if (seen.has(c.oid)) continue
    seen.add(c.oid)
    pool.push({ ...c, sig: sig(c.title), dims: dimsOf(c.title) })
  }
  return pool
}
const pools = Object.fromEntries(SUBCATS.map(s => [s, poolFor(s)]))

// ── МАТЧ ────────────────────────────────────────────────────────────────────────
function matchCard(card, pool) {
  const oSig = sig(card.name), oDims = dimsOf(card.name)
  const oKind = kindOf(card.name), oNabor = naborOf(card.name)
  let best = null, bestScore = 0, bestBasis = ''
  for (const cand of pool) {
    if (kindOf(cand.title) !== oKind) continue                    // тип-голова обязан совпасть
    const cNabor = naborOf(cand.title)
    if (oNabor != null && cNabor != null && oNabor !== cNabor) continue   // разная комплектность
    if (oNabor != null && cNabor == null) continue                // у нас набор, у них штучно — другой товар
    const shared = [...oSig].filter(t => cand.sig.has(t))
    const distinct = shared.filter(t => !WEAK.has(t))
    const dm = dimsMatch(oDims, cand.dims)
    // СТРОГО: если у нас есть размер — он обязан совпасть (+общий токен). Размера нет → различающий токен.
    const accept = oDims.length
      ? (dm && shared.length >= 1)
      : distinct.length >= 1
    if (!accept) continue
    const score = (dm ? 10 : 0) + shared.length * 2 + distinct.length * 3
    if (score > bestScore) { best = cand; bestScore = score; bestBasis = (dm ? 'size' : '') + (distinct.length ? (dm ? '+tok' : 'tok') : '') || 'tok' }
  }
  return best ? { cand: best, score: bestScore, basis: bestBasis } : null
}

const work = await H.worklist(q => q.in('subcategory', SUBCATS))
console.error(`\nworklist (наши без фото в ${SUBCATS.join(',')}): ${work.length}`)

// группировка наших по subcategory + матч
const report = []   // { id, name, sub, found, cand, score, basis }
for (const p of work) {
  const sub = p.subcategory
  const pool = pools[sub] || []
  const hit = matchCard(p, pool)
  report.push({ id: p.id, name: p.name, sub, found: !!hit, cand: hit?.cand || null, score: hit?.score || 0, basis: hit?.basis || '' })
}

// ── СВОДКА МАТЧА (по subcategory) ───────────────────────────────────────────────
const bySub = {}
for (const r of report) {
  const b = (bySub[r.sub] ??= { total: 0, matched: 0 })
  b.total++; if (r.found) b.matched++
}
log(`\n═══ МАТЧ (7flowers, ${DRY ? 'DRY' : 'LIVE'}) ═══`)
for (const [sub, b] of Object.entries(bySub)) log(`  ${sub}: сматчено ${b.matched}/${b.total}`)
log(`  ИТОГО: ${report.filter(r => r.found).length}/${report.length}`)
log(`\n── примеры матча (до 3 на подкатегорию) ──`)
for (const sub of SUBCATS) {
  const ex = report.filter(r => r.found && r.sub === sub).slice(0, 3)
  for (const r of ex) {
    log(`  #${r.id} [${r.sub}|${r.basis}|score ${r.score}]`)
    log(`     наш: «${r.name.slice(0, 72)}»`)
    log(`     7f:  «${r.cand.title.slice(0, 72)}»  ${r.cand.url}`)
  }
}

// ── DRY: стоп тут ───────────────────────────────────────────────────────────────
if (DRY) {
  log(`\nnot_found (${report.filter(r => !r.found).length}) — первые 15:`)
  for (const r of report.filter(r => !r.found).slice(0, 15)) log(`  #${r.id} [${r.sub}] «${r.name.slice(0, 60)}»`)
  log('\n(--dry: страницы товаров не тянули, фото/запись пропущены.)')
  process.exit(0)
}

// ── LIVE: тянем вариации, заливаем hero+цвета, пишем черновики ───────────────────
mkdirSync(OUT, { recursive: true })
const offersCache = {}
async function offersOfPage(url) {
  const base = url.split('?')[0]
  if (offersCache[base]) return offersCache[base]
  let html
  try { html = await H.fetchHtml(base) } catch { offersCache[base] = {}; return {} }
  offersCache[base] = parseOffers(html)
  await H.sleep(200)
  return offersCache[base]
}

const manifest = []
let written = 0
for (const r of report.filter(x => x.found)) {
  const card = r.cand
  try {
    // вариации страницы товара (oid → {color,size,barcode,articul})
    const offers = await offersOfPage(card.url)
    const myOff = offers[card.oid] || {}
    // сиблинги того же размера = цвета (по gid из карточек раздела)
    const siblings = (pools[r.sub] || []).filter(c => c.gid === card.gid)
    const myDims = dimsOf(card.title)
    // hero — фото сматченной карточки (макс. разрешение)
    const hero = await fetchHero(card.thumb)
    if (!hero) { report.find(x => x.id === r.id).found = false; report.find(x => x.id === r.id).reason = 'нет hero-фото'; continue }
    const ext = (hero.url.match(/\.(\w+)(?:$|\?)/) || [])[1] || 'jpg'
    const draftBuf = await H.processImg(hero.buf)
    const heroUrl = await H.uploadVPS(draftBuf, `7f_${r.id}_draft.jpg`)
    const rawUrl = await H.uploadVPS(hero.buf, `7f_${r.id}_draft_raw.${ext}`)

    // цвета: по сиблингам того же размера + цвет из offers; имя файла через H.tr
    const color_images = {}, colors = [], srcColors = []
    for (const sib of siblings) {
      if (myDims.length && !dimsMatch(myDims, sib.dims) && !dimsMatch(sib.dims, myDims)) continue  // другой размер — не цвет
      const col = offers[sib.oid]?.color || null
      const label = col && col.trim() ? col.trim() : null
      if (!label || colors.includes(label)) continue
      const sh = await fetchHero(sib.thumb)
      if (!sh) continue
      const cu = await H.uploadVPS(await H.processImg(sh.buf), `7f_${r.id}_${H.tr(label)}.jpg`)
      color_images[label] = cu; colors.push(label)
      srcColors.push({ oid: sib.oid, color: label, barcode: offers[sib.oid]?.barcode || null, articul: offers[sib.oid]?.articul || null })
    }
    if (!colors.length && myOff.color) { colors.push(myOff.color); color_images[myOff.color] = heroUrl }

    // характеристики → текст
    const material = (myOff.prop && (decode(myOff.prop).match(/Материал\s*([А-Яа-яё]+)/) || [])[1]) || null
    const size = sizeText(myOff.size) || (myDims.length ? myDims.join(' × ') + ' см' : null)
    const txt = buildText({ sub: r.sub, title: card.title, material, size, colors })

    const fields = {
      image_draft_url: heroUrl, image_draft_raw_url: rawUrl,
      image_status: 'approved_dealer', image_source: '7flowers-decor', source_url: card.url,
      description: txt.description, short_description: txt.short_description,
      color_images: colors.length ? color_images : null,
      colors: colors.length ? colors : null,
      dimensions_unpacked: size,
    }
    const w = await H.writeDraft(r.id, fields)
    if (w.updated) written++
    else report.find(x => x.id === r.id).reason = w.error || 'writeDraft не обновил'

    // манифест «на будущее»: штрихкод/артикул 7flowers (в матче не используются)
    manifest.push({
      id: r.id, our_name: r.name, source_url: card.url, gid: card.gid, oid: card.oid,
      barcode: myOff.barcode || null, articul: myOff.articul || null,
      size: myOff.size || null, colors: srcColors.length ? srcColors : colors,
      basis: r.basis, score: r.score,
    })
    log(`OK #${r.id} [${r.sub}|${r.basis}] colors=${colors.length} «${card.title.slice(0, 50)}»`)
    await H.sleep(120)
  } catch (e) {
    const rec = report.find(x => x.id === r.id); rec.found = false; rec.reason = 'err: ' + String(e.message || e).slice(0, 80)
    log(`ERR #${r.id}: ${rec.reason}`)
  }
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1))

// ── READ-BACK ────────────────────────────────────────────────────────────────────
const ids = report.filter(r => r.found).map(r => r.id)
const rb = await H.readBack(q => q.in('id', ids.length ? ids : [-1]))
const { data: srcRows } = await H.sb.from('products').select('id,source_url,subcategory').in('id', ids.length ? ids : [-1])
const withSrc = (srcRows || []).filter(r => r.source_url).length
log(`\n═══ READ-BACK (7flowers) ═══`)
log(`записано черновиков: ${written} | with_image_url(=0?): ${rb.with_image_url} | with_color_images: ${rb.with_color_images} | с source_url: ${withSrc}`)
log(`манифест (штрихкоды/артикулы на будущее): ${OUT}/manifest.json (${manifest.length} строк)`)
const bySubLive = {}
for (const r of (srcRows || [])) bySubLive[r.subcategory] = (bySubLive[r.subcategory] || 0) + 1
log('по разделам:', JSON.stringify(bySubLive))
log('примеры (3):', JSON.stringify(rb.examples, null, 1))
const nf = report.filter(r => !r.found)
log(`\nnot_found (${nf.length}):`)
for (const r of nf) log(`  #${r.id} [${r.sub}] «${r.name.slice(0, 55)}»${r.reason ? ' — ' + r.reason : ''}`)
