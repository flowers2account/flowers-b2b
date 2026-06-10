// Логика ИИ-бота поддержки по РАСХОДКЕ (category='accessories').
// Переиспользует Gemini (GOOGLE_GEMINI_API_KEY) и Supabase service-role клиент.

import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini } from '@/lib/gemini'

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
4) Оформление заказа не предлагай: для заказа клиент пишет менеджеру.
5) Отвечай дружелюбно и живо, но коротко; можно одно уместное приветствие или пожелание, без лишней болтовни.
6) Если называешь конкретный товар — добавь ссылку на его карточку (поле url) отдельной строкой или после названия. Не выдумывай ссылки: используй только url из списка. Если товаров несколько, дай ссылки на 2-3 самых подходящих, не на все.
7) Если клиент спрашивает про категорию целиком («какая есть плёнка», «что из удобрений»), можешь дать ОДНУ ссылку на подборку — поле catalog_url из списка. Используй только готовый catalog_url из списка, не конструируй параметры сам.`

// Готовые ответы на small talk — правятся здесь (Цвет). Без похода в Supabase/Gemini.
const SMALLTALK_REPLIES: Record<string, string> = {
  greeting: 'Здравствуйте! Я помощник «Цветы Уральска» 🌸 Подскажу цены и наличие по расходным материалам — горшки, упаковка, удобрения, ленты и др. По цветам и оформлению заказа вам ответит менеджер.',
  thanks: 'Пожалуйста! Обращайтесь 🌸',
  farewell: 'Хорошего дня! Будем рады помочь снова.',
}

type Intent = 'smalltalk' | 'accessories' | 'other'

interface ClassifyResult {
  intent: Intent
  /** Для accessories — ключевые слова поиска; для smalltalk — подтип (greeting/thanks/farewell). */
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

/** Шаг A: классификация — small talk / расходка / прочее + ключевые слова. */
async function classifyMessage(message: string): Promise<ClassifyResult> {
  const prompt = `Ты классификатор сообщений клиента оптовой базы цветов.
Определи intent сообщения:
- "smalltalk" — приветствие, благодарность или прощание (без конкретного вопроса).
- "accessories" — вопрос про РАСХОДНЫЕ МАТЕРИАЛЫ (горшки, кашпо, удобрения, грунт,
  плёнка, ленты, упаковка, бумага, коробки, корзины, средства защиты растений,
  инструменты, сопутствующие товары).
- "other" — всё остальное: вопросы про сами цветы, заказ, доставку, оплату, скидки, жалобы.

Верни ТОЛЬКО JSON-объект без markdown:
{ "intent": "smalltalk" | "accessories" | "other", "keywords": string[] }

- Для "accessories": keywords — 1–5 коротких ключевых слов (на русском, в нижнем
  регистре, без чисел и единиц), по которым искать товар в каталоге.
- Для "smalltalk": keywords — ровно один подтип: "greeting" (привет/здравствуйте),
  "thanks" (спасибо/благодарю) или "farewell" (пока/до свидания/всего доброго).
- Для "other": keywords — пустой массив.

Примеры:
"есть удобрение для роз и почём" → {"intent":"accessories","keywords":["удобрение"]}
"нужна плёнка матовая для букетов" → {"intent":"accessories","keywords":["плёнка","матовая"]}
"здравствуйте" → {"intent":"smalltalk","keywords":["greeting"]}
"спасибо большое" → {"intent":"smalltalk","keywords":["thanks"]}
"до свидания" → {"intent":"smalltalk","keywords":["farewell"]}
"когда привезёте розы?" → {"intent":"other","keywords":[]}
"как оформить заказ?" → {"intent":"other","keywords":[]}

Сообщение клиента: ${JSON.stringify(message)}`

  const text = await callGemini(prompt, { json: true, temperature: 0.1 })
  if (!text) return { intent: 'other', keywords: [] }
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as { intent?: unknown; keywords?: unknown }
    const intent: Intent =
      parsed.intent === 'smalltalk' || parsed.intent === 'accessories' ? parsed.intent : 'other'
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      : []
    return { intent, keywords }
  } catch (err) {
    console.error('[accessories-bot] classify parse failed:', err, text)
    return { intent: 'other', keywords: [] }
  }
}

/** Шаг B: поиск по расходке (ILIKE по name/display_name). */
async function searchAccessories(keywords: string[]): Promise<AccessoryRow[]> {
  if (keywords.length === 0) return []
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[accessories-bot] SUPABASE_SERVICE_ROLE_KEY not set')
    return []
  }
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

const SITE_URL = 'https://uralskflowers.kz'

/** Шаг C: сформировать ответ или NO_ANSWER. */
async function composeAnswer(message: string, rows: AccessoryRow[]): Promise<string | null> {
  // Готовые ссылки: карточка товара и подборка по подкатегории (catalog читает ?category=accessories&leaves=<subcategory>).
  const context = rows.map((r) => ({
    ...r,
    url: `${SITE_URL}/product/${r.id}`,
    catalog_url: r.subcategory
      ? `${SITE_URL}/catalog?category=accessories&leaves=${r.subcategory}`
      : undefined,
  }))

  const prompt = `${SYSTEM_PROMPT}
Список товаров (JSON): ${JSON.stringify(context)}

Сообщение клиента: ${message}`

  const text = await callGemini(prompt, { temperature: 0.1 })
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

  const cls = await classifyMessage(message)
  console.log('[accessories-bot] classify:', JSON.stringify(cls))

  // Small talk — готовый шаблон, без Supabase и Gemini-compose.
  if (cls.intent === 'smalltalk') {
    const reply = SMALLTALK_REPLIES[cls.keywords[0]] ?? SMALLTALK_REPLIES.greeting
    console.log('[accessories-bot] smalltalk:', cls.keywords[0] ?? 'greeting')
    return reply
  }

  // Прочее (цветы/заказ/доставка/жалоба) — молчим, диалог менеджеру.
  if (cls.intent !== 'accessories') return null

  const rows = await searchAccessories(cls.keywords)
  console.log(`[accessories-bot] search: ${rows.length} товаров по`, JSON.stringify(cls.keywords))
  if (rows.length === 0) return null

  const answer = await composeAnswer(message, rows)
  console.log('[accessories-bot] compose:', answer ? `ответ len=${answer.length}` : 'NO_ANSWER')
  return answer
}
