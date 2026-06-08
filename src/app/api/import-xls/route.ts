export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { enrichProductBatch } from '@/lib/naming/ai-enrichment'
import { parseNomenclature } from '@/lib/parse-nomenclature'

/** Mirrors SQL norm_stock_name(): lower + trim + collapse whitespace */
export function normName(s: string): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function countryFromText(s: string): string | null {
  const t = s.toLowerCase()
  if (/эквадор|ecuador/.test(t)) return 'EC'
  if (/кени[яи]|kenya/.test(t))   return 'KE'
  if (/голланд|holland|nether/.test(t)) return 'NL'
  if (/китай|china/.test(t))      return 'CN'
  if (/колумб|colombia/.test(t))  return 'CO'
  if (/израил|israel/.test(t))    return 'IL'
  if (/эфиоп|ethiopia/.test(t))   return 'ET'
  if (/египет|egypt/.test(t))     return 'EG'
  return null
}

// species_id → { subcategory, variety_type }
const SPECIES_SUBCAT: Record<number, { subcat: string; vt?: string }> = {
  1:  { subcat: 'roses',          vt: 'single' },
  2:  { subcat: 'roses',          vt: 'spray'  },
  3:  { subcat: 'roses',          vt: 'spray'  },
  4:  { subcat: 'chrysanthemums', vt: 'single' },
  5:  { subcat: 'chrysanthemums', vt: 'spray'  },
  6:  { subcat: 'chrysanthemums', vt: 'spray'  },
  7:  { subcat: 'lilies'        },
  8:  { subcat: 'lilies'        },
  9:  { subcat: 'lilies'        },
  10: { subcat: 'gerberas'      },
  11: { subcat: 'tulips'        },
  12: { subcat: 'carnations'    },
  47: { subcat: 'carnations',   vt: 'single' },
  48: { subcat: 'carnations',   vt: 'spray'  },
  13: { subcat: 'lisianthus'   },
  14: { subcat: 'alstroemeria' },
  16: { subcat: 'peonies'      },
  17: { subcat: 'ranunculus'   },
  21: { subcat: 'greens'       },
  22: { subcat: 'greens'       },
  28: { subcat: 'fillers'      },
  32: { subcat: 'orchids'      },
  34: { subcat: 'seasonal'     },
  35: { subcat: 'seasonal'     },
  36: { subcat: 'berries'      },
  37: { subcat: 'fillers'      },
  39: { subcat: 'texture'      },
  40: { subcat: 'accents'      },
  41: { subcat: 'texture'      },
  42: { subcat: 'callas'       },
  43: { subcat: 'fillers'      },
  44: { subcat: 'greens'       },
  45: { subcat: 'accents'      },
}

function getSubcatByKeyword(name: string, category: 'cut' | 'pot' | 'accessories'): { subcategory: string | null; variety_type: string | null } {
  const n = name.toLowerCase()
  if (category === 'cut') {
    if (/пион/.test(n))                  return { subcategory: 'peonies',     variety_type: null }
    if (/ранункул/.test(n))              return { subcategory: 'ranunculus',  variety_type: null }
    if (/анемон/.test(n))                return { subcategory: 'anemones',    variety_type: null }
    if (/орхид|цимбидиум|фаленопсис/.test(n)) return { subcategory: 'orchids', variety_type: null }
    if (/антуриум/.test(n))              return { subcategory: 'anthuriums',  variety_type: null }
    if (/протея|лейкодендрон|лекукодендрон/.test(n)) return { subcategory: 'proteas', variety_type: null }
    if (/подсолнух/.test(n))             return { subcategory: 'sunflowers',  variety_type: null }
    if (/дельфиниум/.test(n))            return { subcategory: 'delphiniums', variety_type: null }
    if (/гиперикум/.test(n))             return { subcategory: 'berries',     variety_type: null }
    if (/бамбук|бетула|саликс/.test(n))  return { subcategory: 'branches',    variety_type: null }
    if (/молюцелла|чико|статица/.test(n)) return { subcategory: 'fillers',    variety_type: null }
    if (/бруни|хамелаций|вакс/.test(n))  return { subcategory: 'texture',     variety_type: null }
    if (/гиппеаструм/.test(n))           return { subcategory: 'spring',      variety_type: null }
    if (/квинс кроун|^микс/.test(n))     return { subcategory: 'roses',       variety_type: 'single' }
  }
  if (category === 'pot') {
    if (/бамбук|драцена|замиокул|клузия|маранта|фикус|хамедорея|шеффлера|радермахера|фатсия|эонимус/.test(n)) return { subcategory: 'green', variety_type: null }
    if (/пахира|юкка/.test(n))           return { subcategory: 'large',    variety_type: null }
    if (/каланхое|пеларгони|пеперомия|рипсалидопс|сенполия|шлюмбергера|гузмания|спатифиллум|цикламен|ранункулюс/.test(n)) return { subcategory: 'flowering', variety_type: null }
    if (/алое/.test(n))                  return { subcategory: 'succulents', variety_type: null }
    if (/туя|фритиллария/.test(n))       return { subcategory: 'outdoor',   variety_type: null }
    if (/антуриум|фаленопсис|орхидея|гортензия|нарцисс|гвоздика|роза/.test(n)) return { subcategory: 'flowering', variety_type: null }
  }
  if (category === 'accessories') {
    // ВАЖНО: выдаём ТОЛЬКО канон-slug из members category-tree.ts.
    // Неизвестное → null (товар попадёт в скрытое "Прочее"). Не выдумывать новые slug.
    if (/набор.*коробок|коробок.*набор|подароч.*короб/.test(n))            return { subcategory: 'gift_boxes',       variety_type: null }
    if (/пакет/.test(n))                                                   return { subcategory: 'film_bags',        variety_type: null }
    if (/искусствен.*газон|газон.*искусствен/.test(n))                     return { subcategory: 'artificial_grass', variety_type: null }
    if (/укрывн|агрополотно|агроволокно|спанбонд|геотекстил/.test(n))      return { subcategory: 'cover_fabric',      variety_type: null }
    if (/плёнк|пленк/.test(n))
      return /полиэтилен|парник|тепличн/.test(n)
        ? { subcategory: 'cover_film', variety_type: null }
        : { subcategory: 'film',       variety_type: null }
    if (/бумаг|крафт|гофр|калька|тишью/.test(n))                           return { subcategory: 'paper',            variety_type: null }
    if (/краск|спрей|аэрозол/.test(n))                                     return { subcategory: 'paints',           variety_type: null }
    if (/кашпо/.test(n))                                                   return { subcategory: 'kashpo',           variety_type: null }
    if (/фонтан/.test(n))                                                  return { subcategory: 'fountains',        variety_type: null }
    if (/горшок|горш|вазон/.test(n))                                       return { subcategory: 'pots',             variety_type: null }
    if (/корзин/.test(n))                                                  return { subcategory: 'baskets',          variety_type: null }
    if (/ваз/.test(n))                                                     return { subcategory: 'vases',            variety_type: null }
    if (/грунт|торф|перлит|субстрат|компост|вермикул|дренаж|кокосов/.test(n)) return { subcategory: 'soil',          variety_type: null }
    if (/инсектицид|фунгицид|гербицид|пестицид|родентицид|защит.*растен/.test(n)) return { subcategory: 'plant_protection', variety_type: null }
    if (/удобрен|fertika|bona forte|osmocot|агрикола|reasil|гумат|кристалон|подкорм/.test(n)) return { subcategory: 'fertilizers', variety_type: null }
    if (/искусствен/.test(n))                                              return { subcategory: 'artificial',       variety_type: null }
    if (/игрушк/.test(n))                                                  return { subcategory: 'toys',             variety_type: null }
    if (/сухоцвет/.test(n))                                                return { subcategory: 'dried',            variety_type: null }
    return { subcategory: null, variety_type: null }
  }
  return { subcategory: null, variety_type: null }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const formData = await req.formData()
  const file = formData.get('file') as File
  const userId = formData.get('userId') as string | null
  const importIdRaw = formData.get('importId') as string | null

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  const rows: { name: string; qty: number; price: number }[] = []
  for (const row of rawRows) {
    if (!Array.isArray(row)) continue
    const col0 = String(row[0] ?? '').trim()
    const col1 = String(row[1] ?? '').trim()
    const col2 = String(row[2] ?? '').trim()
    const col3 = String(row[3] ?? '').trim()

    let name = '', qtyRaw = '', priceRaw = ''
    if (!col0 && col1 && col1.length > 2) {
      name = col1; qtyRaw = col2; priceRaw = col3
    } else if (col0 && col0.length > 2) {
      name = col0; qtyRaw = col1; priceRaw = col2
    } else { continue }

    const nameLower = name.toLowerCase()
    if (
      nameLower.includes('наименов') || nameLower.includes('номенклат') ||
      nameLower.includes('итог') || nameLower.includes('склад') ||
      nameLower.includes('период') || nameLower.includes('показател') ||
      nameLower.includes('группировк') || nameLower.includes('отбор') ||
      nameLower === 'основная' || nameLower === 'основной склад' || nameLower === 'основной'
    ) continue

    const parseNum = (s: string) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'))
    const qty = parseNum(qtyRaw)
    const price = parseNum(priceRaw)
    if (!name || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) continue
    rows.push({ name: name.trim(), qty: Math.round(qty), price })
  }

  if (rows.length === 0)
    return NextResponse.json({ error: 'Нет данных в файле' }, { status: 400 })

  const fileNameLower = file.name.toLowerCase()
  const fileCategory: 'cut' | 'pot' | 'accessories' =
    fileNameLower.includes('горшок') || fileNameLower.includes('горш') ? 'pot' :
    fileNameLower.includes('сопут') || fileNameLower.includes('упаков') || fileNameLower.includes('расход') ? 'accessories' :
    'cut'
  const fileCountry = countryFromText(file.name)

  const importId = importIdRaw ? parseInt(importIdRaw) : Date.now()

  // ── Matching: load products + aliases ──────────────────────────────────────
  const { data: allProducts } = await supabase.from('products').select('id, name')
  const productByNorm = new Map<string, number>()
  for (const p of allProducts ?? []) {
    const n = normName(p.name)
    if (!productByNorm.has(n)) productByNorm.set(n, p.id)
  }

  const norms = [...new Set(rows.map(r => normName(r.name)))]
  const { data: aliases } = await supabase
    .from('stock_aliases').select('norm_name, product_id').in('norm_name', norms)
  const aliasByNorm = new Map<string, number>()
  for (const a of aliases ?? []) aliasByNorm.set(a.norm_name, a.product_id)

  // ── AI enrichment (skip for accessories — no color/species/country) ────────
  const aiStats = { ai_enriched: 0, ai_cached: 0, ai_failed: 0 }
  let enrichedMap = new Map<string, Awaited<ReturnType<typeof enrichProductBatch>>[number]>()
  if (fileCategory !== 'accessories') {
    try {
      const enriched = await enrichProductBatch(rows.map(r => r.name))
      enrichedMap = new Map(enriched.map(e => [e.raw_name, e]))
      enriched.forEach(e => {
        if (e.source === 'ai') aiStats.ai_enriched++
        else if (e.source === 'cache') aiStats.ai_cached++
        else aiStats.ai_failed++
      })
    } catch (err) {
      console.error('[import-xls] enrichProductBatch failed:', err)
    }
  }

  // ── Build and insert buffer rows ────────────────────────────────────────────
  const bufferRows = rows.map(row => {
    const norm = normName(row.name)
    let matched_product_id: number | null = null
    let match_source: string | null = null

    if (aliasByNorm.has(norm)) {
      matched_product_id = aliasByNorm.get(norm)!
      match_source = 'alias'
    } else if (productByNorm.has(norm)) {
      matched_product_id = productByNorm.get(norm)!
      match_source = 'exact_name'
    }

    const enriched = enrichedMap.get(row.name)
    const parsed = parseNomenclature(row.name)
    const speciesId = enriched?.species_id ?? null
    let subcategory: string | null = null
    let variety_type: string | null = null
    if (speciesId && SPECIES_SUBCAT[speciesId]) {
      const entry = SPECIES_SUBCAT[speciesId]
      subcategory = fileCategory === 'pot' && entry.subcat === 'roses' ? 'flowering' : entry.subcat
      variety_type = fileCategory === 'pot' ? null : (entry.vt ?? null)
    } else {
      const kw = getSubcatByKeyword(row.name, fileCategory)
      subcategory = kw.subcategory
      variety_type = kw.variety_type
    }

    return {
      import_id: importId,
      raw_name: row.name,
      norm_name: norm,
      qty: row.qty,
      price: row.price,
      matched_product_id,
      status: matched_product_id ? 'matched' : 'unmatched',
      match_source,
      file_category: fileCategory,
      file_country: fileCountry,
      enriched_subcategory: subcategory,
      enriched_variety_type: variety_type,
      enriched_colors: enriched?.color ? [enriched.color] : null,
      enriched_country_iso: enriched?.country_iso ?? null,
      enriched_display_name: enriched?.cultivar_cyrillic
        ? enriched.cultivar_cyrillic.trim().replace(/\b\w/g, c => c.toUpperCase()) || null
        : null,
    }
  })

  const { error: insErr } = await supabase.from('stock_import_rows').insert(bufferRows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const matched   = bufferRows.filter(r => r.status === 'matched').length
  const unmatched = bufferRows.filter(r => r.status === 'unmatched').length

  return NextResponse.json({
    importId, total: rows.length, matched, unmatched,
    category: fileCategory, ...aiStats,
  })
}
