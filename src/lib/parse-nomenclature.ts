export type ParsedItem = {
  variety_name: string
  length_str: string | null
  length_cm: number | null
  pot_diameter: number | null
  category: 'cut' | 'pot'
  pack_size: number
}

export function parseNomenclature(raw: string): ParsedItem {
  let name = raw.trim()
  let length_cm: number | null = null
  let length_str: string | null = null
  let pot_diameter: number | null = null

  // Strip trailing country names
  name = name.replace(/\s+(китай|эквадор|кения|голландия|израиль|колумбия|эфиопия|импорт)\s*$/i, '').trim()

  // ── Pot format 1: "(D-5; H-80)" or "(D-10,5; H-38)" ──────────────────────
  const potLabelMatch = name.match(/\s*\(D-(\d+(?:[,\.]\d+)?)\s*;\s*H-(\d+)\)\s*$/i)
  if (potLabelMatch) {
    pot_diameter = parseFloat(potLabelMatch[1].replace(',', '.'))
    length_cm = parseInt(potLabelMatch[2])
    name = name.slice(0, name.lastIndexOf('(')).trim()
  } else {
    // ── Pot format 2: "name HEIGHT  DIAMETER" (2+ spaces between numbers) ──
    // e.g. "алое вера 28  12"  "антуриум туренза 55  17"  "замифолия 35  10,5"
    const potNumMatch = name.match(/\s+(\d{2,3})\s{2,}(\d{1,2}(?:[,\.]\d+)?)\s*$/)
    if (potNumMatch) {
      length_cm = parseInt(potNumMatch[1])
      pot_diameter = parseFloat(potNumMatch[2].replace(',', '.'))
      name = name.slice(0, potNumMatch.index!).trim()
    } else {
      // ── Cut flower: range "70-80" or "70/80", or single "70" ─────────────
      const rangeMatch = name.match(/\s+(\d{2,3})[-\/](\d{2,3})\s*(?:см|cm)?\s*$/i)
      if (rangeMatch) {
        length_str = rangeMatch[1] + '-' + rangeMatch[2]
        length_cm = Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2)
        name = name.slice(0, rangeMatch.index!).trim()
      } else {
        const singleMatch = name.match(/\s+(\d{2,3})\s*(?:см|cm)?\s*$/i)
        if (singleMatch) {
          const cm = parseInt(singleMatch[1])
          if (cm >= 20 && cm <= 200) {
            length_str = String(cm)
            length_cm = cm
            name = name.slice(0, singleMatch.index!).trim()
          }
        }
      }
    }
  }

  // Strip "(Пустая характеристика)" and similar 1C artifacts
  name = name.replace(/\s*\(пустая характеристика\)\s*/gi, '').trim()
  name = name.replace(/\s*\(без тубы\)\s*/gi, '').trim()

  const variety_name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()

  // Category: if we found pot_diameter → pot; otherwise keyword check
  const pot_keywords = [
    'горшок','горш','драцен','фикус','пахир','фаленопс','орхидея',
    'замиокулк','замиокулькас','кактус','суккул','юкка','шеффлер',
    'пеперомия','клузия','спатифиллум','сенполия','каланхое',
    'рипсалидопс','радермахер','нарцисс луков','кониферен','гузмания',
    'роза ов','алое','бамбук лаки','маранта','гидрангия','пеларгони',
    'диантус спринт',
  ]
  const is_pot = pot_diameter !== null
    || pot_keywords.some(k => variety_name.toLowerCase().includes(k))
  const category: 'cut' | 'pot' = is_pot ? 'pot' : 'cut'

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

  return { variety_name, length_str, length_cm, pot_diameter, category, pack_size }
}
