// scripts/scrape-harness.mjs — общий модуль для сайт-скрейперов расходки.
// Запуск скриптов, которые его импортируют: node --env-file=.env.local scripts/<scraper>.mjs
//
// Принципы:
//  • Пишем ТОЛЬКО черновики (image_draft_*/атрибуты), НИКОГДА не трогаем витрину
//    (image_url/is_active/qty/price) — см. writeDraft (жёсткий аллоулист).
//  • Картинки самохостятся на VPS (/srv/media/products → /assets-9f2a7c/products),
//    как в пилотах (tmp-alt/letto). Фон не удаляем.
//  • VPS используется ТОЛЬКО на чтение (curl) и для заливки картинок (scp). Никаких
//    записей в БД/сервисы на VPS.
//
// ⚠️ filterSQL: рантайм скриптов работает через PostgREST (supabase-js), прямого
//    SQL-подключения к БД нет (в .env.local только URL+ключи, без connection string),
//    а заводить generic exec_sql RPC небезопасно (это та самая дыра, что мы закрывали).
//    Поэтому worklist/readBack принимают КОЛБЭК-фильтр (q) => q — билдер supabase-js,
//    эквивалент WHERE. Пример: worklist(q => q.eq('subcategory','vases'))

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { execFileSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

export const UA = { 'User-Agent': 'Mozilla/5.0 Chrome/120' }
export const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── CONTRACT: единый контракт обогащения для ВСЕХ скрейперов ───────────────────
// Каждый конфиг скрейпера ссылается на H.CONTRACT (документация + текст для LLM,
// который генерит description/short_description). Цель карточки: (а) качественное
// фото и (б) характеристики/описание — и то, и другое ТОЛЬКО в черновики.
export const CONTRACT = `
КОНТРАКТ ОБОГАЩЕНИЯ КАРТОЧЕК (расходка). Цель: качественное ФОТО + ХАРАКТЕРИСТИКИ/ОПИСАНИЕ → в ЧЕРНОВИКИ.

1. ФОТО
 • Геро: главное предметное фото (на белом/светлом), максимальное разрешение со страницы
   (брать /750/ или оригинал, НЕ /426/-thumbnail). Минимум ~800px по короткой стороне;
   меньше — брать, но логировать low_res.
 • Приоритет источника: производитель/поставщик > дилер. Фон НЕ удалять.
 • Вариации цвета: если товар представлен в нескольких цветах/тонах — собрать КАЖДЫЙ →
   color_images{"<цвет по-русски>":"<vps-url>"} + colors[]. Имя файла — через H.tr.
 • При неточном матче чужое фото НЕ подставлять → not_found.

2. ХАРАКТЕРИСТИКИ (по типу товара)
 • Горшки/кашпо/керамика: материал, цвет, диаметр, высота, объём(л), дренаж/поддон →
   pot_material / pot_color / pot_diameter / pot_height / volume_l + связный текст в description.
 • Вазы (стекло): тип (шар/бокал/цилиндр/подсвечник), диаметр, высота, объём(л), стекло/обработка →
   ТОЛЬКО description + short_description (НЕ pot_*); volume_l можно.
 • Удобрения/защита/стимуляторы: состав/NPK, назначение, форма, вес/объём, дозировка →
   description + short_description. pot_* НЕ трогать. Сыпучка/минералка без бренда → type_generic.
 • Грунт: состав, назначение (для каких растений), объём(л), pH если есть → description. pot_* нет.
 • Упаковка (плёнка/бумага/лента/пакет/салфетка): материал, плотность (гр/мкр), ширина (мм/см),
   длина (м), узор/коллекция, цвет → description + short_description; цвета → color_images.

3. ТЕКСТ (единый формат)
 • short_description: 1 строка, ёмко (тип + ключевой размер/объём/состав).
   Пример: «Кашпо керамическое, Ø18 см, 2 л, матовая глазурь».
 • description: 2–4 предложения связного текста (НЕ простыня характеристик, НЕ копипаст SEO-полотна).
   Производитель — упомянуть в тексте. Без маркетинговых восклицаний.
 • Язык русский. Не выдумывать данные, которых нет на странице (лучше короче, чем додумать).

4. МАТЧ И ГРАНИЦЫ
 • Строгий матч: бренд + продукт + размер/вес/объём/узор/модель. Сомнение → not_found, не угадывать.
 • НИКОГДА не писать: image_url, is_active, qty, price. Только draft-поля (через H.writeDraft).
 • Идти НАСКВОЗЬ по worklist, не стопиться на вопросы. not_found логировать с причиной и дальше.

5. READ-BACK (одинаковый у всех, через H.readBack): count; найдено / not_found с причинами;
   image_url пуст у всех (=0); сколько с color_images и сколько цветов; 3 примера с распечаткой полей.
`.trim()

// ── VPS / медиа-хостинг ───────────────────────────────────────────────────────
const VPS_HOST = 'deploy@109.235.118.214'
const VPS_KEY = 'deploy_vps.key'           // относительно корня репо (откуда запускают скрипт)
const VPS_MEDIA = '/srv/media/products'
const ASSETS_BASE = 'https://uralskflowers.kz/assets-9f2a7c/products'
const SSH_ENV = { ...process.env, HOME: '/c/Users/Владелец' } // ssh/scp ищут ключ/known_hosts тут (как в пилотах)
const sshOpts = ['-i', VPS_KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=20']

// ── транслит для имён файлов цвета (ё→e: «зелёный»→zelenyy, как в пилоте 6559) ──
const TR = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',
  м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',
  ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
export const tr = s => String(s ?? '').toLowerCase().split('').map(c => TR[c] ?? c).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// applyFilter: колбэк (q)=>q или ничего
const applyFilter = (q, filter) => (typeof filter === 'function' ? filter(q) : q)

// ── worklist: товары для обогащения (без фото, не плейсхолдеры) ────────────────
// Эквивалент: SELECT id,name,price,subcategory FROM products
//   WHERE <filter> AND (image_url IS NULL OR image_url='') AND NOT(price=555 AND qty=555)
//   — is_active НЕ фильтруем. Пагинация .range() (PostgREST max_rows=1000).
export async function worklist(filter) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from('products').select('id,name,price,subcategory')
      .or('image_url.is.null,image_url.eq.')      // фото нет
      .or('price.neq.555,qty.neq.555')            // NOT(price=555 AND qty=555) по Де Моргану
      .order('id').range(from, from + 999)
    q = applyFilter(q, filter)
    const { data, error } = await q
    if (error) throw new Error(`worklist: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// ── fetchHtml / fetchImg: локальный fetch, опционально VPS-fallback (только чтение) ─
function vpsCurl(url, binary) {
  if (/'/.test(url)) throw new Error('fetch: url содержит кавычку, отклонено')
  // ssh deploy@vps "curl -sSL --max-time 20 '<url>'" — GET, без записи на сервер.
  // -S: при -s показывать причину ошибки в stderr (иначе сбой приходит немым «Command failed»).
  const args = [...sshOpts, VPS_HOST, `curl -sSL --max-time 20 '${url}'`]
  try {
    return execFileSync('ssh', args, {
      env: SSH_ENV, maxBuffer: 64 * 1024 * 1024,
      ...(binary ? {} : { encoding: 'utf8' }),
    })
  } catch (e) {
    // ssh пробрасывает код выхода удалённого curl: 28=timeout, 6=DNS, 7=connect refused, 35=TLS.
    // Сбой самой ssh-аутентификации — код 255. Поднимаем код + stderr в текст ошибки.
    const code = e.status ?? e.signal ?? '?'
    const why = String(e.stderr || '').trim() || e.shortMessage || e.message
    throw new Error(`vpsCurl exit=${code}: ${why.slice(0, 300)} (url: ${url})`)
  }
}

async function localFetch(url, binary) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return binary ? Buffer.from(await r.arrayBuffer()) : await r.text()
  } finally {
    clearTimeout(t)
  }
}

export async function fetchHtml(url, { vpsFallback = false } = {}) {
  try {
    return await localFetch(url, false)
  } catch (e) {
    if (!vpsFallback) throw e
    return vpsCurl(url, false)
  }
}

export async function fetchImg(url, { vpsFallback = false } = {}) {
  try {
    return await localFetch(url, true)
  } catch (e) {
    if (!vpsFallback) throw e
    return vpsCurl(url, true)
  }
}

// ── processImg: ресайз до стандарта (фон НЕ удаляем) ───────────────────────────
export async function processImg(buf) {
  return sharp(buf)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ── uploadVPS: scp картинки на VPS → публичный URL ─────────────────────────────
export async function uploadVPS(buf, name) {
  if (!/^[\w.\-]+$/.test(name)) throw new Error(`uploadVPS: небезопасное имя файла '${name}'`)
  const tmp = join(tmpdir(), `scrape_${Date.now()}_${name}`)
  writeFileSync(tmp, buf)
  try {
    execFileSync('scp', [...sshOpts, tmp, `${VPS_HOST}:${VPS_MEDIA}/${name}`],
      { stdio: 'pipe', env: SSH_ENV })
  } finally {
    try { unlinkSync(tmp) } catch {}
  }
  return `${ASSETS_BASE}/${name}`
}

// ── writeDraft: запись ТОЛЬКО разрешённых полей черновика ───────────────────────
// Жёсткий аллоулист. Запрещённые ключи (image_url/is_active/qty/price и любые иные)
// молча игнорируются — витрину этот модуль не трогает НИКОГДА.
export const DRAFT_FIELDS = [
  'image_draft_url', 'image_draft_raw_url', 'image_status', 'image_source',
  // source_url — постоянная ссылка-якорь на товар-первоисточник. Чистый URL, по которому
  // можно пере-синхронизироваться без повторного краула. В отличие от image_source (который
  // исторически бывает и лейблом «Santino фотобанк»), source_url — только http-ссылка/якорь.
  'source_url',
  'description', 'short_description', 'color_images', 'colors',
  'pot_material', 'pot_color', 'pot_diameter', 'pot_height', 'volume_l',
  // характеристики из блока «Характеристики» (режим по ссылкам):
  'tnved_code', 'dimensions_packed', 'dimensions_unpacked', 'weight_gram', 'pack_size',
]
const FORBIDDEN = new Set(['image_url', 'is_active', 'qty', 'price'])

// Чистая функция (для тестов): оставляет только разрешённые ключи.
export function pickDraftFields(f) {
  const out = {}
  for (const k of DRAFT_FIELDS) if (f && f[k] !== undefined) out[k] = f[k]
  return out
}

export async function writeDraft(id, f) {
  const payload = pickDraftFields(f)
  const dropped = Object.keys(f || {}).filter(k => !DRAFT_FIELDS.includes(k))
  if (dropped.some(k => FORBIDDEN.has(k))) {
    console.warn(`writeDraft #${id}: игнорирую запрещённые ключи: ${dropped.filter(k => FORBIDDEN.has(k)).join(', ')}`)
  }
  if (Object.keys(payload).length === 0) return { id, updated: false, reason: 'нет разрешённых полей' }
  const { error } = await sb.from('products').update(payload).eq('id', id)
  if (error) return { id, updated: false, error: error.message }
  return { id, updated: true, fields: Object.keys(payload) }
}

// ── readBack: сводка по обогащению в заданном scope ────────────────────────────
export async function readBack(filter) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from('products')
      .select('id,name,image_url,image_draft_url,image_status,color_images')
      .order('id').range(from, from + 999)
    q = applyFilter(q, filter)
    const { data, error } = await q
    if (error) throw new Error(`readBack: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  const hasImg = v => v != null && v !== ''
  const found = rows.filter(r => hasImg(r.image_draft_url))
  const notFound = rows.filter(r => !hasImg(r.image_draft_url))
    .map(r => ({ id: r.id, name: r.name, reason: r.image_status || 'нет image_draft_url' }))
  const withImageUrl = rows.filter(r => hasImg(r.image_url)).length  // должно быть 0
  const withColorImages = rows.filter(r => r.color_images && Object.keys(r.color_images).length > 0).length
  return {
    count: rows.length,
    found: found.length,
    not_found: notFound,
    with_image_url: withImageUrl,
    with_color_images: withColorImages,
    examples: found.slice(0, 3).map(r => ({ id: r.id, name: r.name, image_draft_url: r.image_draft_url })),
  }
}
