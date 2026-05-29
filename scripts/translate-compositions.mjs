// Запуск: node --env-file=.env.local scripts/translate-compositions.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const PROMPT_TEMPLATE = (items) => `Ты создаёшь русские названия для горшечных аранжировок (compositions) флористического B2B магазина.

Вход: массив объектов {id, variant, pot_material, pot_form, pot_diameter, height}
Выход: массив {id, display_name} — краткое товарное название на русском.

ПЕРЕВОД МАТЕРИАЛОВ (pot_material):
keramiek → керамика
glas → стекло
steen → камень / цемент
kunststof → пластик
aardewerk → терракота
bamboe → бамбук

ПЕРЕВОД ФОРМ (pot_form):
terrarium → террариум
sierpot → кашпо
gemengde vormen → микс форм
overige → стандарт
bal → шар
vierkant → квадрат
cilinder → цилиндр

ПРИНЦИП ФОРМИРОВАНИЯ display_name:
1. Определи тип аранжировки из variant (террариум, мини-сад, летние зелёные, башня и т.п.)
2. Укажи материал горшка
3. Добавь размеры: Ø{pot_diameter} H{height}
4. Если variant содержит слова mix / groenmix / minimix / minigroenmix — добавь "микс"
5. Если variant содержит Scandinavian, Saxon, Caribbean, Caribbean, Summer Greens — переведи название

ФОРМАТ: краткое название, 3-6 слов + размеры
ПРИМЕРЫ:
variant "Arrangement terrarium in glazen terrarium", glas, terrarium, Ø17 H31 → "Аранжировка террариум стекло Ø17 H31"
variant "Mini Garden Pot 17cm", keramiek, overige, Ø17 H25 → "Мини-сад керамика Ø17 H25"
variant "Summer Greens", glas, sierpot, Ø18 H35 → "Летние зелёные кашпо стекло Ø18 H35"
variant "Torino towers mini groenmix", keramiek, overige, Ø10 H15 → "Башенки микс керамика Ø10 H15"
variant "Casa Scandinavian", steen, gemengde vormen, Ø11 H25 → "Аранжировка скандинавская цемент Ø11 H25"
variant "Chillings Grey mixtray minigroenmix", keramiek, overige, Ø13 H15 → "Мини-микс серый поднос керамика Ø13 H15"
variant "Jeans Cap Blue Pilea Depressa", keramiek, overige, Ø13 H12 → "Пилея джинсовый горшок Ø13 H12"
variant null, null, null, Ø17 H25 → "Аранжировка зелёная Ø17 H25"

ВЕРНИ ТОЛЬКО JSON без markdown:
${JSON.stringify(items)}

[{"id":...,"display_name":"..."}]`

async function callGemini(items, apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT_TEMPLATE(items) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    }
  )
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Пустой ответ')
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

async function run() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) { console.error('GOOGLE_GEMINI_API_KEY не задан'); process.exit(1) }

  const { data: products, error } = await supabase
    .from('products')
    .select('id, display_name, variant, pot_material, pot_form, pot_diameter, length_cm')
    .eq('category', 'pot')
    .eq('subcategory', 'compositions')
    .order('id')

  if (error) { console.error('DB error:', error.message); process.exit(1) }

  // Untranslated = display_name starts with "Arr." (raw Waterdrinker Dutch name)
  const untranslated = products.filter(p => p.display_name?.startsWith('Arr.'))
  console.log(`Всего композиций: ${products.length}, нужно перевести: ${untranslated.length}\n`)
  if (untranslated.length === 0) { console.log('Все переведены!'); return }

  const BATCH = 40
  const batches = []
  for (let i = 0; i < untranslated.length; i += BATCH)
    batches.push(untranslated.slice(i, i + BATCH))

  let allUpdates = []
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    console.log(`Батч ${b + 1}/${batches.length}: ${batch.length} позиций...`)
    const input = batch.map(p => ({
      id: p.id,
      variant: p.variant ?? null,
      pot_material: p.pot_material ?? null,
      pot_form: p.pot_form ?? null,
      pot_diameter: p.pot_diameter ?? null,
      height: p.length_cm ?? null,
    }))
    const results = await callGemini(input, apiKey)
    for (const r of results) {
      if (r.id && r.display_name) allUpdates.push({ id: r.id, display_name: r.display_name })
      else console.warn('Нет перевода:', JSON.stringify(r))
    }
    if (b < batches.length - 1) await new Promise(r => setTimeout(r, 1500))
  }

  console.log('\n=== Результат ===')
  allUpdates.forEach(u => {
    const orig = untranslated.find(p => p.id === u.id)
    console.log(`[${u.id}] ${orig?.variant ?? orig?.display_name}\n     → ${u.display_name}`)
  })

  console.log(`\n=== Обновляю ${allUpdates.length} записей ===`)
  let ok = 0, err = 0
  for (const u of allUpdates) {
    const { error } = await supabase.from('products').update({ display_name: u.display_name }).eq('id', u.id)
    if (error) { console.error(`ERR ${u.id}:`, error.message); err++ }
    else { process.stdout.write('.'); ok++ }
  }
  console.log(`\n\nГотово: ${ok} обновлено, ${err} ошибок`)
}

run()
