// Логика ИИ-бота поддержки по РАСХОДКЕ (category='accessories').
// Переиспользует Gemini (GOOGLE_GEMINI_API_KEY) и Supabase service-role клиент.

import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini } from '@/lib/gemini'
import { CLIENT_FAQ } from '@/lib/bot/site-faq'
import { fetchDialogContext, type DialogMessage } from '@/lib/umnico'

// Единая формулировка «как позвать менеджера» — правится здесь (Цвет). Используется в
// готовых ответах и подставляется в промпты, чтобы везде звучало одинаково.
const MANAGER_CONTACT = 'напишите менеджеру в WhatsApp — зелёная кнопка вверху этого чата, или +7 700 757 5243.'

// Системный промпт для шага C — правится здесь (Цвет).
const SYSTEM_PROMPT = `Ты — консультант оптовой базы «Цветы Уральска». Отвечаешь ТОЛЬКО по расходным
материалам (горшки, удобрения, плёнка, ленты, упаковка, коробки, средства защиты и т.п.)
из приведённого ниже списка.

ГЛАВНОЕ ПРАВИЛО (соблюдай строго): если в истории диалога уже есть ТВОЁ сообщение или
приветствие — НЕ здоровайся и НЕ представляйся повторно. Сразу отвечай по сути, как
продолжение разговора. Здороваться можно только в самом первом сообщении диалога.

Остальные правила:
1) Используй ТОЛЬКО данные из списка. Цены и наличие НЕ выдумывай.
2) Отвечай кратко и по-деловому, на русском. Указывай название, цену в тенге и есть ли
   в наличии (qty>0 — да). Единицы и фасовку не додумывай — называй как в карточке.
3) Если найден 1–3 подходящих товара — отвечай сразу, БЕЗ уточняющих вопросов.
4) Если вариантов много или запрос размытый — задай ОДИН короткий уточняющий вопрос с
   вариантами (например: «Плёнка есть прозрачная, матовая и цветная — какая нужна?»).
   Не больше одного уточнения подряд: если в истории ты уже спрашивал уточнение, а клиент
   ответил — больше НЕ уточняй, а консультируй по сути.
5) Если называешь конкретный товар — добавь ссылку на его карточку (поле url) отдельной
   строкой или после названия. Только url из списка, не выдумывай. Для нескольких товаров —
   ссылки на 2–3 самых подходящих, не на все.
6) Для запроса по категории целиком («какая есть плёнка», «что из удобрений») можешь дать
   ОДНУ ссылку на подборку — готовый catalog_url из списка (не конструируй параметры сам).
7) Оформление заказа не предлагай: чтобы оформить заказ или позвать человека — ${MANAGER_CONTACT}
8) Отвечай дружелюбно и живо, но коротко, без лишней болтовни.
9) Ты — ИИ-помощник и не скрываешь этого; если спрашивают, бот ли ты — честно подтверждай и предлагай позвать менеджера, если нужен человек (${MANAGER_CONTACT}).
10) Прощайся / желай хорошего дня ТОЛЬКО если клиент явно прощается.
11) Если среди списка нет ничего подходящего под запрос — верни ровно NO_ANSWER и больше ничего.`

// Готовые ответы на small talk — правятся здесь (Цвет). Без похода в Supabase/Gemini.
const SMALLTALK_REPLIES: Record<string, string> = {
  greeting: 'Здравствуйте! Я ИИ-помощник «Цветы Уральска», на связи 24/7 🌸 Подскажу цены и наличие расходных материалов, помогу с регистрацией и работой сайта. По цветам и оформлению заказа ответит менеджер в рабочие часы.',
  thanks: 'Пожалуйста! Обращайтесь 🌸',
  farewell: 'Хорошего дня! Будем рады помочь снова.',
}

// Короткие ответы, когда бот уже писал в этом диалоге (повторное приветствие и т.п.) — правит Цвет.
const SMALLTALK_REPLIES_REPEAT: Record<string, string> = {
  greeting: 'Да-да, я тут! Чем помочь?',
}

// Ответ, когда по запросу про расходку ничего не нашлось — честно + контакт менеджера. Правит Цвет.
const NOT_FOUND_REPLY = `Не нашёл такого у нас в наличии 🙏 Подскажет точно — ${MANAGER_CONTACT}`

/** История диалога в компактный текст для промпта (старые→новые). */
function formatHistory(history: DialogMessage[]): string {
  if (!history.length) return ''
  return history
    .map((h) => `${h.role === 'client' ? 'Клиент' : h.role === 'bot' ? 'Бот' : 'Менеджер'}: ${h.text}`)
    .join('\n')
}

// Промпт для вопросов про сайт (регистрация/вход/PIN/заказ/доставка/оплата/график/контакты).
// Факты — строго из CLIENT_FAQ (единый источник, src/lib/bot/site-faq.ts).
const SITE_HELP_PROMPT = `Ты — помощник по сайту оптовой базы «Цветы Уральска». Отвечаешь на вопросы про
регистрацию, вход и PIN, оформление заказа, доставку, оплату, график, адрес и контакты —
СТРОГО по памятке ниже.

ГЛАВНОЕ ПРАВИЛО (соблюдай строго): если в истории диалога уже есть ТВОЁ сообщение или
приветствие — НЕ здоровайся повторно, сразу отвечай по сути как продолжение разговора.

Остальные правила:
1) Используй ТОЛЬКО факты из памятки. Чего в памятке нет — верни ровно NO_ANSWER и больше ничего.
2) Отвечай коротко и дружелюбно, на русском.
3) НИКОГДА не обещай: оплату по счёту (пока недоступна), оплату наличными, конкретную
   стоимость доставки (она индивидуальна), точное время выдачи PIN сверх формулировки
   «обычно несколько минут в рабочие часы».
4) Вопросы про КОНКРЕТНЫЙ заказ клиента («где мой заказ», «не пришла оплата», «когда привезёте
   моё») — это к менеджеру: верни ровно NO_ANSWER.
5) Уместно завершить ответ так: ${MANAGER_CONTACT}
6) Прощайся только если клиент явно прощается.

ПАМЯТКА:
${CLIENT_FAQ}`

// Канальная политика — правится здесь (Цвет). channelType = body.message.sa.type.
//   'auto'   → бот отвечает сам (полный конвейер)
//   'manual' → отвечает только в диалогах, включённых командой /бот (таблица bot_enabled_leads)
//   'off'    → полное молчание
// Каналы, не указанные тут, трактуются как 'off'.
export type ChannelMode = 'auto' | 'manual' | 'off'
export const CHANNEL_POLICY: Record<string, ChannelMode> = {
  widget: 'auto',
  whatsapp2: 'off',
}

type Intent = 'smalltalk' | 'accessories' | 'site_help' | 'other'

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

/** Шаг A: классификация — small talk / расходка / сайт / прочее + ключевые слова. */
async function classifyMessage(message: string, history: DialogMessage[] = []): Promise<ClassifyResult> {
  const histBlock = formatHistory(history)
  const prompt = `Ты классификатор сообщений клиента оптовой базы цветов.
Определи intent сообщения:
- "smalltalk" — приветствие, благодарность или прощание (без конкретного вопроса).
- "accessories" — вопрос про РАСХОДНЫЕ МАТЕРИАЛЫ (горшки, кашпо, удобрения, грунт,
  плёнка, ленты, упаковка, бумага, коробки, корзины, средства защиты растений,
  инструменты, сопутствующие товары).
- "site_help" — вопрос про РАБОТУ САЙТА: регистрация, доступ, вход, PIN, как оформить
  заказ, доставка (самовывоз/города/сроки/стоимость), оплата (карта/счёт/наличные),
  минимальный заказ, скидки, график работы, адрес склада, контакты.
- "other" — всё остальное: вопросы про сами цветы (сорта/наличие цветов), статус
  конкретного заказа клиента, жалобы.

Верни ТОЛЬКО JSON-объект без markdown:
{ "intent": "smalltalk" | "accessories" | "site_help" | "other", "keywords": string[] }

- Для "accessories": keywords — 1–5 коротких ключевых слов (на русском, в нижнем
  регистре, без чисел и единиц), по которым искать товар в каталоге.
- Для "smalltalk": keywords — ровно один подтип: "greeting", "thanks" или "farewell".
  "greeting" — ЛЮБАЯ форма приветствия: «привет», «здравствуйте», «здравствуйте!»,
  «добрый день/вечер/утро», «приветствую», «доброго времени», «привет ещё раз»,
  «здрасьте» — в т.ч. с восклицанием, опечатками и приставкой «ещё раз».
  "thanks" — спасибо/благодарю; "farewell" — пока/до свидания/всего доброго.
- Для "site_help" и "other": keywords — пустой массив.

Учитывай историю: короткие реплики ("а подешевле?", "сколько штук в упаковке?",
"давай вторую") — это продолжение темы, наследуй intent и keywords из контекста.

Примеры:
"есть удобрение для роз и почём" → {"intent":"accessories","keywords":["удобрение"]}
"нужна плёнка матовая для букетов" → {"intent":"accessories","keywords":["плёнка","матовая"]}
"здравствуйте" → {"intent":"smalltalk","keywords":["greeting"]}
"здравствуйте!" → {"intent":"smalltalk","keywords":["greeting"]}
"добрый день" → {"intent":"smalltalk","keywords":["greeting"]}
"привет ещё раз" → {"intent":"smalltalk","keywords":["greeting"]}
"спасибо большое" → {"intent":"smalltalk","keywords":["thanks"]}
"до свидания" → {"intent":"smalltalk","keywords":["farewell"]}
"как зарегистрироваться?" → {"intent":"site_help","keywords":[]}
"забыл пин, что делать" → {"intent":"site_help","keywords":[]}
"как оформить заказ?" → {"intent":"site_help","keywords":[]}
"доставляете в актобе?" → {"intent":"site_help","keywords":[]}
"можно оплатить наличными?" → {"intent":"site_help","keywords":[]}
"во сколько работаете?" → {"intent":"site_help","keywords":[]}
"когда привезёте розы?" → {"intent":"other","keywords":[]}
"где мой заказ?" → {"intent":"other","keywords":[]}
${histBlock ? `\nИстория диалога (старые→новые):\n${histBlock}\n` : ''}
Сообщение клиента: ${JSON.stringify(message)}`

  const text = await callGemini(prompt, { json: true, temperature: 0.1 })
  if (!text) return { intent: 'other', keywords: [] }
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as { intent?: unknown; keywords?: unknown }
    const intent: Intent =
      parsed.intent === 'smalltalk' || parsed.intent === 'accessories' || parsed.intent === 'site_help'
        ? parsed.intent
        : 'other'
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
async function composeAnswer(message: string, rows: AccessoryRow[], history: DialogMessage[] = []): Promise<string | null> {
  // Готовые ссылки: карточка товара и подборка по подкатегории (catalog читает ?category=accessories&leaves=<subcategory>).
  const context = rows.map((r) => ({
    ...r,
    url: `${SITE_URL}/product/${r.id}`,
    catalog_url: r.subcategory
      ? `${SITE_URL}/catalog?category=accessories&leaves=${r.subcategory}`
      : undefined,
  }))

  const histBlock = formatHistory(history)
  const prompt = `${SYSTEM_PROMPT}
Список товаров (JSON): ${JSON.stringify(context)}
${histBlock ? `\nИстория диалога (старые→новые):\n${histBlock}\n` : ''}
Сообщение клиента: ${message}`

  const text = await callGemini(prompt, { temperature: 0.1 })
  if (!text) return null
  const answer = text.trim()
  if (!answer || answer === 'NO_ANSWER' || answer.includes('NO_ANSWER')) return null
  return answer
}

/** Ответ на вопрос про сайт по памятке (CLIENT_FAQ) или NO_ANSWER. */
async function composeSiteHelp(message: string, history: DialogMessage[] = []): Promise<string | null> {
  const histBlock = formatHistory(history)
  const prompt = `${SITE_HELP_PROMPT}
${histBlock ? `\nИстория диалога (старые→новые):\n${histBlock}\n` : ''}
Сообщение клиента: ${message}`

  const text = await callGemini(prompt, { temperature: 0.2 })
  if (!text) return null
  const answer = text.trim()
  if (!answer || answer === 'NO_ANSWER' || answer.includes('NO_ANSWER')) return null
  return answer
}

/**
 * Главный конвейер. Возвращает текст ответа клиенту либо null
 * (если вне области / нет данных / ошибка — менеджер обрабатывает сам).
 */
export async function getAccessoriesReply(
  message: string,
  ctx?: { leadId: string | number; realId?: string | number; messageId?: string | number },
): Promise<string | null> {
  if (!message || !message.trim()) return null

  // Контекст диалога: последние сообщения из истории Umnico. Ошибка → [] (конвейер продолжает).
  let history: DialogMessage[] = []
  if (ctx?.leadId !== undefined && ctx.realId !== undefined) {
    history = await fetchDialogContext(ctx.leadId, ctx.realId, { excludeMessageId: ctx.messageId })
    console.log(`[accessories-bot] history: ${history.length} messages`)
  } else {
    console.log('[accessories-bot] history: 0 messages (no realId)')
  }

  const cls = await classifyMessage(message, history)
  console.log('[accessories-bot] classify:', JSON.stringify(cls))

  // Small talk — готовый шаблон, без Supabase и Gemini-compose.
  if (cls.intent === 'smalltalk') {
    const sub = cls.keywords[0] ?? 'greeting'
    const botMsgs = history.filter((h) => h.role === 'bot').length
    const businessMsgs = history.filter((h) => h.role !== 'client').length
    // «Бот уже писал» трактуем шире: любое предыдущее сообщение со стороны базы
    // (bot/manager) — диалог уже начат, полное представление не нужно. Это устойчиво
    // к случаю, когда роль бота в истории не распозналась как 'bot'.
    const repeat = businessMsgs > 0
    const reason =
      history.length === 0 ? 'history empty'
      : botMsgs > 0 ? `has ${botMsgs} bot messages`
      : `has ${businessMsgs} business messages (no bot-tagged)`
    const useShort = repeat && Boolean(SMALLTALK_REPLIES_REPEAT[sub])
    const reply = useShort ? SMALLTALK_REPLIES_REPEAT[sub] : (SMALLTALK_REPLIES[sub] ?? SMALLTALK_REPLIES.greeting)
    console.log(`[accessories-bot] smalltalk: sub=${sub} repeat=${repeat} (${reason}) → ${useShort ? 'short' : 'full'}`)
    return reply
  }

  // Вопрос про сайт — ответ по памятке (CLIENT_FAQ), без Supabase.
  if (cls.intent === 'site_help') {
    const answer = await composeSiteHelp(message, history)
    console.log('[accessories-bot] site_help:', answer ? `ответ len=${answer.length}` : 'NO_ANSWER')
    return answer
  }

  // Прочее (цветы/статус заказа/жалоба) — молчим, диалог менеджеру.
  if (cls.intent !== 'accessories') return null

  const rows = await searchAccessories(cls.keywords)
  console.log(`[accessories-bot] search: ${rows.length} товаров по`, JSON.stringify(cls.keywords))
  if (rows.length === 0) {
    // Ничего не нашлось — честно говорим и отправляем к менеджеру (не выпытываем).
    console.log('[accessories-bot] not found → контакт менеджера')
    return NOT_FOUND_REPLY
  }

  const answer = await composeAnswer(message, rows, history)
  console.log('[accessories-bot] compose:', answer ? `ответ len=${answer.length}` : 'NO_ANSWER')
  return answer
}
