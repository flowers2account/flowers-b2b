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
  7:  { subcat: 'lilies'        },                 // lily_la
  8:  { subcat: 'lilies'        },                 // lily_oriental
  9:  { subcat: 'lilies'        },                 // lily_longiflorum
  10: { subcat: 'gerberas'      },
  11: { subcat: 'tulips'        },
  12: { subcat: 'carnations'    },
  47: { subcat: 'carnations',   vt: 'single' },    // carnation_standard
  48: { subcat: 'carnations',   vt: 'spray'  },    // carnation_spray
  13: { subcat: 'lisianthus'   },                  // eustoma
  14: { subcat: 'alstroemeria' },
  16: { subcat: 'peonies'      },                  // peony cut
  17: { subcat: 'ranunculus'   },
  21: { subcat: 'greens'       },                  // eucalyptus
  22: { subcat: 'greens'       },                  // ruscus
  28: { subcat: 'fillers'      },                  // tanacetum
  32: { subcat: 'orchids'      },                  // cymbidium
  34: { subcat: 'seasonal'     },                  // hyacinth
  35: { subcat: 'seasonal'     },                  // narcissus
  36: { subcat: 'berries'      },                  // hypericum
  37: { subcat: 'fillers'      },                  // statice
  39: { subcat: 'texture'      },                  // chamelaucium (wax flower)
  40: { subcat: 'accents'      },                  // matthiola
  41: { subcat: 'texture'      },                  // brunia
  42: { subcat: 'callas'       },
  43: { subcat: 'fillers'      },                  // mimosa
  44: { subcat: 'greens'       },                  // leatherleaf
  45: { subcat: 'accents'      },                  // gladiolus
}

// keyword fallback → subcategory (for products with no species)
function getSubcatByKeyword(name: string, category: 'cut' | 'pot'): { subcategory: string | null; variety_type: string | null } {
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
  return { subcategory: null, variety_type: null }
}

function autoTagProduct(subcategory: string | null, variety_type: string | null, name: string): string[] {
  const tags: string[] = []
  const n = name.toLowerCase()
  const sub = subcategory ?? ''

  // exotic: тропические, необычные формы и фактуры
  if (['orchids', 'anthuriums', 'proteas'].includes(sub) ||
      /стрелиц|геликон|леукодендрон|лейкодендрон/.test(n)) {
    tags.push('exotic')
  }

  // seasonal: ограниченный сезон поставки
  if (sub === 'peonies' ||
      /амарилл|гиппеаструм|нобилис|илекс|мимоза|георгин/.test(n)) {
    tags.push('seasonal')
  }

  // spring: весенние и луковичные
  if (['tulips', 'ranunculus', 'anemones'].includes(sub) ||
      /нарцисс|гиацинт|мускари/.test(n)) {
    tags.push('spring')
  }

  // wedding: популярны у свадебных флористов
  if (['lisianthus', 'hydrangeas', 'ranunculus'].includes(sub) ||
      (sub === 'roses' && variety_type === 'decorative') ||
      /уайт о.?хара|playa blanca|вайт о.?хара/.test(n)) {
    tags.push('wedding')
  }

  // premium: дорогие и статусные позиции
  if (sub === 'peonies' ||
      /david.?austin|дэвид.?остин/.test(n) ||
      /phalaenopsis|фаленопсис|cymbidium|цимбидиум/.test(n) ||
      (sub === 'proteas' && /king|кинг/.test(n)) ||
      /premium|премиум/.test(n)) {
    tags.push('premium')
  }

  return [...new Set(tags)]
}

function deriveSubcat(speciesId: number | null | undefined, category: 'cut' | 'pot', productName: string): { subcategory: string | null; variety_type: string | null } {
  if (speciesId) {
    const entry = SPECIES_SUBCAT[speciesId]
    if (entry) {
      // pot roses → flowering, not roses
      const subcat = category === 'pot' && entry.subcat === 'roses' ? 'flowering' : entry.subcat
      let vt = category === 'pot' ? null : (entry.vt ?? null)
      // Для generic carnation (id=12): определяем тип по ключевым словам в названии
      if (speciesId === 12 && vt === null && category === 'cut') {
        const n = productName.toLowerCase()
        vt = /ветковая|кустовая|спрей|spray/.test(n) ? 'spray' : 'single'
      }
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
  const fileCountry = countryFromText(file.name)

  function cleanTranslatorName(s: string): string {
    return s
      .replace(/\*\d+/g, '')                                          // *140
      .replace(/\b\d+\s*(?:см|cm)?\b/gi, '')                         // 140, 60см
      .replace(/\b[A-Z]{3,}\b/g, '')                                  // LINFLOWERS, ADOMEX
      .replace(/\s*\((?:китай|эквадор|кения|голландия|израиль|колумбия|эфиопия|россия|импорт|china)\)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase())                         // INITCAP
  }

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
      // Страна: имя файла → AI (детект из названия товара — позже)
      const countryIso: string | null = fileCountry ?? enriched?.country_iso ?? null

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

      // 1.5. Устанавливаем variety_id в TM ДО вставки продукта —
      //      чтобы триггер generate_product_display_name нашёл cultivar_cyrillic.
      //      Два прохода: по id (AI-запись с длиной) и по имени сорта (ручная запись без длины).
      const varNorm = parsed.variety_name.toLowerCase().trim().replace(/\s+/g, ' ')
      await Promise.all([
        enriched?.translation_memory_id
          ? supabase.from('translation_memory')
              .update({ variety_id: variety.id })
              .eq('id', enriched.translation_memory_id)
          : Promise.resolve(),
        supabase.from('translation_memory')
          .update({ variety_id: variety.id })
          .eq('normalized_original', varNorm)
          .is('variety_id', null)
          .eq('is_flagged', false),
      ])

      // 1.6. Ищем утверждённый перевод переводчика для display_name.
      //      Ищем по cultivar_cyrillic в normalized_translated TM-записей с approved_by.
      //      Имена из 2+ слов достаточно специфичны; короткие (Микс, Ред) пропускаем.
      let translatorDisplayName: string | null = null
      if (enriched?.cultivar_cyrillic && enriched.cultivar_cyrillic.trim().split(/\s+/).length >= 2) {
        const cultivarNorm = enriched.cultivar_cyrillic.toLowerCase().replace(/\s+/g, ' ').trim()
        const { data: tmApproved } = await supabase
          .from('translation_memory')
          .select('translated')
          .not('approved_by', 'is', null)
          .eq('is_flagged', false)
          .ilike('normalized_translated', `%${cultivarNorm}%`)
          .order('confidence', { ascending: false })
          .limit(1)
          .maybeSingle()
        translatorDisplayName = tmApproved?.translated
          ? cleanTranslatorName(tmApproved.translated)
          : null
      }

      // 2. Ищем product только по name (raw из 1С) — стабильный якорь.
      //    Цена, длина, страна — обновляемые метаданные, не идентификаторы.
      //    Включая is_active=false — чтобы реактивировать старую карточку.
      const { data: existingProduct } = await supabase
        .from('products')
        .select('id, subcategory, variety_type, country_iso, length_cm, price, display_name, colors, tags')
        .eq('name', row.name)
        .maybeSingle()

      const speciesId = (variety as any).species_id ?? enriched?.species_id ?? null
      const { subcategory, variety_type } = deriveSubcat(speciesId, category, row.name)

      const autoTags = autoTagProduct(subcategory, variety_type, row.name)

      let productId: number

      if (existingProduct) {
        const updatePayload: Record<string, unknown> = {
          qty: row.qty,
          price: row.price,
          is_active: true,
          // не перезаписываем поля, которые пользователь мог задать вручную
          subcategory: (existingProduct as any).subcategory ?? subcategory,
          variety_type: (existingProduct as any).variety_type ?? variety_type,
        }
        // previous_price: сохраняем старую цену только если новая ниже
        if ((existingProduct as any).price && row.price < (existingProduct as any).price) {
          updatePayload.previous_price = (existingProduct as any).price
        }
        // length_cm: берём из парсера только если у продукта ещё не задано вручную
        if (!(existingProduct as any).length_cm && parsed.length_cm !== null) {
          updatePayload.length_cm = parsed.length_cm
        }
        // country_iso: обогащаем только если был NULL
        if (countryIso && !(existingProduct as any).country_iso) {
          updatePayload.country_iso = countryIso
        }
        // display_name: проставляем из переводчика, только если ещё не задано вручную
        if (translatorDisplayName && !(existingProduct as any).display_name) {
          updatePayload.display_name = translatorDisplayName
        }
        // colors: берём из AI если у продукта ещё нет
        if (enriched?.color && !((existingProduct as any).colors as string[] | null)?.length) {
          updatePayload.colors = [enriched.color]
        }
        // tags: добавляем авто-теги если у продукта ещё нет тегов
        if (autoTags.length && !((existingProduct as any).tags as string[] | null)?.length) {
          updatePayload.tags = autoTags
        }
        const { error: pErr } = await supabase
          .from('products')
          .update(updatePayload)
          .eq('id', existingProduct.id)
        if (pErr) throw new Error(`product update: ${pErr.message}`)
        productId = existingProduct.id
      } else {
        const { data: newProduct, error: pErr } = await supabase
          .from('products')
          .insert({
            variety_id: variety.id,
            name: row.name,
            display_name: translatorDisplayName,
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
            colors: enriched?.color ? [enriched.color] : null,
            tags: autoTags.length ? autoTags : null,
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

      // 4. Обратная связь в translation_memory: записываем product_id
      if (enriched?.translation_memory_id) {
        await supabase
          .from('translation_memory')
          .update({ product_id: productId })
          .eq('id', enriched.translation_memory_id)
      }

      importedProductIds.add(productId)
      success++
    } catch (e) {
      errors++
      errorLog.push(`${row.name}: ${String(e)}`)
    }
  }

  return NextResponse.json({
    success, errors, zeroed, errorLog, ...aiStats,
    importedIds: Array.from(importedProductIds),
    category: categoryOverride ?? 'cut',
  })
}
