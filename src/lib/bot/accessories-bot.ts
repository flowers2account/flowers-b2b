// Логика ИИ-бота поддержки по РАСХОДКЕ (category='accessories').
// Переиспользует Gemini (GOOGLE_GEMINI_API_KEY) и Supabase service-role клиент.

import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini } from '@/lib/gemini'
import { CLIENT_FAQ } from '@/lib/bot/site-faq'
import { fetchDialogContext, type DialogMessage } from '@/lib/umnico'
import { CATEGORY_TREE, groupIdForLeafSlug, groupIdForSubcat, labelForSubcat, type Leaf } from '@/lib/category-tree'
import { formatSynonymsForPrompt } from '@/lib/search-synonyms'

// Единая формулировка «как позвать менеджера» — правится здесь (Цвет). Используется в
// готовых ответах и подставляется в промпты, чтобы везде звучало одинаково.
const MANAGER_CONTACT = 'напишите менеджеру в WhatsApp — зелёная кнопка вверху этого чата, или +7 700 757 5243.'

// Единый системный промпт compose — каталог + FAQ в одном. Правится здесь (Цвет).
const SYSTEM_PROMPT = `Ты — консультант оптовой базы «Цветы Уральска». Помогаешь подобрать товары из
каталога: упаковка и флористика, горшки и кашпо, вазы и корзины, декор, грунты,
удобрения, защита растений, искусственный газон, укрывные материалы. Также
отвечаешь по FAQ: регистрация, PIN, оформление заказа, доставка, самовывоз,
оплата, график, контакты.

ГЛАВНОЕ ПРАВИЛО (соблюдай строго): если в истории диалога уже есть ТВОЁ сообщение
или приветствие — НЕ здоровайся и НЕ представляйся повторно. Сразу отвечай по сути,
как продолжение разговора. Здороваться можно только в самом первом сообщении диалога.

Ниже два источника: СПИСОК ТОВАРОВ (каталог) и ПАМЯТКА (FAQ по работе сайта).
Отвечай ТОЛЬКО на их основе, ничего не выдумывай.

Товары:
1) Цены и наличие бери ТОЛЬКО из списка товаров. Указывай название, цену в тенге и
   наличие (qty>0 — есть). Единицы и фасовку называй как в карточке, не додумывай.
2) Если найдено 1–3 подходящих товара И они действительно подходят под запрос —
   отвечай сразу, без уточнений. Если найденное лишь частично совпадает по словам, но
   непонятно, подходит ли по назначению — задай уточняющий вопрос, а не рекомендуй наугад.
3) Если вариантов много или запрос размытый — задай ОДИН короткий уточняющий вопрос с
   вариантами (например: «Плёнка есть прозрачная, матовая и цветная — какая нужна?»).
   Не больше ДВУХ уточнений подряд: после второго ответа клиента — консультируй
   обязательно по тому, что есть.
4) Называя конкретный товар — добавь ссылку на карточку (поле url из списка), ссылки не
   выдумывай. Для нескольких товаров — 2–3 самых подходящих. Для запроса по категории
   целиком — ОДНУ ссылку-подборку (catalog_url из списка), параметры не конструируй сам.
   ССЫЛКИ ДАВАЙ ТОЛЬКО ГОЛЫМ URL (https://…) отдельной строкой. БЕЗ markdown: никаких
   [текст](url), без круглых/квадратных/угловых скобок вокруг адреса. Чат не рендерит
   markdown — лишние символы попадают в ссылку и ломают её.
   Поле image_url из товара НЕ упоминай и НЕ вставляй в ответ — фото уходит отдельным сообщением.

FAQ (работа сайта):
5) По регистрации, PIN, заказу, доставке, оплате, графику, контактам отвечай ТОЛЬКО
   фактами из памятки. Чего в памятке нет — не выдумывай.
6) НИКОГДА не обещай: оплату по счёту (пока недоступна), оплату наличными, конкретную
   стоимость доставки (она индивидуальна), точное время выдачи PIN сверх формулировки
   «обычно несколько минут в рабочие часы».

Граница и стиль:
7) Вопросы про сами цветы и букеты (сорта, наличие, цена цветов), про статус КОНКРЕТНОГО
   заказа клиента («где мой заказ», «не пришла оплата», «когда привезёте моё») и жалобы —
   это к менеджеру: верни ровно NO_ANSWER и больше ничего.
8) Оформление заказа сам не делай: чтобы оформить заказ или позвать человека — ${MANAGER_CONTACT}
9) Ты — ИИ-помощник и не скрываешь этого; если спрашивают, бот ли ты — честно подтверждай и
   предлагай позвать менеджера, если нужен человек (${MANAGER_CONTACT}).
10) Отвечай дружелюбно и живо, но коротко, на русском. Прощайся / желай хорошего дня
    ТОЛЬКО если клиент явно прощается.
11) Если по запросу нет ничего ни в списке товаров, ни в памятке — верни ровно NO_ANSWER.`

// Готовые ответы на small talk — правятся здесь (Цвет). Без похода в Supabase/Gemini.
const SMALLTALK_REPLIES: Record<string, string> = {
  greeting: 'Здравствуйте! Я ИИ-помощник «Цветы Уральска», на связи 24/7 🌸 Подскажу цены и наличие расходных материалов, помогу с регистрацией и работой сайта. По цветам и оформлению заказа ответит менеджер в рабочие часы.',
  thanks: 'Пожалуйста! Обращайтесь 🌸',
  farewell: 'Хорошего дня! Будем рады помочь снова.',
  // болтовня / самочувствие / «ты тут?», «салам», «қалайсың» — живая фраза + к делу
  chitchat: 'Спасибо, всё отлично 🙂 Чем помочь?',
}

// Короткие ответы, когда бот уже писал в этом диалоге (повторное приветствие и т.п.) — правит Цвет.
const SMALLTALK_REPLIES_REPEAT: Record<string, string> = {
  greeting: 'Да-да, я тут! Чем помочь?',
}

// Ответ, когда по запросу про расходку ничего не нашлось — честно + контакт менеджера. Правит Цвет.
const NOT_FOUND_REPLY = `Не нашёл такого у нас в наличии 🙏 Подскажет точно — ${MANAGER_CONTACT}`

// Подсказка раздела, когда точной позиции нет, но категория угадана. Правит Цвет.
const CATEGORY_SUGGESTION = (label: string, url: string) =>
  `Точную позицию не нашёл, но вот наш раздел «${label}»: ${url}. Что-то конкретное подсказать?`

// Словарь синонимов «как говорит клиент → как называется в каталоге».
// Единый источник на проект — src/lib/search-synonyms.ts (общий с серверным поиском
// каталога /api/search). Правится там. Здесь — только рендер блока для промпта.
const SEARCH_SYNONYMS = formatSynonymsForPrompt()

/** История диалога в компактный текст для промпта (старые→новые). */
function formatHistory(history: DialogMessage[]): string {
  if (!history.length) return ''
  return history
    .map((h) => `${h.role === 'client' ? 'Клиент' : h.role === 'bot' ? 'Бот' : 'Менеджер'}: ${h.text}`)
    .join('\n')
}

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
  image_url: string | null
}

// Структурированный товар для богатой карточки виджета сайта.
export interface WidgetProduct {
  id: number
  display_name: string | null
  price: number | null
  qty: number | null
  image_url: string | null
  subcategory: string | null
  unit: string | null
  pack_size: number | null
  url: string                       // /product/{id}
}

// Ответ конвейера: текст + структурированные товары (для карточек виджета) +
// опционально фото товара (WhatsApp-карточка, отдельным сообщением, за флагом).
export interface BotReply {
  text: string | null
  products?: WidgetProduct[]
  photo?: { imageUrl: string; caption: string; productId: number }
}

// Флаг отправки фото товара. По умолчанию ВЫКЛ.
const BOT_SEND_PHOTOS = process.env.BOT_SEND_PHOTOS === 'true'

// Эмодзи карточки по ГРУППЕ таксономии (id из category-tree). Правит Цвет.
const GROUP_EMOJI: Record<string, string> = {
  packaging: '📦',   // упаковка и флористика
  pots:      '🪴',   // горшки и кашпо
  vases:     '🏺',   // вазы и корзины
  decor:     '🎀',   // декор и подарки
  garden:    '🌱',   // сад и огород (грунты/удобрения/защита)
  lawn:      '🌾',   // газоны и укрытие
}
const DEFAULT_EMOJI = '🛍️'

// Богатая карточка для виджета = ОДНО сообщение: фото (attachment) + caption (плоский текст,
// \n и эмодзи; markdown/кнопок виджет не умеет). Шаблон правит Цвет.
function buildCardCaption(r: AccessoryRow): string {
  const emoji = GROUP_EMOJI[groupIdForSubcat(r.subcategory) ?? ''] ?? DEFAULT_EMOJI
  const name = r.display_name ?? 'Товар'
  const priceStr = r.price != null ? `${Number(r.price).toLocaleString('ru-RU')} ₸` : '—'
  const stock = (r.qty ?? 0) > 0 ? 'В наличии' : 'нет в наличии'
  // 1–2 факта: тип (лейбл подкатегории) + фасовка (если кратность > 1)
  const typeLabel = labelForSubcat(r.subcategory)
  const pack = r.pack_size && r.pack_size > 1 ? `фасовка ${r.pack_size}${r.unit ? ' ' + r.unit : ''}` : ''
  const facts = [typeLabel, pack].filter(Boolean).join(', ')
  const url = `${SITE_URL}/product/${r.id}`
  return [`${emoji} ${name}`, `Цена: ${priceStr} · ${stock}`, facts, url].filter(Boolean).join('\n')
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
  Извлекая keywords, приводи слова клиента к терминам каталога по словарю синонимов
  ниже, исправляй опечатки, используй единственное число именительный падеж.
  Словарь синонимов (клиент → каталог):
${SEARCH_SYNONYMS}
- Для "smalltalk": keywords — ровно один подтип: "greeting", "thanks", "farewell" или "chitchat".
  "greeting" — ЛЮБАЯ форма приветствия: «привет», «здравствуйте», «здравствуйте!»,
  «добрый день/вечер/утро», «приветствую», «доброго времени», «привет ещё раз»,
  «здрасьте» — в т.ч. с восклицанием, опечатками и приставкой «ещё раз».
  "thanks" — спасибо/благодарю; "farewell" — пока/до свидания/всего доброго.
  "chitchat" — болтовня / самочувствие / про самого бота: «как дела», «как ты»,
  «работаешь?», «ты тут?», «что делаешь», «салам», «сәлем», «калайсын», «қалайсың».
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
"как дела" → {"intent":"smalltalk","keywords":["chitchat"]}
"работаешь?" → {"intent":"smalltalk","keywords":["chitchat"]}
"салам" → {"intent":"smalltalk","keywords":["chitchat"]}
"қалайсың" → {"intent":"smalltalk","keywords":["chitchat"]}
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

/**
 * Шаг B: двухступенчатый поиск по расходке.
 * 1) ILIKE по name/display_name (быстрый точный);
 * 2) 0 результатов → fallback на trigram similarity (RPC search_accessories_trgm,
 *    порог 0.3, сортировка по убыванию похожести) — ловит опечатки и словоформы.
 */
async function searchAccessories(keywords: string[]): Promise<AccessoryRow[]> {
  if (keywords.length === 0) return []
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[accessories-bot] SUPABASE_SERVICE_ROLE_KEY not set')
    return []
  }
  const supabase = createAdminClient()

  // Ступень 1: ILIKE. OR-фильтр PostgREST: name.ilike.%kw%,display_name.ilike.%kw%,...
  const orParts: string[] = []
  const safeKeywords: string[] = []
  for (const kw of keywords) {
    const safe = kw.replace(/[%,()]/g, ' ').trim()
    if (!safe) continue
    safeKeywords.push(safe)
    orParts.push(`name.ilike.%${safe}%`)
    orParts.push(`display_name.ilike.%${safe}%`)
  }
  if (orParts.length === 0) return []

  const { data, error } = await supabase
    .from('products')
    .select('id, display_name, subcategory, price, unit, qty, pack_size, image_url')
    .eq('category', 'accessories')
    .eq('is_active', true)
    .eq('hidden_for_demo', false)
    .gt('price', 0)
    .or(orParts.join(','))
    .limit(20)

  if (error) {
    console.error('[accessories-bot] ilike search failed:', error.message)
  } else if (data && data.length > 0) {
    console.log(`[accessories-bot] search: ${data.length} via ilike`)
    return data as AccessoryRow[]
  }

  // Ступень 2: trigram similarity (миграция 20260611_trgm_accessories_search).
  const { data: trgm, error: trgmError } = await supabase.rpc('search_accessories_trgm', {
    p_keywords: safeKeywords,
    p_limit: 20,
  })
  if (trgmError) {
    console.error('[accessories-bot] trgm search failed:', trgmError.message)
    return []
  }
  const rows = (trgm ?? []) as AccessoryRow[]
  console.log(`[accessories-bot] search: ${rows.length} via trgm`)
  return rows
}

const SITE_URL = 'https://uralskflowers.kz'

/** Ссылка на раздел каталога accessories по id группы (раздела) таксономии.
 * Формат раздела — group (НЕ leaves): CatalogLayout читает ?group=<id>. */
function catalogUrlForGroup(groupId: string): string {
  return `${SITE_URL}/catalog?category=accessories&group=${groupId}`
}

/**
 * Шаг C: единый ответ по двум источникам — список товаров (каталог) + памятка (FAQ).
 * rows может быть пустым (вопрос только про сайт). Возвращает текст или null (NO_ANSWER).
 */
async function composeAnswer(message: string, rows: AccessoryRow[], history: DialogMessage[] = []): Promise<string | null> {
  // Ссылки: карточка товара (/product/{id}) и раздел каталога. Раздел — это group
  // (НЕ leaves и НЕ сырой subcategory): CatalogLayout открывает ?group=<id>.
  const context = rows.map((r) => {
    const groupId = groupIdForSubcat(r.subcategory)
    return {
      ...r,                                    // включает image_url (фото товара)
      url: `${SITE_URL}/product/${r.id}`,
      catalog_url: groupId ? catalogUrlForGroup(groupId) : undefined,
    }
  })

  const histBlock = formatHistory(history)
  const prompt = `${SYSTEM_PROMPT}

СПИСОК ТОВАРОВ (JSON): ${JSON.stringify(context)}

ПАМЯТКА (FAQ):
${CLIENT_FAQ}
${histBlock ? `\nИстория диалога (старые→новые):\n${histBlock}\n` : ''}
Сообщение клиента: ${message}`

  const text = await callGemini(prompt, { temperature: 0.2 })
  if (!text) return null
  const answer = text.trim()
  if (!answer || answer === 'NO_ANSWER' || answer.includes('NO_ANSWER')) return null
  return answer
}

// ── Fallback: угадать раздел каталога по ключевым словам, если товаров не нашлось ──
function normKw(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim()
}

/** Лёгкое стем-совпадение слова с токеном (терпимо к окончаниям): общий префикс. */
function tokenMatch(kw: string, token: string): boolean {
  const x = normKw(kw)
  const y = normKw(token)
  if (x.length < 3 || y.length < 3) return x === y
  const k = Math.min(x.length, y.length, 5)
  return x.slice(0, k) === y.slice(0, k)
}

/** По keywords подобрать видимый лист таксономии (раздел) с наибольшим совпадением. */
function matchLeafByKeywords(keywords: string[]): Leaf | null {
  if (keywords.length === 0) return null
  let best: Leaf | null = null
  let bestScore = 0
  for (const group of CATEGORY_TREE) {
    for (const leaf of group.leaves) {
      if (leaf.hidden) continue
      const tokens = [...leaf.label.split(/[\s,/]+/), ...leaf.members].filter(Boolean)
      let score = 0
      for (const kw of keywords) {
        if (tokens.some((t) => tokenMatch(kw, t))) score++
      }
      if (score > bestScore) {
        bestScore = score
        best = leaf
      }
    }
  }
  return best
}

/**
 * Главный конвейер. Возвращает текст ответа клиенту либо null
 * (если вне области / нет данных / ошибка — менеджер обрабатывает сам).
 */
export async function getAccessoriesReply(
  message: string,
  ctx?: {
    leadId?: string | number; realId?: string | number; messageId?: string | number
    // Нативный виджет сайта инжектит историю напрямую (из браузерной сессии) →
    // Umnico (fetchDialogContext) в этом пути НЕ дёргается. Umnico-путь (WhatsApp) — без изменений.
    history?: DialogMessage[]
  },
): Promise<BotReply> {
  if (!message || !message.trim()) return { text: null }

  // История: инжектированная (виджет) приоритетна; иначе тянем из Umnico по leadId/realId (WhatsApp).
  let history: DialogMessage[] = []
  if (ctx?.history) {
    history = ctx.history
    console.log(`[accessories-bot] history: ${history.length} messages (injected)`)
  } else if (ctx?.leadId !== undefined && ctx.realId !== undefined) {
    history = await fetchDialogContext(ctx.leadId, ctx.realId, { excludeMessageId: ctx.messageId })
    console.log(`[accessories-bot] history: ${history.length} messages (umnico)`)
  } else {
    console.log('[accessories-bot] history: 0 messages (no source)')
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
    return { text: reply }
  }

  // Прочее (живые цветы/букеты/статус заказа/жалоба) — молчим, диалог менеджеру.
  if (cls.intent === 'other') return { text: null }

  // accessories / site_help → единый compose (каталог + FAQ).
  // Товары ищем только для accessories; для site_help список пустой (отвечаем по памятке).
  let rows: AccessoryRow[] = []
  if (cls.intent === 'accessories') {
    rows = await searchAccessories(cls.keywords)
    console.log(`[accessories-bot] search: ${rows.length} товаров по`, JSON.stringify(cls.keywords))
    if (rows.length === 0) {
      // Товаров нет — пробуем угадать раздел и предложить подборку.
      const leaf = matchLeafByKeywords(cls.keywords)
      if (leaf) {
        const groupId = groupIdForLeafSlug(leaf.slug)
        console.log('[accessories-bot] fallback category:', leaf.slug, '→ group', groupId)
        if (groupId) return { text: CATEGORY_SUGGESTION(leaf.label, catalogUrlForGroup(groupId)) }
      }
      // И раздел не угадался — честно к менеджеру.
      console.log('[accessories-bot] not found → контакт менеджера')
      return { text: NOT_FOUND_REPLY }
    }
  }

  const answer = await composeAnswer(message, rows, history)
  console.log(`[accessories-bot] compose (${cls.intent}):`, answer ? `ответ len=${answer.length}` : 'NO_ANSWER')

  // Богатая карточка ПО УМОЛЧАНИЮ: в любом ответе про расходку с найденным товаром шлём
  // карточку к топ-1 релевантному товару (rows[0]); в тексте остальные перечислены как обычно.
  // Максимум 1 карточка. caption — buildCardCaption. Нет фото → не шлём.
  let photo: BotReply['photo']
  if (BOT_SEND_PHOTOS && answer && cls.intent === 'accessories' && rows.length >= 1) {
    if (rows[0].image_url) {
      photo = { imageUrl: rows[0].image_url, caption: buildCardCaption(rows[0]), productId: rows[0].id }
    } else {
      console.log('[accessories-bot] photo: skipped (no image)')
    }
  }

  // Структурированные товары для богатых карточек виджета сайта (текстовый путь не меняется).
  const products: WidgetProduct[] = rows.map((r) => ({
    id: r.id, display_name: r.display_name, price: r.price, qty: r.qty,
    image_url: r.image_url, subcategory: r.subcategory, unit: r.unit, pack_size: r.pack_size,
    url: `${SITE_URL}/product/${r.id}`,
  }))

  return { text: answer, products: products.length ? products : undefined, photo }
}
