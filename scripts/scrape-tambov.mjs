// scripts/scrape-tambov.mjs — скрейпер «Керамика Тамбов» ПОВЕРХ харнеса.
// ИСТОЧНИК: дилер letto.ru (раздел keramicheskie_gorshki, бренд «тамбовская керамика»).
// Офсайт изготовителя tambov-keramika.ru припаркован (домен на продаже) — недоступен.
// Дилерское фото — временное: официалка с завода (47877@bk.ru, письмом) заменит позже,
// поэтому image_status='approved_dealer' (НЕ 'draft' изготовителя).
//
// Запуск:
//   node --env-file=.env.local scripts/scrape-tambov.mjs --dry --limit=3   # пилот без записи
//   node --env-file=.env.local scripts/scrape-tambov.mjs                   # боевой
//   node --env-file=.env.local scripts/scrape-tambov.mjs --id=5402         # один товар
//
// Архитектура — по H.CONTRACT (не дублируем). Здесь ТОЛЬКО источник-специфика:
// CRAWL (поиск letto по модели → кандидаты), MATCH (строгий: модель+размер+цвет),
// РАЗБОР (hero=og:image оригинал; диаметр/высота/объём/цвет — из slug letto, т.к.
// характеристики на странице рендерятся JS и в сыром HTML их нет).
//
// ⚠️ letto.ru отдаёт сырой HTML листинга/поиска, но размеры — в слаге товара
//    (h_17_sm / d_21_sm / 3l), как разбирал прежний пилот tmp-letto-commit.mjs.
// ⚠️ Локальная сеть в окружении режет домены — fetch с { vpsFallback:true }.

import * as H from './scrape-harness.mjs'

// ── аргументы ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null }
const DRY   = args.includes('--dry')
const LIMIT = getArg('limit') ? Number(getArg('limit')) : Infinity
const ONLY  = getArg('id') ? Number(getArg('id')) : null

// ── конфиг источника (letto.ru) ──────────────────────────────────────────────────
const SITE  = 'https://www.letto.ru'
const FETCH = { vpsFallback: true }
const BRAND_RE = /tambovskaya_keramika/i        // признак товара бренда в URL letto
const IMAGE_STATUS = 'approved_dealer'

// зоо / снято с пр-ва → not_found (добор письмом, сбыт 47877@bk.ru)
const ZOO_RE = /зоо|для\s+живот|кошк|собак|аквариум|террариум|поил|кормушк/i

// цвета: русское → транслит (как в slug letto). H.tr даёт ту же латиницу.
const COLOR_RU = ['белый','чёрный','серый','графит','коричневый','бежевый','молочный','кремовый',
  'латте','зелёный','фуксия','синий','голубой','красный','бордовый','терракот','серебро','золото',
  'бронза','антрацит','шоколад','охра','песочный','оливковый','розовый','сиреневый','фиолетовый']
const COLOR_ALIAS = { 'зеленый':'зелёный','черный':'чёрный' }       // нормализация ё/е в нашем имени

// ── утилиты разбора ───────────────────────────────────────────────────────────
const ENT = { amp:'&', lt:'<', gt:'>', quot:'"', '#039':"'", nbsp:' ', laquo:'«', raquo:'»', mdash:'—', ndash:'–', deg:'°' }
const decode = s => String(s ?? '').replace(/&(#?\w+);/g, (_, e) => ENT[e] ?? (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : `&${e};`))
const stripTags = s => decode(String(s ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const abs = href => { try { return new URL(href, SITE).href } catch { return null } }
const clean = u => (u || '').split('?')[0].split('#')[0]
const alnum = s => H.tr(s).replace(/[^a-z0-9]/g, '')         // транслит → только [a-z0-9] для сравнения слагов

// ── разбор НАШЕГО имени: модель / размер / цвет ──────────────────────────────────
// Пример: «горшки для цветов декоративные КРОКУС № 1 белый (1 СОРТ)»
//   → model='КРОКУС', size=1, color='белый'
function parseOurName(name) {
  let s = String(name ?? '').replace(/^.*?декоратив[а-яё]*\s*/i, '').trim()   // снять префикс «… декоративные»
  if (s === String(name ?? '').trim()) s = s.replace(/^горшк[а-яё]*\s+(керамическ[а-яё]+\s+)?/i, '').trim()
  const size = (s.match(/№\s*(\d+)/) || [])[1] ? Number(s.match(/№\s*(\d+)/)[1]) : null
  // цвет — известное слово в любом месте
  let color = null
  for (const c of COLOR_RU) if (new RegExp(c.replace('ё', '[её]'), 'i').test(s)) { color = c; break }
  if (!color && /зел\.?\s*трав/i.test(s)) color = 'зелёный'      // «зел.травы» — декор, базовый цвет зелёный
  // модель — до первого из [№, (, цифра, слово-цвет]
  let head = s.split(/№|\(|\d/)[0]
  for (const c of [...COLOR_RU, 'зел']) head = head.replace(new RegExp('\\b' + c.replace('ё', '[её]') + '\\w*', 'gi'), '')
  const modelTokens = head.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я\s]/gi, ' ').split(/\s+/)
    .filter(t => t && t.length > 1 && !['и','в','с','для','шт','уц','сорт','см'].includes(t))
  return { modelTokens, size, color, raw: s }
}

// ── разбор slug letto: размеры/объём/цвет/модель-токены ──────────────────────────
// gorshok_keramicheskiy_lyuks_2_zelenyy_h_17_sm_d_21_sm_3l_1_sort_tambovskaya_keramika
function parseLettoSlug(url) {
  const slug = clean(url).split('/').filter(Boolean).pop() || ''
  const num2 = (a, b) => b != null ? Number(`${a}.${b}`) : Number(a)
  const h = slug.match(/h_?(\d+)(?:_(\d+))?_?sm|h_(\d+)\b/i)
  const d = slug.match(/[_-]d_?(\d+)(?:_(\d+))?_?sm|[_-]d_(\d+)\b/i)
  const v = slug.match(/(\d+)_(\d+)l(?:[_.]|$)/i) || slug.match(/(\d+)l(?:[_.]|$)/i)
  // цвет в слаге
  let color = null
  for (const c of COLOR_RU) if (slug.includes(H.tr(c))) { color = c; break }
  return {
    slug,
    height_cm:   h ? num2(h[1] ?? h[3], h[2]) : null,
    diameter_cm: d ? num2(d[1] ?? d[3], d[2]) : null,
    volume_l:    v ? (v[2] !== undefined ? num2(v[1], v[2]) : Number(v[1])) : null,
    color,
  }
}

// ── CRAWL: поиск letto по модели → кандидаты бренда ──────────────────────────────
// Бренд-раздела/смарт-фильтра у letto нет (категория keramicheskie_gorshki = 35 стр.,
// бренды вперемешку), поиск отдаёт серверный HTML → берём кандидаты по модели.
async function lettoSearch(query) {
  const url = `${SITE}/search/?q=${encodeURIComponent(query)}`
  let html
  try { html = await H.fetchHtml(url, FETCH) } catch (e) { console.warn(`  search «${query}»: ${e.message}`); return [] }
  const out = new Map()
  for (const m of html.matchAll(/href="(\/catalog\/[^"]+\/)"/gi)) {
    const u = abs(m[1]); if (!u || !BRAND_RE.test(u)) continue
    const url2 = clean(u)
    if (!out.has(url2)) out.set(url2, { url: url2, ...parseLettoSlug(url2) })
  }
  return [...out.values()]
}

// ── MATCH: строгий. модель ∩ + размер + цвет. Сомнение → not_found ───────────────
function matchCandidate(parsed, cands) {
  if (ZOO_RE.test(parsed.raw)) return { hit: null, reason: 'зоо — добор письмом 47877@bk.ru' }
  if (parsed.modelTokens.length === 0) return { hit: null, reason: 'не извлечь модель' }
  const modTok = parsed.modelTokens.map(alnum).filter(Boolean)
  // 1) модель: все токены модели должны присутствовать в слаге
  let pool = cands.filter(c => modTok.every(t => alnum(c.slug).includes(t)))
  if (pool.length === 0) return { hit: null, reason: 'нет на letto (модель)' }
  // 2) размер №N: слаг должен кодировать <model>_<size>
  if (parsed.size != null) {
    const last = modTok[modTok.length - 1]
    const re = new RegExp(`${last}_?${parsed.size}(?:[_.]|$)`, 'i')
    const sized = pool.filter(c => re.test(alnum(c.slug).replace(last, last + '_')) || new RegExp(`${last}${parsed.size}`).test(alnum(c.slug)))
    if (sized.length) pool = sized
    else return { hit: null, reason: `размер №${parsed.size} не найден на letto` }
  }
  // 3) цвет: если у нас задан — слаг обязан кодировать тот же цвет
  if (parsed.color) {
    const ctr = H.tr(parsed.color)
    const colored = pool.filter(c => c.color === parsed.color || alnum(c.slug).includes(alnum(ctr)))
    if (colored.length) pool = colored
    else return { hit: null, reason: `цвет «${parsed.color}» не найден на letto` }
  }
  if (pool.length === 1) return { hit: pool[0], reason: null }
  return { hit: null, reason: `неоднозначно (${pool.length}): ${pool.slice(0, 3).map(c => c.slug).join(' | ')}` }
}

// ── РАЗБОР СТРАНИЦЫ: hero = og:image оригинал ────────────────────────────────────
function parseHero(html) {
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
  if (og && /\/upload\/iblock\//.test(og[1])) return abs(og[1])
  // фолбэк: крупнейший оригинал iblock
  const imgs = [...html.matchAll(/(?:data-src|src|href)="([^"]*\/upload\/iblock\/[^"]+\.(?:jpe?g|png))"/gi)]
    .map(m => abs(m[1])).filter(u => u && BRAND_RE.test(u))
  return imgs[0] || (og ? abs(og[1]) : null)
}

// ── Gemini: описание ТОЛЬКО из фактов ─────────────────────────────────────────────
const GEMINI_MODEL = (process.env.NEXT_PUBLIC_GEMINI_MODEL || 'models/gemini-flash-lite-latest').replace(/^models\//, '')
const GEMINI_KEY = process.env.GOOGLE_GEMINI_API_KEY

function buildPrompt(name, f) {
  const known = ['Тип: горшок (кашпо)', 'Материал: керамика',
    f.pot_color ? `Цвет: ${f.pot_color}` : null,
    f.pot_diameter ? `Диаметр: ${f.pot_diameter} см` : null,
    f.pot_height ? `Высота: ${f.pot_height} см` : null,
    f.volume_l ? `Объём: ${f.volume_l} л` : null,
  ].filter(Boolean).join('; ')
  return `Ты пишешь карточку керамического горшка (производитель «Тамбовская керамика») для оптового магазина. Товар: "${name}".
ПОДТВЕРЖДЁННЫЕ ФАКТЫ (использовать как есть, НЕ выдумывать размеры/объём/цвет): ${known}.
ФОРМАТ:
- short_description: 1 строка (тип + ключевой размер/объём). Пример: «Горшок керамический, Ø21 см, 3 л».
- description: 2–4 предложения связного текста про форму/декор/цвет. Без восклицаний и «лучший/№1». Упомяни «Тамбовскую керамику».
- Русский язык. Не упоминай числа, которых нет в фактах.
Верни ТОЛЬКО валидный JSON: { "short_description": "...", "description": "..." }`
}

async function genDescription(name, f) {
  if (!GEMINI_KEY) return null
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(name, f) }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } }),
    })
    if (!r.ok) throw new Error(`Gemini ${r.status}`)
    const txt = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text
    return txt ? JSON.parse(txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) : null
  } catch (e) { console.warn(`   Gemini: ${e.message}`); return null }
}

// ── --probe=<letto-url>: sanity-проверка found-пути на конкретной карточке ────────
// Прогоняет реальные parseLettoSlug / parseHero / processImg, ничего не пишет.
async function probe(url) {
  const slug = parseLettoSlug(url)
  const html = await H.fetchHtml(clean(url), FETCH)
  const hero = parseHero(html)
  let kb = '?'
  try { kb = Math.round((await H.processImg(await H.fetchImg(hero, FETCH))).length / 1024) } catch (e) { kb = `err:${e.message}` }
  console.log(`PROBE ${slug.slug}\n  hero=${hero}\n  hero=${kb}KB | d=${slug.diameter_cm} h=${slug.height_cm} v=${slug.volume_l} color=${slug.color}`)
}

// ── основной цикл ────────────────────────────────────────────────────────────────
async function main() {
  const probeUrl = getArg('probe')
  if (probeUrl) return probe(probeUrl)
  console.log(`[scrape-tambov→letto] dry=${DRY} limit=${LIMIT === Infinity ? '∞' : LIMIT}${ONLY ? ` id=${ONLY}` : ''}`)

  let work = await H.worklist(q => q.eq('supplier', 'Керамика Тамбов'))
  if (ONLY) work = work.filter(p => p.id === ONLY)
  work = work.slice(0, LIMIT)
  console.log(`WORKLIST: товаров без фото: ${work.length}\n`)
  if (work.length === 0) { console.log('Нечего обрабатывать.'); return }

  let ok = 0, nf = 0
  const found = [], notFound = []
  for (const p of work) {
    const tag = `[${p.id}] ${p.name.slice(0, 50)}`
    const parsed = parseOurName(p.name)
    const modelStr = parsed.modelTokens.join(' ') || '?'

    // CRAWL: поиск кандидатов по модели (+ бренд для точности)
    const cands = await lettoSearch(`${modelStr} тамбовская керамика`)
    const { hit, reason } = matchCandidate(parsed, cands)
    if (!hit) { console.log(`NF  ${tag} — ${reason}`); notFound.push({ id: p.id, model: modelStr, reason }); nf++; await H.sleep(400); continue }

    try {
      const html = await H.fetchHtml(hit.url, FETCH)
      const hero = parseHero(html)
      if (!hero) { console.log(`NF  ${tag} — нет og:image`); notFound.push({ id: p.id, model: modelStr, reason: 'нет og:image' }); nf++; continue }

      const pot_color = parsed.color ? (COLOR_ALIAS[parsed.color] || parsed.color) : hit.color
      const facts = { pot_color, pot_diameter: hit.diameter_cm, pot_height: hit.height_cm, volume_l: hit.volume_l }
      const desc = await genDescription(p.name, facts)

      const draft = {
        image_status: IMAGE_STATUS,        // дилерское фото (временное)
        image_source: hit.url,             // URL letto
        source_url: hit.url,               // якорь для пере-синхронизации
        pot_material: 'керамика',
      }
      if (pot_color) { draft.pot_color = pot_color; draft.colors = [pot_color] }
      if (hit.diameter_cm != null) draft.pot_diameter = hit.diameter_cm
      if (hit.height_cm != null) draft.pot_height = hit.height_cm
      if (hit.volume_l != null) draft.volume_l = hit.volume_l
      if (desc?.description) draft.description = desc.description
      if (desc?.short_description) draft.short_description = desc.short_description

      if (DRY) {
        // в dry качаем hero ради размера KB (но не заливаем и не пишем в БД)
        let kb = '?'
        try { kb = Math.round((await H.processImg(await H.fetchImg(hero, FETCH))).length / 1024) } catch {}
        console.log(`OK  ${tag}\n     модель=${modelStr} | hero=${kb}KB | цветов=${draft.colors ? draft.colors.length : 0} | d=${hit.diameter_cm ?? '-'} h=${hit.height_cm ?? '-'} v=${hit.volume_l ?? '-'} color=${pot_color ?? '-'}\n     ${hit.url}`)
        found.push({ id: p.id, model: modelStr, kb, colors: draft.colors ? draft.colors.length : 0 })
        ok++; await H.sleep(400); continue
      }

      // боевой путь
      const rawBuf = await H.fetchImg(hero, FETCH)
      draft.image_draft_raw_url = await H.uploadVPS(rawBuf, `${p.id}_draft_raw.jpg`)
      draft.image_draft_url     = await H.uploadVPS(await H.processImg(rawBuf), `${p.id}_draft.jpg`)
      const res = await H.writeDraft(p.id, draft)
      if (!res.updated) { console.log(`ERR ${tag} — writeDraft: ${res.error || res.reason}`); notFound.push({ id: p.id, model: modelStr, reason: `writeDraft: ${res.error || res.reason}` }); nf++; continue }
      console.log(`OK  ${tag} → d=${hit.diameter_cm ?? '-'} h=${hit.height_cm ?? '-'} v=${hit.volume_l ?? '-'} color=${pot_color ?? '-'}`)
      found.push({ id: p.id, model: modelStr }); ok++
    } catch (e) {
      console.log(`ERR ${tag} — ${String(e.message).slice(0, 120)}`); notFound.push({ id: p.id, model: modelStr, reason: `error: ${String(e.message).slice(0, 80)}` }); nf++
    }
    await H.sleep(400)
  }

  console.log(`\n=== ИТОГ: found=${ok}  not_found/err=${nf} ===`)
  if (found.length) { console.log('FOUND:'); for (const f of found) console.log(`  ${f.id} ${f.model} | hero=${f.kb ?? '-'}KB | цветов=${f.colors ?? '-'}`) }
  if (notFound.length) { console.log('NOT_FOUND:'); for (const n of notFound) console.log(`  ${n.id} [${n.model}] — ${n.reason}`) }

  if (!DRY) {
    console.log('\n=== READ-BACK (supplier=Керамика Тамбов) ===')
    const rb = await H.readBack(q => q.eq('supplier', 'Керамика Тамбов'))
    console.log(`count=${rb.count} | found(image_draft_url)=${rb.found} | not_found=${rb.not_found.length}`)
    console.log(`with_image_url=${rb.with_image_url} (должно быть 0) | with_color_images=${rb.with_color_images}`)
    console.log('примеры:'); for (const e of rb.examples) console.log(`  ${e.id} ${String(e.name).slice(0, 40)} → ${e.image_draft_url}`)
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
