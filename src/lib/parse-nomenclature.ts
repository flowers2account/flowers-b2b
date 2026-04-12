export type ParsedItem = {
  variety_name: string
  length_str: string | null
  length_cm: number | null
  category: 'cut' | 'pot'
  pack_size: number
}

export function parseNomenclature(raw: string): ParsedItem {
  let name = raw.trim()

  name = name.replace(/\s+(китай|эквадор|кения|голландия|израиль|колумбия|эфиопия|импорт)\s*$/i, '').trim()

  let length_str: string | null = null
  let length_cm: number | null = null

  const rangeMatch = name.match(/\s+(\d{2,3})[-\/](\d{2,3})\s*(?:см|cm)?\s*$/i)
  if (rangeMatch) {
    length_str = rangeMatch[1] + '-' + rangeMatch[2]
    length_cm = Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2)
    name = name.slice(0, rangeMatch.index).trim()
  } else {
    const singleMatch = name.match(/\s+(\d{2,3})\s*(?:см|cm)?\s*$/i)
    if (singleMatch) {
      const cm = parseInt(singleMatch[1])
      if (cm >= 20 && cm <= 200) {
        length_str = String(cm)
        length_cm = cm
        name = name.slice(0, singleMatch.index).trim()
      }
    }
  }

  const variety_name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()

  const pot = ['горшок','горш','драцен','фикус','пахир','фаленопс','орхидея','замиокулк','кактус','суккул','юкка','шеффлер','пеперомия','клузия']
  const category: 'cut' | 'pot' = pot.some(k => variety_name.toLowerCase().includes(k)) ? 'pot' : 'cut'

  let pack_size = 10
  if (category === 'pot') {
    pack_size = 1
  } else {
    const n = variety_name.toLowerCase()
    if (n.includes('роза') || n.includes('rosa')) pack_size = 25
    else if (n.includes('хризантем')) pack_size = 5
    else if (n.includes('гвоздик')) pack_size = 20
    else if (n.includes('лили') || n.includes('тюльпан') || n.includes('гербер') || n.includes('ирис')) pack_size = 10
    else if (n.includes('альстромер') || n.includes('гипсофил') || n.includes('эустом')) pack_size = 5
  }

  return { variety_name, length_str, length_cm, category, pack_size }
}
