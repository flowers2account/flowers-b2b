export const COLORS = [
  { key: 'white',      label: 'Белый',        bg: '#FFFFFF',   border: '#E0E0E0' },
  { key: 'cream',      label: 'Кремовый',     bg: '#FFF8E7',   border: '#E8D8A0' },
  { key: 'ivory',      label: 'Айвори',       bg: '#FFFFF0',   border: '#E8E4C8' },

  { key: 'yellow',        label: 'Жёлтый',          bg: '#FDD835',   border: '#F9A825' },
  { key: 'apricot',       label: 'Абрикосовый',     bg: '#FFBE7D',   border: '#E8943A' },
  { key: 'yellow_orange', label: 'Жёлто-оранжевый', bg: '#FFAB40',   border: '#FF8F00' },
  { key: 'orange',        label: 'Оранжевый',       bg: '#FF7043',   border: '#E64A19' },
  { key: 'light_orange',  label: 'Светло-оранжевый',bg: '#FFCC80',   border: '#FFA040' },
  { key: 'peach',         label: 'Персиковый',      bg: '#FFCBA4',   border: '#E8A87C' },
  { key: 'salmon',        label: 'Лососёвый',       bg: '#FA8072',   border: '#E05C50' },
  { key: 'coral',      label: 'Коралловый',   bg: '#FF6B6B',   border: '#E53935' },
  { key: 'orange_red',    label: 'Оранжево-красный', bg: '#FF4500',  border: '#CC2200' },

  { key: 'red',        label: 'Красный',      bg: '#E53935',   border: '#C62828' },
  { key: 'burgundy',   label: 'Бордовый',     bg: '#7B1A2E',   border: '#5C1220' },
  { key: 'red_dark',   label: 'Тёмно-красный', bg: '#B71C1C',   border: '#7F0000' },

  { key: 'pink_light', label: 'Нежно-розовый',  bg: '#FADADD',  border: '#F4A7B0' },
  { key: 'pink',       label: 'Розовый',        bg: '#FFB6C1',  border: '#E991A0' },
  { key: 'cerise',     label: 'Вишнёвый',       bg: '#DE3163',   border: '#B71C1C' },
  { key: 'hot_pink',   label: 'Ярко-розовый',   bg: '#FF1493',  border: '#C71585' },
  { key: 'pink_dark',  label: 'Тёмно-розовый',  bg: '#C2185B',   border: '#880E4F' },

  { key: 'lilac',      label: 'Сиреневый',       bg: '#DDB6F2',   border: '#B39DDB' },
  { key: 'milka',      label: 'Милка',           bg: '#C9A8E0',   border: '#9B72BB' },
  { key: 'lilac_dark', label: 'Тёмно-сиреневый', bg: '#9B59B6',   border: '#7D3C98' },
  { key: 'lavender',   label: 'Лавандовый',      bg: '#CE93D8',   border: '#AB47BC' },
  { key: 'purple',     label: 'Фиолетовый',   bg: '#7B1FA2',   border: '#6A1B9A' },

  { key: 'blue',       label: 'Голубой',      bg: '#64B5F6',   border: '#1E88E5' },
  { key: 'navy',       label: 'Синий',        bg: '#283593',   border: '#1A237E' },

  { key: 'green',      label: 'Зелёный',      bg: '#66BB6A',   border: '#388E3C' },
  { key: 'lime',       label: 'Салатовый',    bg: '#C5E1A5',   border: '#7CB342' },
  { key: 'silver',     label: 'Серебристый',  bg: '#CFD8DC',   border: '#90A4AE' },

  { key: 'sand',       label: 'Песочный',     bg: '#E8D5B0',   border: '#C8A870' },
  { key: 'brown',      label: 'Коричневый',   bg: '#795548',   border: '#5D4037' },
  { key: 'bronze',     label: 'Бронзовый',    bg: '#CD7F32',   border: '#A0522D' },
  { key: 'terracotta', label: 'Терракотовый', bg: '#C66E50',   border: '#A0522D' },

  { key: 'black',      label: 'Чёрный',       bg: '#212121',   border: '#000000' },

  { key: 'pink_white',           label: 'Розово-белый',      gradient: 'linear-gradient(135deg,#FFB6C1 50%,#FFFFFF 50%)' },
  { key: 'lilac_white',          label: 'Сиренево-белый',    gradient: 'linear-gradient(135deg,#DDB6F2 50%,#FFFFFF 50%)' },
  { key: 'purple_white',         label: 'Фиолетово-белый',   gradient: 'linear-gradient(135deg,#7B1FA2 50%,#FFFFFF 50%)' },
  { key: 'red_white',            label: 'Красно-белый',      gradient: 'linear-gradient(135deg,#E53935 50%,#FFFFFF 50%)' },
  { key: 'red_yellow',           label: 'Красно-жёлтый',     gradient: 'linear-gradient(135deg,#E53935 50%,#FDD835 50%)' },
  { key: 'green_white',          label: 'Зелёно-белый',      gradient: 'linear-gradient(135deg,#66BB6A 50%,#FFFFFF 50%)' },
  { key: 'green_pink',           label: 'Зелёно-розовый',    gradient: 'linear-gradient(135deg,#66BB6A 50%,#FFB6C1 50%)' },
  { key: 'bicolor',              label: 'Биколор',           gradient: 'linear-gradient(135deg,#E53935 50%,#FFFFFF 50%)' },
  { key: 'bicolor_orange_yellow',label: 'Оранжево-жёлтый',   gradient: 'linear-gradient(135deg,#FF7043 50%,#FDD835 50%)' },
  { key: 'bicolor_orange_green', label: 'Оранжево-зелёный',  gradient: 'linear-gradient(135deg,#FF7043 50%,#66BB6A 50%)' },
  { key: 'bicolor_blue_white',   label: 'Голубо-белый',      gradient: 'linear-gradient(135deg,#64B5F6 50%,#FFFFFF 50%)' },
  { key: 'multicolor',           label: 'Микс',              gradient: 'conic-gradient(#E53935 0deg,#FDD835 90deg,#66BB6A 180deg,#7B1FA2 270deg,#E53935 360deg)' },
] as const

export type ColorDef = typeof COLORS[number]

// Радужный «микс» — для ассорти/мультиколор и неизвестных составных токенов.
const MIX = 'conic-gradient(#E53935 0deg,#FDD835 90deg,#66BB6A 180deg,#7B1FA2 270deg,#E53935 360deg)'
// Нейтральная штриховка для не-цветов (шаде-серий нет; рисуем только если что-то их всё же выводит).
const NEUTRAL = 'repeating-linear-gradient(45deg,#EEE,#EEE 3px,#F7F7F7 3px,#F7F7F7 6px)'

// ── Цветовая система каталога (одна точка нормализации + резолва) ─────────────────
//
// Данные в products.colors[] и products.pot_color — «грязные»: разные языки, формы и
// хвостовые коды 1С. Чтобы кружок красился у ВСЕХ, а фильтр не плодил дубли, всё
// проходит через canon() (нормализация) → swatchCss() (резолв в CSS).
//
// Приоритет резолва: целая строка → префикс светло/тёмно → сплит на составной градиент
// → серый фолбэк. Дефисные ОДИНОЧНЫЕ цвета (тёмно-розовый) ловятся ДО сплита и не рвутся.

const basic = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е')

// ё→е + lower (для матча COLORS.label и совместимости со старым кодом).
const norm = basic

// Сентинел не-цвета (шаде НЕ сюда — это реальный цвет, см. HEX).
const NONCOLOR = '__noncolor'

// Токены-«микс» (радуга). diverse kleuren/цветной — по решению владельца НЕ микс, а скрытие.
const MIX_SET = new Set(['ассорти', 'assorti', 'микс', 'mix', 'mixed', 'мультиколор', 'multicolor', 'tricolor', 'трехцветный'])

// Шум внутри составных токенов — выбрасывается при сплите.
const NOISE = new Set(['', '+', 'heart', 'сердце', 'серцевина', 'сердцевина', 'flamed', 'пламя', 'apple', 'perl', 'перламутр', 'old', 'с'])

// Модификаторы яркости (рус. префиксы и англ. light/dark).
const MOD_LIGHT = new Set(['светло', 'нежно', 'бледно', 'light', 'lt', 'св'])
const MOD_DARK = new Set(['темно', 'dark', 'donker', 'dk', 'т'])
const MOD_BRIGHT = new Set(['ярко', 'яр', 'bright'])

// Алиасы: нормализованная форма (после basic + срез числа) → канонический токен,
// который умеет резолвить HEX/COLORS. Голландский, жен. формы, сокращения, синонимы.
const ALIAS: Record<string, string> = {
  // — голландский (pot_color) —
  wit: 'белый', zwart: 'черный', rood: 'красный', groen: 'зеленый', geel: 'желтый',
  oranje: 'оранжевый', roze: 'розовый', paars: 'фиолетовый', blauw: 'синий', bruin: 'коричневый',
  zilver: 'серебристый', grijs: 'серый', antraciet: 'антрацит', terracotta: 'терракотовый',
  beige: 'бежевый', creme: 'кремовый', 'crème': 'кремовый', naturel: 'натуральный', natural: 'натуральный',
  transparant: 'прозрачный', bordeaux: 'бордовый', lichtgrijs: 'светло-серый',
  donkergroen: 'темно-зеленый', mosgroen: 'зеленый', taupe: 'тауп', ecru: 'экрю',
  // — английские, которых нет в COLORS —
  violet: 'фиолетовый', champagne: 'шампань', gold: 'золотой', turquoise: 'бирюзовый',
  fuchsia: 'фуксия', mint: 'мятный', aubergine: 'баклажановый', pastel: 'пастель',
  platinum: 'платина', copper: 'медный', bordo: 'бордовый', lemon: 'лимонный',
  // — русские: жен. формы, сокращения, синонимы (после среза хвостового числа) —
  сирень: 'сиреневый', розовая: 'розовый', белая: 'белый', зеленая: 'зеленый',
  желтая: 'желтый', красная: 'красный', персиковая: 'персиковый', малина: 'малиновый',
  бирюза: 'бирюзовый', фиолет: 'фиолетовый', салат: 'салатовый', пурпур: 'пурпурный',
  василек: 'васильковый', крем: 'кремовый', персик: 'персиковый', жемчужный: 'жемчуг', бордо: 'бордовый',
  лаванда: 'лавандовый', antique: 'антик',
  'неж. розовая': 'нежно-розовый', 'неж розовая': 'нежно-розовый',
  'неж. голубой': 'светло-голубой', 'неж голубой': 'светло-голубой',
  'св. фиолет': 'светло-фиолетовый', 'св фиолет': 'светло-фиолетовый',
  'т.фиолет': 'темно-фиолетовый', 'т фиолет': 'темно-фиолетовый',
  'яр.фиолет': 'фиолетовый', 'яр фиолет': 'фиолетовый',
  'бл.розовый': 'нежно-розовый', 'бл розовый': 'нежно-розовый',
  'кофе с молоком': 'кофейный', 'коралловый розовый': 'коралловый',
  'ледяной розовый': 'нежно-розовый', 'жемчужно-розовый': 'нежно-розовый',
  'зеленое золото': 'зеленое золото', 'green_apple': 'зеленый', 'green apple': 'зеленый',
  // — не-цвета (скрываем кружок) —
  'diverse kleuren': NONCOLOR, 'niet van toepassing': NONCOLOR, 'n.v.t.': NONCOLOR,
  bedrukt: NONCOLOR, overige: NONCOLOR, 'ton-sur-ton': NONCOLOR, 'тон-в-тон': NONCOLOR,
  цветной: NONCOLOR,
}

// Канонические русские токены → hex (приоритет над матчем по COLORS.label).
const HEX: Record<string, string> = {
  // одноцветные (русские)
  белый: '#FFFFFF', молочный: '#FAF7F0', 'слоновая кость': '#FFFFF0',
  бежевый: '#E7D3B3', 'светло-бежевый': '#EFE6D5', кремовый: '#F5E6C8', карамель: '#C8915B',
  натуральный: '#D9C2A3', песочный: '#E8D5B0', тауп: '#8B7E74', экрю: '#D9CDB8',
  крафт: '#B5895A',
  выбеленный: '#E8E0D5', платина: '#D8D8DC', пастель: '#E6DCEC', антик: '#C9B79C',
  желтый: '#FDD835', 'темно-желтый': '#C9A227', лимонный: '#F4E04D',
  золотой: '#D4AF37', золотистый: '#D4AF37',
  оранжевый: '#FB8C00', морковный: '#ED6C2A', медовый: '#E8A95C', 'светло-медовый': '#F0D9A8',
  терракотовый: '#C65B33', коралловый: '#FF6F61', персиковый: '#FFB07A',
  красный: '#E53935', малиновый: '#C81D6B', брусничный: '#9B1B30',
  розовый: '#F48FB1', 'светло-розовый': '#FAD2DD', 'нежно-розовый': '#FAD2DD',
  'ярко-розовый': '#FF2D8B', 'темно-розовый': '#C2185B',
  бордовый: '#7B1E2B', 'темно-бордовый': '#5E1A2B', бургундский: '#5A1A24',
  сливовый: '#6E3B5C', сиреневый: '#B39DDB', лиловый: '#9575CD', лавандовый: '#C5A3E0',
  фиолетовый: '#8E24AA', пурпурный: '#9C27B0', аметист: '#9966CC', баклажановый: '#3D2B3D',
  синий: '#1E88E5', голубой: '#4FC3F7', 'светло-голубой': '#A8D8F0', 'темно-голубой': '#0277BD',
  васильковый: '#5C6BC0', лазурь: '#1CA9C9', 'дымчатый синий': '#6E8CA0', 'дымчатый серый': '#8A8A8A',
  'серо-голубой': '#6E8CA0', 'серо-голубая': '#6E8CA0',
  бирюзовый: '#1AB5A8', аквамарин: '#7FFFD4',
  зеленый: '#43A047', 'светло-зеленый': '#9CCC65', 'темно-зеленый': '#2E6B30',
  салатовый: '#AED581', лайм: '#C5E1A5', травяной: '#7CB342', мятный: '#A8E6CF',
  оливковый: '#808000', 'зеленое золото': '#8A8B3C', хаки: '#8F9779', нефрит: '#4E7C6B', фисташка: '#A8C97F',
  коричневый: '#8B5A2B', шоколадный: '#5D4037', кофейный: '#6F4E37', какао: '#7B5E57',
  мокко: '#6F4E37', латте: '#C8A98A', медный: '#B87333', бронзовый: '#CD7F32',
  черный: '#1C1C1C', серый: '#9E9E9E', 'светло-серый': '#C8C8C8', графит: '#4A4A4A',
  антрацит: '#383E42', серебристый: '#C0C0C0', металлик: '#B0B0B0',
  шампань: '#F3E5AB', фуксия: '#D6217E',
  'чайная роза': '#D4A5A5', 'пепельная роза': '#C9A0A0', 'пыльная роза': '#C48F92', пудровый: '#E8C4C4', пудра: '#E8C4C4',
  лотос: '#E8B4C0', жемчуг: '#EDE6D6', прозрачный: '#E8EEF0',
  // шаде — декоративная отделка горшков Santino: тёплый серо-бежевый грейж (НЕ коричневый).
  шаде: '#B7A99A',
  // особые
  крапчатый: 'radial-gradient(#8E4E73 1px, transparent 1.6px) 0 0 / 5px 5px, #C77DA6',
}

// — низкоуровневые помощники резолва —

const HEX_RE = /^#([0-9a-f]{6})$/i

function mixHex(hex: string, towardWhite: boolean, t: number): string {
  const m = HEX_RE.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const tgt = towardWhite ? 255 : 0
  const ch = (v: number) => Math.round(v + (tgt - v) * t)
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255)
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

// CSS одиночного токена (уже канонизированного) через HEX → COLORS, иначе null.
function solidOf(token: string): string | null {
  if (HEX[token]) return HEX[token]
  const c = COLORS.find(c => c.key === token || norm(c.label) === token)
  if (c) return ('gradient' in c ? c.gradient : c.bg) as string
  return null
}

function gradientOf(parts: string[]): string {
  if (parts.length === 2) return `linear-gradient(135deg,${parts[0]} 50%,${parts[1]} 50%)`
  // 3 цвета — равные сектора
  const [a, b, c] = parts
  return `linear-gradient(135deg,${a} 33.33%,${b} 33.33%,${b} 66.66%,${c} 66.66%)`
}

/**
 * Канонизация одного токена цвета:
 *  lower + ё→е → срез хвостового кода 1С («крем 02») и «+ чёрная серцевина»
 *  → алиас (голландский / жен. форма / сокращение / синоним).
 * Возвращает либо канонический токен, либо сентинел NONCOLOR.
 */
export function normalizeColor(raw: string): string {
  let s = basic(raw)
  // «orange + black heart» / «..._+_black_heart» → дроп пометки тёмной серцевины,
  // оставляем доминирующий цвет (sep — пробел/_/+/-).
  s = s.replace(/[\s_+-]*black[\s_]*heart\s*$/, '')
       .replace(/[\s_+-]*(?:чер|темн)[а-я]*[\s_]*серц[а-я]*\s*$/, '')
       .replace(/[\s_+-]+$/, '').trim()
  // хвостовой код 1С: «крем 02», «бирюза 189», «сирень 17»
  s = s.replace(/\s*\d+\s*$/, '').trim()
  return ALIAS[s] ?? s
}

/** true для токенов, которые НЕ являются цветом (серия/«с рисунком»/«н/д»). */
export function isNonColor(raw: string): boolean {
  return normalizeColor(raw) === NONCOLOR
}

const ASSORTI_RE = /^(ассорти|assorti)$/i
export function isAssorti(slug: string): boolean {
  return ASSORTI_RE.test(slug.trim())
}

/** CSS-фон свотча по сырому токену. Красит ВСЕХ: одиночные, голландский, составные. */
export function colorSwatch(slugOrLabel: string): string {
  const pastelDirect: Record<string, string> = {
    'пыльно розовый': '#C99AA4',
    'пыльно-розовый': '#C99AA4',
    'глициния': '#B9A0D8',
    'зеленый чай': '#B8C98A',
    'зелёный чай': '#B8C98A',
    'марсала': '#9B4B57',
    'светлый лосось': '#F0A08E',
    'бамбук': '#B9C983',
    'розово персиковый': '#F2B6A6',
    'розово-персиковый': '#F2B6A6',
    'лилово розовый': '#D6A2C8',
    'лилово-розовый': '#D6A2C8',
    'светло коралловый': '#F69A8D',
    'светло-коралловый': '#F69A8D',
    'ярко розовый': '#F26AA5',
    'ярко-розовый': '#F26AA5',
    'красный': '#D9292F',
  }
  const direct = pastelDirect[slugOrLabel.trim().toLowerCase().replace(/ё/g, 'е')]
  if (direct) return direct

  const n = normalizeColor(slugOrLabel)
  if (n === NONCOLOR) return NEUTRAL
  if (MIX_SET.has(n) || isAssorti(n)) return MIX

  // 1) строка целиком (ловит «тёмно-розовый» и т.п. ДО сплита)
  const whole = solidOf(n)
  if (whole) return whole

  // 2) префикс яркости: «светло-X» / «тёмно-X» / англ. «light/dark» в начале
  const pfx = /^(светло|темно|нежно|бледно|ярко|light|dark|lt|dk|bright)[-_\s]+(.+)$/.exec(n)
  if (pfx) {
    const base = solidOf(normalizeColor(pfx[2]))
    if (base && HEX_RE.test(base)) {
      if (MOD_DARK.has(pfx[1])) return mixHex(base, false, 0.4)
      if (MOD_LIGHT.has(pfx[1])) return mixHex(base, true, 0.45)
      return base // ярко — оставляем как есть
    }
    if (base) return base
  }

  // 3) составной токен: сплит по - / _ + (НЕ по пробелу — «дымчатый синий» цельный)
  const rawParts = n.split(/[-/_+]+/).map(p => p.trim()).filter(Boolean)
  if (rawParts.length >= 2) {
    const mods: string[] = []
    const cols: string[] = []
    for (const p of rawParts) {
      const c = normalizeColor(p)
      if (NOISE.has(c)) continue
      if (MOD_LIGHT.has(c) || MOD_DARK.has(c) || MOD_BRIGHT.has(c)) { mods.push(c); continue }
      const css = solidOf(c)
      if (css) cols.push(css)
    }
    // один цвет + модификатор → яркость
    if (cols.length === 1 && mods.length && HEX_RE.test(cols[0])) {
      if (mods.some(m => MOD_DARK.has(m))) return mixHex(cols[0], false, 0.4)
      if (mods.some(m => MOD_LIGHT.has(m))) return mixHex(cols[0], true, 0.45)
      return cols[0]
    }
    if (cols.length === 1) return cols[0]
    if (cols.length === 2) return gradientOf(cols)
    if (cols.length >= 3) return gradientOf(cols.slice(0, 3))
  }

  return '#ccc'
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Русское слово для одной части составного цвета (модификатор или цвет).
function partWord(token: string): string {
  const c = normalizeColor(token)
  if (MOD_DARK.has(c)) return 'темно'
  if (MOD_LIGHT.has(c)) return 'светло'
  if (MOD_BRIGHT.has(c)) return 'ярко'
  const col = COLORS.find(d => d.key === c)
  if (col) return col.label.toLowerCase()
  return c
}

/** Человекочитаемая подпись цвета (для чипсов, корзины, уведомления, Excel). */
export function colorLabel(slugOrLabel: string): string {
  if (isAssorti(slugOrLabel)) return 'Ассорти'
  const n = normalizeColor(slugOrLabel)
  if (n === NONCOLOR) return ''
  if (MIX_SET.has(n)) return 'Микс'
  const c = COLORS.find(c => c.key === n)
  if (c) return c.label
  if (HEX[n]) return cap(n)
  // составной/англ. токен → перевести части в русские слова, склеить дефисом
  const parts = n.split(/[-/_+]+/).map(s => s.trim())
    .filter(p => p && !NOISE.has(normalizeColor(p)))
  if (parts.length >= 2) return cap(parts.map(partWord).join('-'))
  return cap(n)
}

/**
 * Чистый список цветов товара для чипсов: триммим, выкидываем не-цвета.
 * Настоящие цвета остаются → товар вариативен, даже если рядом был bedrukt/н/д.
 */
export function usableColors(colors?: string[] | null): string[] {
  return (colors ?? [])
    .map(c => c?.trim())
    .filter((c): c is string => !!c && !isNonColor(c))
}

/**
 * Режим выбора цвета по products.colors (после отсева не-цветов):
 *  - 'none'    — пусто: блока цвета нет, color = null
 *  - 'assorti' — ровно один «ассорти»: статичный бейдж, color = "ассорти"
 *  - 'select'  — один и более настоящих цветов: чипсы, выбор обязателен
 */
export function getColorMode(colors?: string[] | null): 'none' | 'assorti' | 'select' {
  const list = usableColors(colors)
  if (list.length === 0) return 'none'
  if (list.length === 1 && isAssorti(list[0])) return 'assorti'
  return 'select'
}

/**
 * true, если свотч — светлый сплошной цвет (белый, кремовый, серебристый…) и нуждается
 * в видимой рамке на белом фоне. Градиенты/сплиты считаем «не светлыми».
 */
export function isLightSwatch(slugOrLabel: string): boolean {
  const m = HEX_RE.exec(colorSwatch(slugOrLabel).trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum >= 190
}
