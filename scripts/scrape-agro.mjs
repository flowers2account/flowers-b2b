// scripts/scrape-agro.mjs — скрейпер агрохимии (удобрения / грунт / защита / стимуляторы)
// ПОВЕРХ харнеса. Запуск:
//   node --env-file=.env.local scripts/scrape-agro.mjs              # вся очередь насквозь
//   node --env-file=.env.local scripts/scrape-agro.mjs --only=soil # одна subcategory
//   node --env-file=.env.local scripts/scrape-agro.mjs --dry        # без VPS/записи в БД
//   node --env-file=.env.local scripts/scrape-agro.mjs --limit=10   # ограничить scope каждой subcat
//
// Источники: letto.ru (мультибренд-агрегатор, ОСНОВНОЙ) + бренд-сайты (добор).
// В ЭТОМ файле — только секции: КРАУЛ, МАТЧ, РАЗБОР СТРАНИЦЫ, ТЕКСТ.
// Контракт обогащения, фото-пайплайн, VPS, writeDraft/worklist/readBack — в харнесе (H.*).
// СЛЕДУЕМ H.CONTRACT (не дублируем правила) — он передаётся в промпт LLM as-is.

import * as H from './scrape-harness.mjs'
import { createRequire } from 'module'
import { mkdirSync, writeFileSync } from 'fs'

const require = createRequire(import.meta.url)
const { BRAND_DOMAIN_HINT } = require('../config/accessory-photo-domains.js')

// ── CLI ────────────────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2)
const argVal = k => { const a = ARGV.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null }
const DRY   = ARGV.includes('--dry')
const ONLY  = argVal('only')                         // soil|plant_protection|growth_stim|fertilizers
const LIMIT = argVal('limit') ? Number(argVal('limit')) : Infinity
const IDS   = argVal('ids')?.split(',').map(s => Number(s.trim())).filter(Boolean) ?? null

const GEMINI_MODEL   = 'gemini-flash-lite-latest'
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY
const DELAY_MS = 900

// ── ОЧЕРЕДЬ (насквозь, не останавливаться на вопросы) ───────────────────────────
const QUEUE = [
  { sub: 'soil',             filter: q => q.eq('subcategory', 'soil') },
  { sub: 'plant_protection', filter: q => q.eq('subcategory', 'plant_protection') },
  { sub: 'growth_stim',      filter: q => q.eq('subcategory', 'growth_stim') },
  // агро-хвост новых карточек (+ бренды Reasil/Сила жизни/Август/Башинком/Fertika/JOY/Инта-Вир/БиоТехнологии/Зелёная аптека)
  { sub: 'fertilizers',      filter: q => q.eq('subcategory', 'fertilizers') },
]

// ═══════════════════════════════════════════════════════════════════════════════
// БРЕНДЫ + МАРШРУТИЗАЦИЯ ИСТОЧНИКА
// LETTO — основной (мультибренд). Бренд-сайт — добор для конкретных производителей.
// ═══════════════════════════════════════════════════════════════════════════════
const BRANDS = [
  { key: 'reasil',       re: /reasil|реасил/i },
  { key: 'сила жизни',   re: /сил[аы]\s*жизни/i },
  { key: 'август',       re: /\bавгуст\b|avgust|танрек/i },
  { key: 'башинком',     re: /башинком|башинк|гуми(?:\b|-omi|омi)|gumi/i },
  { key: 'fertika',      re: /fertika|фертика/i },
  { key: 'joy',          re: /\bjoy\b|джой/i },
  { key: 'инта-вир',     re: /инта[- ]?вир|inta[- ]?vir/i },
  { key: 'биотехнологии',re: /биотехнолог|биомастер|biomaster/i },
  { key: 'зелёная аптека',re: /зел[её]на[яй]\s*аптек/i },
  { key: 'здравень',     re: /здравень/i },
  { key: 'osmocote',     re: /osmocote|осмокот/i },
  { key: 'bona forte',   re: /bona\s*forte|бона\s*форте|бонафорте/i },
  { key: 'fasco',        re: /fasco|фаско/i },
]
const detectBrand = name => BRANDS.find(b => b.re.test(name))?.key ?? null

// Бренд → бренд-сайт. mode:'bitrix' (HTML рендерится сервером) | 'spa' (данных в HTML нет → письмо).
// image_status: 'approved_dealer' (LETTO) | 'draft' (бренд-сайт).
const BRAND_SITE = {
  'reasil':      { domain: 'silazhizni.ru', mode: 'bitrix' },
  'сила жизни':  { domain: 'silazhizni.ru', mode: 'bitrix' },
  'башинком':    { domain: 'bashinkom.ru',  mode: 'bitrix' },
  'август':      { domain: 'avgust.com',    mode: 'spa'    }, // SPA: скорее not_found → письмо
}
// Здравень/Osmocote/BonaForte и пр. — только через LETTO (нет своего удобного офсайта-каталога).

// ═══════════════════════════════════════════════════════════════════════════════
// НОРМАЛИЗАЦИЯ / РАЗМЕР-ВЕС  (строгий матч как у удобрений)
// ═══════════════════════════════════════════════════════════════════════════════
const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е')
  .replace(/[«»"'()«»,.;:/\\\-*×_]+/g, ' ').replace(/\s+/g, ' ').trim()  // дефис/× тоже разделитель (эпин-экстра → эпин экстра)
// generic-агро шум: не должен ни набирать score, ни становиться ключевым токеном
const STOP = new Set(['для', 'шт', 'упак', 'набор', 'удобрение', 'удобрения', 'средство', 'средства',
  'препарат', 'стимулятор', 'биостимулятор', 'регулятор', 'роста', 'рост', 'развития', 'защита',
  'защиты', 'растений', 'растения', 'концентрат', 'эффект', 'эффектом', 'and', 'the'])
const toks = s => new Set(norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w)))
// лёгкий стем (5-симв. префикс) гасит русскую морфологию: «рассада/рассады»→«расса»,
// «таблетки»→«табле». Матч/IDF работают по стемам, не по точным словоформам.
const STEM = w => (w.length >= 5 ? w.slice(0, 5) : w)
const prefs = s => new Set([...toks(s)].map(STEM))

// все веса/объёмы строки → массив каноничных значений (мг·эквивалент): г, кг→×1000; мл, л→×1000.
// строгий матч: если у кандидата есть вес, отличный от веса карточки → НЕ матчить.
const UNIT_RE = /(\d+[.,]?\d*)\s*(кг|г(?:р)?|мл|л|ml|kg|gr?|l)(?![а-яёa-z])/gi
function weights(s) {
  const out = []
  let m
  const re = new RegExp(UNIT_RE.source, 'gi')
  while ((m = re.exec(String(s ?? '')))) {
    const v = Number(m[1].replace(',', '.'))
    const u = m[2].toLowerCase()
    const mass = /^k?g/.test(u) || /^кг?$|^гр?$/.test(u)
    const k = /^(кг|kg)$/.test(u) ? 1000 : /^(л|l)$/.test(u) ? 1000 : 1
    out.push({ raw: `${m[1]}${m[2]}`, kind: mass ? 'mass' : 'vol', canon: Math.round(v * k) })
  }
  return out
}
// строгое сравнение веса карточки и кандидата
function weightCompatible(cardW, candW) {
  if (!cardW.length || !candW.length) return 'unknown'   // нет данных — не угадываем, но и не рубим жёстко
  const cset = new Set(cardW.map(w => `${w.kind}:${w.canon}`))
  const hit = candW.some(w => cset.has(`${w.kind}:${w.canon}`))
  if (hit) return 'match'
  return 'mismatch'                                       // другой вес/фасовка → not_found
}

// ═══════════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ 1: КРАУЛ LETTO  (разделы удобрений/грунта/защиты → индекс {title → url})
// letto.ru — Bitrix, листинги рендерятся сервером. Тянем HTML через H.fetchHtml.
// ═══════════════════════════════════════════════════════════════════════════════
const LETTO = 'https://www.letto.ru'
// Корни дерева агро-каталога (проверены на live: см. discoverChildren).
// Под каждым: leaf-подразделы (удобрения/грунты/стимуляторы/фунгициды/…) → товары.
// (поиск /search/ на letto AJAX — в исходном HTML товаров нет, поэтому только краул разделов.)
const LETTO_ROOTS = [
  '/catalog/sad_i_ogorod/sredstva_zashchity_rasteniy/',          // защита: фунгициды/инсектициды/гербициды
  '/catalog/sad_i_ogorod/tovary_dlya_rassady_i_rosta_rasteniy/', // грунты, удобрения, (био)стимуляторы, дренаж
  '/catalog/ot_nasekomykh_i_gryzunov/',                          // инсектициды/родентициды
]
const MAX_PAGES = 15

// карточка товара letto (Aspro): <div class="item-title"><link itemprop="url" href="URL"><a>ЗАГОЛОВОК</a>
function parseProducts(html) {
  const out = []
  const re = /<div class="item-title">\s*<link itemprop="url" href="([^"]+)">\s*<a[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(html))) {
    const url = LETTO + m[1]
    const title = m[2].replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"').replace(/&laquo;|&raquo;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim()
    if (title) out.push({ url, title })
  }
  return out
}
// дочерние разделы на один сегмент глубже корня (leaf-категории)
const discoverChildren = (html, rootPath) =>
  [...new Set([...html.matchAll(new RegExp(`href="(${rootPath}[a-z0-9_]+/)"`, 'g'))].map(m => m[1]))]

// краул раздела с пагинацией → товары (дедуп по url через seen)
async function crawlSection(path, seen, index) {
  let added = 0
  for (let pg = 1; pg <= MAX_PAGES; pg++) {
    const url = `${LETTO}${path}${pg > 1 ? `?PAGEN_1=${pg}` : ''}`
    let html
    try { html = await H.fetchHtml(url, { vpsFallback: true }) }
    catch { break }
    const items = parseProducts(html)
    let fresh = 0
    for (const it of items) {
      if (seen.has(it.url)) continue
      seen.add(it.url); index.push({ ...it, pset: prefs(it.title), w: weights(it.title) }); fresh++; added++
    }
    if (fresh === 0) break                               // пагинация исчерпана/закольцевалась
    await H.sleep(180)
  }
  return added
}

// рекурсивный краул: корень → leaf-разделы → товары (+ товары на самих landing-страницах)
async function crawlLetto() {
  const index = [], seen = new Set()
  for (const root of LETTO_ROOTS) {
    let land
    try { land = await H.fetchHtml(LETTO + root, { vpsFallback: true }) }
    catch { console.error(`  LETTO ${root}: недоступен`); continue }
    const leaves = discoverChildren(land, root)
    let added = await crawlSection(root, seen, index)   // товары прямо на landing
    for (const leaf of leaves) { added += await crawlSection(leaf, seen, index); await H.sleep(120) }
    console.error(`  LETTO ${root.split('/').slice(-2)[0]}: +${added} (leaves ${leaves.length})`)
    await H.sleep(150)
  }
  console.error(`LETTO индекс: ${index.length} карточек`)
  return index
}

// поиск на бренд-сайте (best-effort, generic Bitrix-search). SPA → пусто → письмо.
async function brandSiteSearch(name, site) {
  if (site.mode === 'spa') return { spa: true, cands: [] }
  const q = encodeURIComponent(name.replace(/\s+/g, ' ').trim().slice(0, 80))
  for (const path of [`/search/?q=${q}`, `/search/index.php?q=${q}`, `/?s=${q}`]) {
    try {
      const html = await H.fetchHtml(`https://${site.domain}${path}`, { vpsFallback: true })
      const cands = parseListingGeneric(html, site.domain)
      if (cands.length) return { spa: false, cands }
    } catch { /* следующий путь */ }
  }
  return { spa: false, cands: [] }
}
// generic: любые внутренние ссылки-карточки с заголовком (для бренд-сайтов)
function parseListingGeneric(html, domain) {
  const out = []
  const re = /<a[^>]+href="((?:https?:\/\/[^"]*?)?\/[a-z0-9_\-/]+?\/)"[^>]*>([^<]{4,140})<\/a>/gi
  let m
  while ((m = re.exec(html))) {
    let url = m[2] && /catalog|product|tovar|good|item/i.test(m[1]) ? m[1] : null
    if (!url) continue
    if (!/^https?:/.test(url)) url = `https://${domain}${url}`
    const title = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim()
    if (!/[а-яa-z]/i.test(title)) continue
    out.push({ url, title, pset: prefs(title), w: weights(title) })
  }
  const byUrl = new Map()
  for (const it of out) if (!byUrl.has(it.url)) byUrl.set(it.url, it)
  return [...byUrl.values()]
}

// ═══════════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ 2: МАТЧ  (бренд + продукт + ВЕС/ОБЪЁМ строго)
// ═══════════════════════════════════════════════════════════════════════════════
function bestMatch(product, cands, df) {
  const cardPset = [...prefs(product.name)]
  const cardW = weights(product.name)
  const brand = detectBrand(product.name)
  // IDF-вес стема: редкий (≈имя продукта: «рибав/циркон/экопин») весит много, частый (generic) ≈ 0.
  // НЕ делаем один токен обязательным — редкое слово может быть производителем в скобках
  // («СТРАДА», «GREEN BELT»), которого у дилера в заголовке нет. Распознавание идёт по СУММЕ.
  const rare = stem => { const d = df?.get(stem) ?? 1; return d <= 2 ? 5 : d <= 6 ? 3 : d <= 20 ? 2 : 1 }
  let best = null, bestScore = 0, tie = false
  for (const it of cands) {
    // вес: «другой вес» рубит кандидата сразу
    const wc = weightCompatible(cardW, it.w)
    if (wc === 'mismatch') continue
    // бренд обязателен, если он определён у карточки
    if (brand && !norm(it.title).includes(brand) && !it.pset.has(STEM(brand.split(' ')[0]))) continue
    // IDF-взвешенное пересечение значимых токенов
    let s = 0
    for (const w of cardPset) if (it.pset.has(w)) s += rare(w)
    if (s === 0) continue                                // ни одного общего значимого токена → не кандидат
    if (brand) s += 5
    if (wc === 'match') s += 4
    if (s > bestScore) { bestScore = s; best = it; best._wc = wc; tie = false }
    else if (s === bestScore && s > 0 && best && it.url !== best.url) tie = true
  }
  // порог: с брендом строже; без бренда нужен заметный распознаваемый сигнал (имя+вес или 2+ слова)
  if (!best || bestScore < (brand ? 9 : 7)) return { ok: false, reason: 'нет уверенного совпадения бренд+продукт+вес' }
  if (tie) return { ok: false, reason: 'неоднозначно (несколько равных кандидатов)' }
  return { ok: true, cand: best, score: bestScore, weight_match: best._wc }
}

// ═══════════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ 3: РАЗБОР СТРАНИЦЫ  (hero макс. разрешения + характеристики)
// ═══════════════════════════════════════════════════════════════════════════════
// resize_cache thumbnail → оригинал (как в пилоте letto)
function toOriginal(src) {
  const m = src.match(/\/upload\/resize_cache\/iblock\/([a-f0-9]{3})\/(?:([a-z0-9]{32})\/)?\d+_\d+_[0-9a-f]+\/(.+)$/i)
  if (!m) return null
  return `${LETTO}/upload/iblock/${m[1]}/${m[2] ? m[2] + '/' : ''}${m[3]}`
}
const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
  return m ? m[1] : null
}
const stripTags = h => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

function parseProductPage(html, baseUrl) {
  const res = { title: null, image: null, specs: {}, text: '' }
  // JSON-LD: брать ТОЛЬКО узел @type=Product (на letto есть Organization/LocalBusiness
  // с фото магазина — их image/name подхватывать НЕЛЬЗЯ).
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim())
      const arr = Array.isArray(j) ? j : [j]
      const node = arr.find(x => /product/i.test(x?.['@type'] || ''))
      if (node) {
        res.title ||= node.name || null
        const img = Array.isArray(node.image) ? node.image[0] : node.image
        if (img && !res.image) res.image = img
        if (node.description) res.text = node.description
        for (const p of node.additionalProperty || []) if (p?.name && p?.value) res.specs[p.name] = String(p.value)
      }
    } catch { /* битый ld+json */ }
  }
  // hero: og:image (на letto — оригинал товара) приоритетнее → затем Product-JSON-LD → галерея
  const og = meta(html, 'og:image')
  if (og) res.image = og
  res.title ||= meta(html, 'og:title') || (html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ?? null)
  if (!res.image) {
    const g = [...html.matchAll(/(?:data-src|src)="([^"]*resize_cache\/iblock[^"]+)"/gi)].map(x => x[1])
      .filter(s => !/\/(80|120|150)_/.test(s))
    if (g[0]) res.image = toOriginal(g[0]) || g[0]
  }
  if (res.image && /resize_cache/.test(res.image)) res.image = toOriginal(res.image) || res.image
  if (res.image && !/^https?:/.test(res.image)) res.image = new URL(res.image, baseUrl).href
  // характеристики: блоки свойств Bitrix
  for (const it of html.matchAll(/<(?:div|tr|li)[^>]*class="[^"]*(?:propert|char|spec)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|tr|li)>/gi)) {
    const inner = it[1]
    const cells = [...inner.matchAll(/<(?:span|td|div)[^>]*>([\s\S]*?)<\/(?:span|td|div)>/gi)].map(c => stripTags(c[1])).filter(Boolean)
    if (cells.length >= 2) { const k = cells[0].replace(/[:\s]+$/, ''); if (k && !(k in res.specs)) res.specs[k] = cells[1] }
  }
  // запасной текст для LLM
  if (!res.text) res.text = (meta(html, 'description') || '').slice(0, 600)
  return res
}

// ═══════════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ 4: ТЕКСТ  (description + short_description по H.CONTRACT, без выдумок)
// факты из названия + снятых specs; LLM не придумывает NPK/дозировки.
// ═══════════════════════════════════════════════════════════════════════════════
function nameFacts(name) {
  const f = {}
  const npk = name.match(/\b(\d{1,2})\s*[-–:]\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})\b/)
  if (npk) f.npk = `${npk[1]}-${npk[2]}-${npk[3]}`
  const w = weights(name)[0]
  if (w) f.weight = w.raw
  for (const [k, v] of [['гранул', 'гранулы'], ['жидк', 'жидкое'], ['палочк', 'палочки'], ['порош', 'порошок'], ['таблет', 'таблетки'], ['спрей', 'спрей'], ['гель', 'гель'], ['концентрат', 'концентрат']])
    if (new RegExp(k, 'i').test(name)) { f.form = v; break }
  return f
}

async function genText(name, specs, facts, pageText) {
  if (!GEMINI_API_KEY) return null
  const specLines = Object.entries(specs).slice(0, 20).map(([k, v]) => `${k}: ${v}`).join('\n') || '—'
  const known = [facts.npk && `NPK: ${facts.npk}`, facts.weight && `Фасовка: ${facts.weight}`, facts.form && `Форма: ${facts.form}`].filter(Boolean).join('; ') || 'нет подтверждённых числовых характеристик'
  const prompt = `${H.CONTRACT}

────────────────────────────────────────
ЗАДАЧА: по данным ниже сгенерируй short_description и description для агро-товара (удобрение/защита/стимулятор/грунт).
Тип товара — НЕ горшок: pot_* не заполнять, характеристики идут ТОЛЬКО в текст (раздел 2 контракта).

Название (якорь 1С): "${name}"
Подтверждённые факты (числа бери ТОЛЬКО отсюда, НЕ выдумывай NPK/дозировки): ${known}
Характеристики со страницы источника:
${specLines}
Текст со страницы источника (контекст, можно перефразировать, без копипаста SEO):
${(pageText || '').slice(0, 1200)}

Верни ТОЛЬКО валидный JSON без markdown:
{"short_description":"1 строка: тип + ключевой состав/назначение/фасовка","description":"2–4 связных предложения по разделу 3 контракта, по-русски, без восклицаний"}`
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } }),
  })
  if (!resp.ok) throw new Error(`Gemini ${resp.status}`)
  const t = (await resp.json()).candidates?.[0]?.content?.parts?.[0]?.text
  if (!t) throw new Error('пустой ответ Gemini')
  return JSON.parse(t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim())
}

// ═══════════════════════════════════════════════════════════════════════════════
// ОБОГАЩЕНИЕ ОДНОГО ТОВАРА: матч → разбор → фото → текст → H.writeDraft
// ═══════════════════════════════════════════════════════════════════════════════
async function enrichOne(p, lettoIndex, df, manifest) {
  const brand = detectBrand(p.name)
  const rec = { id: p.id, sub: p.subcategory, name: p.name.slice(0, 60), brand, found: false, source: null, url: '', reason: '' }
  try {
    // 1) кандидаты: LETTO-индекс → бренд-сайт (LETTO /search AJAX, поэтому только индекс)
    let cands = bestMatch(p, lettoIndex, df)
    let source = 'letto', image_status = 'approved_dealer'
    if (!cands.ok && brand && BRAND_SITE[brand]) {
      const site = BRAND_SITE[brand]
      const bs = await brandSiteSearch(p.name, site)
      if (bs.spa) { rec.reason = `бренд-сайт ${site.domain} — SPA, данных в HTML нет → нужно письмо поставщику`; manifest.push(rec); return }
      if (bs.cands.length) { const bm = bestMatch(p, bs.cands, df); if (bm.ok) { cands = bm; source = site.domain; image_status = 'draft' } }
    }
    if (!cands.ok) { rec.reason = cands.reason || 'кандидаты не найдены'; manifest.push(rec); return }

    rec.source = source; rec.url = cands.cand.url; rec.weight_match = cands.weight_match; rec.score = cands.score

    // 2) разбор страницы товара
    const html = await H.fetchHtml(cands.cand.url, { vpsFallback: true })
    const page = parseProductPage(html, cands.cand.url)
    // финальная проверка по полному заголовку карточки источника (строгий вес)
    if (page.title) {
      const wc = weightCompatible(weights(p.name), weights(page.title))
      if (wc === 'mismatch') { rec.reason = `вес на странице не совпал: "${page.title.slice(0, 50)}"`; manifest.push(rec); return }
    }
    if (!page.image) { rec.reason = 'на странице нет hero-фото'; manifest.push(rec); return }

    // минералка/сыпучка без бренда → type_generic (только в лог: колонки нет в аллоулисте)
    rec.type_generic = !brand && /калий|кальц|селитр|сульфат|суперфосфат|карбамид|аммиач|нитрат|минерал/i.test(p.name)

    // 3) ФОТО: оригинал → processImg (фон НЕ удаляем) → VPS (raw + draft)
    const rawBuf = await H.fetchImg(page.image, { vpsFallback: true })
    if (!/^(ffd8|89504e47)/.test(rawBuf.subarray(0, 4).toString('hex'))) { rec.reason = 'hero не похож на JPEG/PNG'; manifest.push(rec); return }
    const ext = page.image.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
    const draftBuf = await H.processImg(rawBuf)
    rec.low_res = (draftBuf.length < 25_000)            // ориентир «маловато» → лог

    // 4) ТЕКСТ
    const facts = nameFacts(p.name)
    let text = null
    try { text = await genText(p.name, page.specs, facts, page.text) }
    catch (e) { rec.text_err = String(e).slice(0, 80) }

    if (DRY) {
      rec.found = true; rec.dry = true
      rec.preview = { image: page.image, short: text?.short_description, specs: Object.keys(page.specs).length,
        hero_kb: (draftBuf.length / 1024 | 0), raw_kb: (rawBuf.length / 1024 | 0) }
      console.log(`  DRY ok ${p.id} [${source}] ${rec.name} -> ${page.image.split('/').pop()} | hero ${rec.preview.hero_kb}KB | ${text?.short_description ?? '(без текста)'}`)
      manifest.push(rec); return
    }

    const rawUrl   = await H.uploadVPS(rawBuf,   `${p.id}_draft_raw.${ext}`)
    const draftUrl = await H.uploadVPS(draftBuf, `${p.id}_draft.jpg`)
    const draft = {
      image_draft_url: draftUrl,
      image_draft_raw_url: rawUrl,
      image_status,                                       // approved_dealer (LETTO) | draft (бренд-сайт)
      image_source: cands.cand.url,
    }
    if (text?.short_description) draft.short_description = text.short_description
    if (text?.description) draft.description = text.description
    const w = await H.writeDraft(p.id, draft)
    rec.found = !!w.updated
    rec.fields = w.fields
    if (!w.updated) rec.reason = w.error || w.reason || 'writeDraft не обновил'
    console.log(`  ${rec.found ? 'OK ' : 'WR '}${p.id} [${source}/${image_status}] ${rec.name} | ${(draftBuf.length / 1024 | 0)}KB${rec.low_res ? ' low_res' : ''}${rec.type_generic ? ' type_generic' : ''}`)
  } catch (e) {
    rec.reason = `ошибка: ${String(e).slice(0, 100)}`
    console.log(`  ERR ${p.id} ${rec.name}: ${rec.reason}`)
  }
  manifest.push(rec)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: насквозь по очереди, READ-BACK после КАЖДОЙ subcategory
// ═══════════════════════════════════════════════════════════════════════════════
const manifest = []
const lettoIndex = await crawlLetto()
// IDF: частота токена в индексе (для выбора редкого ключевого токена в bestMatch)
const df = new Map()
for (const it of lettoIndex) for (const t of it.pset) df.set(t, (df.get(t) ?? 0) + 1)

for (const step of QUEUE) {
  if (ONLY && step.sub !== ONLY) continue
  console.log(`\n═══ ${step.sub} ═══`)
  let items = await H.worklist(step.filter)
  if (IDS) items = items.filter(p => IDS.includes(p.id))
  items = items.slice(0, LIMIT)
  console.log(`scope: ${items.length} товаров без фото`)
  for (const p of items) { await enrichOne(p, lettoIndex, df, manifest); await H.sleep(DELAY_MS) }

  // READ-BACK по той же subcategory
  const rb = await H.readBack(step.filter)
  console.log(`\n── READ-BACK ${step.sub} ──`)
  console.log(`count=${rb.count} | found(image_draft_url)=${rb.found} | with_image_url=${rb.with_image_url} (должно быть 0) | with_color_images=${rb.with_color_images}`)
  console.log(`not_found: ${rb.not_found.length}`)
  for (const nf of rb.not_found.slice(0, 15)) console.log(`   • ${nf.id} ${String(nf.name).slice(0, 50)} — ${nf.reason}`)
  if (rb.not_found.length > 15) console.log(`   … ещё ${rb.not_found.length - 15}`)
  console.log('примеры (3):')
  for (const ex of rb.examples) console.log(`   ✓ ${ex.id} ${String(ex.name).slice(0, 50)} → ${ex.image_draft_url}`)
}

// сводка + ревью-файл
mkdirSync('logs', { recursive: true })
writeFileSync('logs/scrape-agro-manifest.json', JSON.stringify(manifest, null, 2), 'utf8')
const ok = manifest.filter(m => m.found).length
const spa = manifest.filter(m => /письмо/.test(m.reason || '')).length
console.log(`\n═══ ИТОГ ═══ обработано ${manifest.length} | found ${ok} | not_found ${manifest.length - ok} | требуют письма (SPA) ${spa}${DRY ? ' | DRY (в БД/VPS не писали)' : ''}`)
console.log('ревью: logs/scrape-agro-manifest.json')
