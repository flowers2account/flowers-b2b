// Сумма прописью на русском для счёта (тенге + тиын).
// Тенге — мужской род, индекл.; тысяча — женский; миллион/миллиард — мужской.

const ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

/** Выбор формы слова по числу: [1, 2-4, 5-0]. */
function plural(n: number, one: string, few: string, many: string): string {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 19) return many
  const m10 = n % 10
  if (m10 === 1) return one
  if (m10 >= 2 && m10 <= 4) return few
  return many
}

/** Триада 0..999 прописью. feminine=true → одна/две (для тысяч). */
function triad(num: number, feminine: boolean): string {
  const ones = feminine ? ONES_F : ONES_M
  const out: string[] = []
  const h = Math.floor(num / 100)
  const rest = num % 100
  if (h) out.push(HUNDREDS[h])
  if (rest < 20) {
    if (rest) out.push(ones[rest])
  } else {
    out.push(TENS[Math.floor(rest / 10)])
    if (rest % 10) out.push(ones[rest % 10])
  }
  return out.join(' ')
}

const SCALES: { feminine: boolean; forms: [string, string, string] }[] = [
  { feminine: false, forms: ['', '', ''] },                                   // единицы (тенге добавим отдельно)
  { feminine: true,  forms: ['тысяча', 'тысячи', 'тысяч'] },
  { feminine: false, forms: ['миллион', 'миллиона', 'миллионов'] },
  { feminine: false, forms: ['миллиард', 'миллиарда', 'миллиардов'] },
]

/** Целое число прописью (без названия валюты). 0 → «ноль». */
function intToWords(n: number): string {
  if (n === 0) return 'ноль'
  const groups: number[] = []
  let x = n
  while (x > 0) { groups.push(x % 1000); x = Math.floor(x / 1000) }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (!g) continue
    const scale = SCALES[i] ?? SCALES[SCALES.length - 1]
    parts.push(triad(g, scale.feminine))
    if (i > 0) parts.push(plural(g, scale.forms[0], scale.forms[1], scale.forms[2]))
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const firstUpper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Сумма прописью для счёта: «Семнадцать тысяч пятьсот тенге 00 тиын».
 * tiyn выводится цифрами (как в типовых счетах РК/РФ).
 */
export function amountInWords(amount: number): string {
  const safe = Math.max(0, Number(amount) || 0)
  const tenge = Math.floor(safe)
  const tiyn = Math.round((safe - tenge) * 100)
  const tengeWord = plural(tenge, 'тенге', 'тенге', 'тенге') // тенге индекл.
  const words = firstUpper(intToWords(tenge))
  const tiynStr = String(tiyn).padStart(2, '0')
  return `${words} ${tengeWord} ${tiynStr} тиын`
}
