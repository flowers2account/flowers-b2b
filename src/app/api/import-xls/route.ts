export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { parseNomenclature } from '@/lib/parse-nomenclature'
import { enrichProductBatch } from '@/lib/naming/ai-enrichment'

// species_id → { subcategory, variety_type }
const SPECIES_SUBCAT: Record<number, { subcat: string; vt?: string }> = {
  1:  { subcat: 'roses',          vt: 'single' }, // rose_large_flowered
  2:  { subcat: 'roses',          vt: 'spray'  }, // rose_spray
  3:  { subcat: 'roses',          vt: 'spray'  }, // rose_garden
  4:  { subcat: 'chrysanthemums', vt: 'single' }, // chrysanthemum_disbud
  5:  { subcat: 'chrysanthemums', vt: 'spray'  }, // chrysanthemum_spray
  6:  { subcat: 'chrysanthemums', vt: 'spray'  }, // chrysanthemum_santini
  7:  { subcat: 'lilies'   },                      // lily_la
  8:  { subcat: 'lilies'   },                      // lily_oriental
  9:  { subcat: 'lilies'   },                      // lily_longiflorum
  10: { subcat: 'gerberas' },
  11: { subcat: 'tulips'   },
  12: { subcat: 'carnations' },
  13: { subcat: 'lisianthus' },
  14: { subcat: 'alstroemeria' },
  16: { subcat: 'accents'  },  // peony cut
  17: { subcat: 'accents'  },  // ranunculus
  21: { subcat: 'greens'   },  // eucalyptus
  22: { subcat: 'greens'   },  // ruscus
  28: { subcat: 'fillers'  },  // tanacetum
  32: { subcat: 'accents'  },  // cymbidium
  34: { subcat: 'seasonal' },  // hyacinth
  35: { subcat: 'seasonal' },  // narcissus
  36: { subcat: 'accents'  },  // hypericum
  37: { subcat: 'fillers'  },  // statice
  39: { subcat: 'accents'  },  // chamelaucium
  40: { subcat: 'accents'  },  // matthiola
  41: { subcat: 'accents'  },  // brunia
  42: { subcat: 'callas'   },
  43: { subcat: 'accents'  },  // mimosa
  44: { subcat: 'greens'   },  // leatherleaf
  45: { subcat: 'accents'  },  // gladiolus
}

// keyword fallback → subcategory (for products with no species)
function getSubcatByKeyword(name: string, category: 'cut' | 'pot'): { subcategory: string | null; variety_type: string | null } {
  const n = name.toLowerCase()
  if (category === 'cut') {
    if (/бамбук|бетула|саликс/.test(n)) return { subcategory: 'greens', variety_type: null }
    if (/молюцелла|чико/.test(n))        return { subcategory: 'fillers', variety_type: null }
    if (/дельфиниум|лекукодендрон|протея/.test(n)) return { subcategory: 'accents', variety_type: null }
    if (/гиппеаструм/.test(n))           return { subcategory: 'spring', variety_type: null }
    if (/квинс кроун|^микс/.test(n))     return { subcategory: 'roses',  variety_type: 'single' }
  }
  if (category === 'pot') {
    if (/бамбук|драцена|замиокул|клузия|маранта|фикус|хамедорея|шеффлера|радермахера|фатсия|эонимус/.test(n)) return { subcategory: 'green', variety_type: null }
    if (/пахира|юкка/.test(n))           return { subcategory: 'large',    variety_type: null }
    if (/каланхое|пеларгони|пеперомия|рипсалидопс|сенполия|шлюмбергера|гузмания|спатифиллум|цикламен|ранункулюс/.test(n)) return { subcategory: 'flowering', variety_type: null }
    if (/алое/.test(n))                  return { subcategory: 'succulents', variety_type: null }
    if (/туя|фритиллария/.test(n))       return { subcategory: 'outdoor',   variety_type: null }
    if (/антуриум|фаленопсис|орхидея|гортензия|нарцисс|гвоздика|роза/.test(n)) return { subcategory: 'flowering', variety_type: null }
  }
  return { subcategory: null, variety_type: null }
}

function deriveSubcat(speciesId: number | null | undefined, category: 'cut' | 'pot', productName: string): { subcategory: string | null; variety_type: string | null } {
  if (speciesId) {
    const entry = SPECIES_SUBCAT[speciesId]
    if (entry) {
      // pot roses → flowering, not roses
      const subcat = category === 'pot' && entry.subcat === 'roses' ? 'flowering' : entry.subcat
      const vt = category === 'pot' ? null : (entry.vt ?? null)
      return { subcategory: subcat, variety_type: vt }
    }
  }
  return getSubcatByKeyword(productName, category)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const formData = await req.formData()
  const file = formData.get('file') as File
  const userId = formData.get('userId') as string
  const isLast = formData.get('isLast') === 'true'
  const isFirst = formData.get('isFirst') === 'true'
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  // Парсим строки из формата 1С
  // Формат: [пусто, Наименование, Количество, Цена, Стоимость]
  // или старый формат: [Наименование, Количество, Цена]
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
    } else {
      continue
    }

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

  let success = 0
  let errors = 0
  let zeroed = 0
  const errorLog: string[] = []
  const today = new Date().toISOString().split('T')[0]
  const importedProductIds = new Set<number>()

  // Категория и страна из имени файла
  const fileNameLower = file.name.toLowerCase()
  const categoryOverride: 'cut' | 'pot' | null =
    fileNameLower.includes('горшок') || fileNameLower.includes('горш') ? 'pot' :
    fileNameLower.includes('срез') ? 'cut' : null
  const isChina = fileNameLower.includes('китай') || fileNameLower.includes('china')

  // AI-обогащение всех строк до основного цикла
  const aiStats = { ai_enriched: 0, ai_cached: 0, ai_failed: 0, varieties_species_filled: 0 }
  let enrichedMap = new Map<string, Awaited<ReturnType<typeof enrichProductBatch>>[number]>()
  try {
    const enriched = await enrichProductBatch(rows.map(r => r.name))
    enrichedMap = new Map(enriched.map(e => [e.raw_name, e]))
  } catch (err) {
    console.error('[import-xls] enrichProductBatch failed:', err)
  }

  for (const row of rows) {
    try {
      const enriched = enrichedMap.get(row.name)
      if (enriched?.source === 'cache') aiStats.ai_cached++
      else if (enriched?.source === 'ai') aiStats.ai_enriched++
      else aiStats.ai_failed++

      const parsed = parseNomenclature(row.name)
      const category = categoryOverride ?? parsed.category
      // Страна: файл (isChina) имеет приоритет над AI
      const countryIso: string | null = isChina ? 'CN' : (enriched?.country_iso ?? null)

      // 1. UPSERT variety (ключ — только название сорта, lowercase)
      const { data: variety, error: vErr } = await supabase
        .from('varieties')
        .upsert(
          { name: parsed.variety_name, category },
          { onConflict: 'name', ignoreDuplicates: false }
        )
        .select('id, species_id')
        .single()
      if (vErr || !variety) throw new Error(`variety: ${vErr?.message}`)

      // Заполняем species_id от AI если у сорта его ещё нет
      if (!(variety as any).species_id && enriched?.species_id) {
        await supabase.from('varieties').update({ species_id: enriched.species_id }).eq('id', variety.id)
        aiStats.varieties_species_filled++
      }

      // 2. Ищем product по UNIQUE ключу (variety_id, length_cm, country_iso, price)
      //    Включая is_active=false — чтобы реактивировать старую карточку с той же ценой
      let productQuery = supabase
        .from('products')
        .select('id, subcategory, variety_type')
        .eq('variety_id', variety.id)
        .eq('price', row.price)

      if (parsed.length_cm !== null) {
        productQuery = productQuery.eq('length_cm', parsed.length_cm)
      } else {
        productQuery = productQuery.is('length_cm', null)
      }

      if (countryIso) {
        productQuery = productQuery.eq('country_iso', countryIso)
      } else {
        productQuery = productQuery.is('country_iso', null)
      }

      const { data: existingProduct } = await productQuery.maybeSingle()

      const speciesId = (variety as any).species_id ?? enriched?.species_id ?? null
      const { subcategory, variety_type } = deriveSubcat(speciesId, category, row.name)

      let productId: number

      if (existingProduct) {
        const { error: pErr } = await supabase
          .from('products')
          .update({
            qty: row.qty,
            arrival_date: today,
            is_active: true,
            name: row.name,
            length_cm: parsed.length_cm ?? null,
            pot_diameter: parsed.pot_diameter ?? null,
            // не перезаписываем если уже заполнено вручную
            subcategory: (existingProduct as any).subcategory ?? subcategory,
            variety_type: (existingProduct as any).variety_type ?? variety_type,
          })
          .eq('id', existingProduct.id)
        if (pErr) throw new Error(`product update: ${pErr.message}`)
        productId = existingProduct.id
      } else {
        const { data: newProduct, error: pErr } = await supabase
          .from('products')
          .insert({
            variety_id: variety.id,
            name: row.name,
            length_cm: parsed.length_cm ?? null,
            pot_diameter: parsed.pot_diameter ?? null,
            pack_size: category === 'pot' ? 1 : parsed.pack_size,
            category,
            subcategory,
            variety_type,
            price: row.price,
            qty: row.qty,
            arrival_date: today,
            is_active: true,
            country_iso: countryIso,
          })
          .select('id')
          .single()
        if (pErr || !newProduct) throw new Error(`product insert: ${pErr?.message}`)
        productId = newProduct.id
      }

      // 3. Запись в ledger (аудит импорта)
      await supabase.from('inventory_ledger').insert({
        product_id: productId,
        action: 'import',
        quantity: row.qty,
        qty_before: 0,
        qty_after: row.qty,
        reference_type: 'import',
        created_by: userId || null,
      })

      // 4. Обратная связь в translation_memory
      if (enriched?.translation_memory_id) {
        await supabase
          .from('translation_memory')
          .update({ product_id: productId, variety_id: variety.id })
          .eq('id', enriched.translation_memory_id)
      }

      importedProductIds.add(productId)
      success++
    } catch (e) {
      errors++
      errorLog.push(`${row.name}: ${String(e)}`)
    }
  }

  // При последнем файле — деактивируем всё что не обновилось сегодня.
  // Работает для любого числа файлов: каждый файл ставит arrival_date=today,
  // после последнего — всё с другой датой считается отсутствующим.
  if (isLast) {
    const { data: stale } = await supabase
      .from('products')
      .select('id')
      .neq('arrival_date', today)
      .eq('is_active', true)

    if (stale?.length) {
      await supabase.from('products')
        .update({ is_active: false, qty: 0 })
        .in('id', stale.map((p: { id: number }) => p.id))
      zeroed = stale.length
    }
  }

  return NextResponse.json({ success, errors, zeroed, errorLog, ...aiStats })
}
