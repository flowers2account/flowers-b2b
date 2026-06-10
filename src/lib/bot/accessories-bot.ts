// Логика ИИ-бота поддержки по РАСХОДКЕ (category='accessories').
// Переиспользует Gemini (GOOGLE_GEMINI_API_KEY) и Supabase service-role клиент.

import { createAdminClient } from '@/lib/supabase/admin'

const GEMINI_MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'models/gemini-flash-lite-latest'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:generateContent`

// Системный промпт для шага C — правится здесь (Цвет).
const SYSTEM_PROMPT = `Ты — консультант оптовой базы «Цветы Уральска». Отвечаешь ТОЛЬКО по расходным
материалам (горшки, удобрения, плёнка, ленты, упаковка, коробки, средства защиты и т.п.)
из приведённого ниже списка.
Правила:
1) Используй ТОЛЬКО данные из списка. Цены и наличие НЕ выдумывай.
2) Если подходящего товара в списке нет, либо вопрос про цветы, заказ, доставку,
   оплату, скидки или это жалоба — верни ровно NO_ANSWER и больше ничего.
3) Отвечай кратко и по-деловому, на русском. Указывай название, цену в тенге
   и есть ли в наличии (qty>0 — да). Единицы и фасовку не додумывай — называй как в карточке.
4) Оформление заказа не предлагай: для заказа клиент пишет менеджеру.`

interface ScopeResult {
  in_scope: boolean
  keywords: string[]
}

interface AccessoryRow {
  id: number
  display_name: string | null
  subcategory: string | null
  price: number | null
  unit: string | null
  qty: number | null
  pack_size: number | null
}

async function callGemini(prompt: string, jsonMode: boolean): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) {
    console.error('[accessories-bot] GOOGLE_GEMINI_API_KEY not set')
    return null
  }
  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    })
    if (!res.ok) {
      console.error('[accessories-bot] Gemini HTTP error:', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text
    return text ?? null
  } catch (err) {
    console.error('[accessories-bot] Gemini call failed:', err)
    return null
  }
}

/** Шаг A: классификация сообщения — расходка ли это, и какие ключевые слова искать. */
async function classifyMessage(message: string): Promise<ScopeResult> {
  const prompt = `Ты классификатор сообщений клиента оптовой базы цветов.
Определи, относится ли вопрос к РАСХОДНЫМ МАТЕРИАЛАМ (горшки, кашпо, удобрения, грунт,
плёнка, ленты, упаковка, бумага, коробки, корзины, средства защиты растений, инструменты,
сопутствующие товары). Вопросы про сами цветы, заказ, доставку, оплату, скидки, жалобы —
НЕ в этой области.

Верни ТОЛЬКО JSON-объект без markdown:
{ "in_scope": boolean, "keywords": string[] }

- in_scope=true только если вопрос про расходку.
- keywords: 1–5 коротких ключевых слов (на русском, в нижнем регистре, без чисел и единиц),
  по которым искать товар в каталоге. Если in_scope=false — пустой массив.

Примеры:
"есть удобрение для роз и почём" → {"in_scope":true,"keywords":["удобрение"]}
"нужна плёнка матовая для букетов" → {"in_scope":true,"keywords":["плёнка","матовая"]}
"когда привезёте розы?" → {"in_scope":false,"keywords":[]}
"как оформить заказ?" → {"in_scope":false,"keywords":[]}

Сообщение клиента: ${JSON.stringify(message)}`

  const text = await callGemini(prompt, true)
  if (!text) return { in_scope: false, keywords: [] }
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as Partial<ScopeResult>
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      : []
    return { in_scope: Boolean(parsed.in_scope) && keywords.length > 0, keywords }
  } catch (err) {
    console.error('[accessories-bot] classify parse failed:', err, text)
    return { in_scope: false, keywords: [] }
  }
}

/** Шаг B: поиск по расходке (ILIKE по name/display_name). */
async function searchAccessories(keywords: string[]): Promise<AccessoryRow[]> {
  if (keywords.length === 0) return []
  const supabase = createAdminClient()

  // Собираем OR-фильтр PostgREST: name.ilike.%kw%,display_name.ilike.%kw%,...
  const orParts: string[] = []
  for (const kw of keywords) {
    const safe = kw.replace(/[%,()]/g, ' ').trim()
    if (!safe) continue
    orParts.push(`name.ilike.%${safe}%`)
    orParts.push(`display_name.ilike.%${safe}%`)
  }
  if (orParts.length === 0) return []

  const { data, error } = await supabase
    .from('products')
    .select('id, display_name, subcategory, price, unit, qty, pack_size')
    .eq('category', 'accessories')
    .eq('is_active', true)
    .eq('hidden_for_demo', false)
    .gt('price', 0)
    .or(orParts.join(','))
    .limit(20)

  if (error) {
    console.error('[accessories-bot] search failed:', error.message)
    return []
  }
  return (data ?? []) as AccessoryRow[]
}

/** Шаг C: сформировать ответ или NO_ANSWER. */
async function composeAnswer(message: string, rows: AccessoryRow[]): Promise<string | null> {
  const prompt = `${SYSTEM_PROMPT}
Список товаров (JSON): ${JSON.stringify(rows)}

Сообщение клиента: ${message}`

  const text = await callGemini(prompt, false)
  if (!text) return null
  const answer = text.trim()
  if (!answer || answer === 'NO_ANSWER' || answer.includes('NO_ANSWER')) return null
  return answer
}

/**
 * Главный конвейер. Возвращает текст ответа клиенту либо null
 * (если вне области / нет данных / ошибка — менеджер обрабатывает сам).
 */
export async function getAccessoriesReply(message: string): Promise<string | null> {
  if (!message || !message.trim()) return null

  const scope = await classifyMessage(message)
  if (!scope.in_scope) return null

  const rows = await searchAccessories(scope.keywords)
  if (rows.length === 0) return null

  return composeAnswer(message, rows)
}
