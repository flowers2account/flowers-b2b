// Логика ИИ-бота поддержки по РАСХОДКЕ (category='accessories').
// Переиспользует Gemini (GOOGLE_GEMINI_API_KEY) и Supabase service-role клиент.

import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini } from '@/lib/gemini'
import { CLIENT_FAQ } from '@/lib/bot/site-faq'
import { fetchDialogContext, type DialogMessage } from '@/lib/umnico'
import { CATEGORY_TREE, groupIdForLeafSlug, groupIdForSubcat, labelForSubcat, type Leaf } from '@/lib/category-tree'
import { formatSynonymsForPrompt, normalizeQuery } from '@/lib/search-synonyms'
import { classifyByRules, hasAccessoryRuleKeyword, hasPotRuleKeyword } from '@/lib/bot/rule-classifier'
import {
  extractPotFilters, applyPotFilters, describePotFilters, hasActiveFilters, type PotFilters,
} from '@/lib/bot/pot-filters'

// Единая формулировка «как позвать менеджера» — правится здесь (Цвет). Используется в
// готовых ответах и подставляется в промпты, чтобы везде звучало одинаково.
const MANAGER_CONTACT = 'напишите менеджеру в WhatsApp — зелёная кнопка вверху этого чата, или +7 700 978 8467.'

// Единый системный промпт compose — каталог + FAQ в одном. Правится здесь (Цвет).
const SYSTEM_PROMPT = `Ты — консультант оптовой базы «Цветы Уральска». Помогаешь подобрать товары из
каталога: упаковка и флористика, горшки и кашпо, вазы и корзины, декор, грунты,
удобрения, защита растений, искусственный газон, укрывные материалы, а также живые
горшечные (комнатные) растения. Также
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
   Если у товара указано pot_diameter (диаметр горшка, см) и/или pot_height (высота
   растения, см) — можно называть их как есть. Если поле пустое (null) — размер этого
   товара НЕ упоминай, ничего про него не додумывай и ни с чем не сравнивай.
2) НИКОГДА не утверждай, что ВСЯ показанная подборка соответствует конкретному
   параметру, который назвал клиент (размер, диаметр, высота, цена/бюджет, количество
   и т.п.), если этот параметр НЕ был применён как фильтр к каждому товару списка —
   даже если тебе кажется, что список «в целом» подходит:
   - «в нужном количестве» / «хватит на N штук» — число, которое называет клиент
     (сколько ему нужно), с полем qty НЕ сопоставлено; называй qty каждого товара как
     есть (по правилу 1) и не делай вывод о достаточности под запрошенное количество;
   - «по подходящей цене» / «в пределах бюджета» / «до N ₸» — список товаров НЕ
     фильтруется по цене; называй реальную цену каждого товара и не утверждай
     соответствие лимиту, который назвал клиент;
   - «в горшках диаметром N см» / «высотой N см» и т.п. НА ВЕСЬ список — у товаров
     списка pot_diameter/pot_height могут различаться (например 7/12/13/17 см);
     НИКОГДА не обобщай значение ОДНОГО товара (или число, названное клиентом) на всю
     подборку. Конкретный размер можно называть ТОЛЬКО про КОНКРЕТНЫЙ товар и ТОЛЬКО
     если это значение реально указано именно у него (pot_diameter/pot_height не null)
     — список не отфильтрован под размер, который назвал клиент, даже если он его назвал;
   - «маленький» / «средний» / «крупный» — такие слова допустимы ТОЛЬКО если у
     сравниваемых товаров заполнено pot_diameter или pot_height и ты сравниваешь именно
     эти числа. НИКОГДА не выводи размерную категорию из цены;
   - назначение («подходит для офиса», «для дома», «для ресепшена» и т.п.) — в списке
     товаров нет поля назначения, такие утверждения запрещены;
   - любое другое требование клиента (цвет, «одинаковые», материал и т.п.) — если оно
     не проверяется явным полем в списке товаров.
   Если клиент назвал конкретное условие, а список НЕ отфильтрован под него — НЕ
   используй в ответе слова «подходящие» / «соответствующие» / «под ваш запрос» и
   любые другие формулировки, намекающие на проверенное соответствие этому условию.
   Отвечай нейтрально, просто показывая, что реально есть (например: «Вот несколько
   вариантов горшечных растений из наличия» / «Вот варианты драцены из наличия»), и,
   если проверка условия важна клиенту, предложи уточнить у менеджера. Слово
   «подходящие» остаётся уместным, когда оно НЕ отсылает к непроверенному
   числовому/размерному/ценовому условию клиента (например для точного совпадения по
   названию товара, см. правило 3).
3) Если найдено 1–3 подходящих товара И они действительно подходят под запрос —
   отвечай сразу, без уточнений. Если найденное лишь частично совпадает по словам, но
   непонятно, подходит ли по назначению — задай уточняющий вопрос, а не рекомендуй наугад.
4) Если вариантов много или запрос размытый — задай ОДИН короткий уточняющий вопрос с
   вариантами (например: «Плёнка есть прозрачная, матовая и цветная — какая нужна?»).
   Не больше ДВУХ уточнений подряд: после второго ответа клиента — консультируй
   обязательно по тому, что есть.
   В товарном подборе, если после ответа логично сузить выбор (цвет, размер, материал,
   назначение, бюджет, город доставки, тип товара), в конце задай один короткий
   наводящий вопрос. Для виджета сайта добавь варианты ответов отдельной строкой
   строго в формате: «Варианты: A / B / C» — короткие варианты, 2–4 штуки.
   Если варианты различаются по ЦЕНЕ — называй их по цене («До 900 ₸» / «От 1640 ₸»), а
   НЕ размерными словами («маленькие»/«крупные») — см. правило 2. Размерными словами
   можно называть варианты только если они реально различаются по pot_diameter/pot_height.
   Не добавляй варианты, если уже дал точный ответ без необходимости уточнять, если
   отвечаешь только по FAQ или если переводишь клиента к менеджеру.
5) Называя конкретный товар — добавь ссылку на карточку (поле url из списка), ссылки не
   выдумывай. Для нескольких товаров — 2–3 самых подходящих. Для запроса по категории
   целиком — ОДНУ ссылку-подборку (catalog_url из списка), параметры не конструируй сам.
   ССЫЛКИ ДАВАЙ ТОЛЬКО ГОЛЫМ URL (https://…) отдельной строкой. БЕЗ markdown: никаких
   [текст](url), без круглых/квадратных/угловых скобок вокруг адреса. Чат не рендерит
   markdown — лишние символы попадают в ссылку и ломают её.
   Поле image_url из товара НЕ упоминай и НЕ вставляй в ответ — фото уходит отдельным сообщением.

FAQ (работа сайта):
6) По регистрации, PIN, заказу, доставке, оплате, графику, контактам отвечай ТОЛЬКО
   фактами из памятки. Чего в памятке нет — не выдумывай.
7) НИКОГДА не обещай: оплату по счёту (пока недоступна), оплату наличными, конкретную
   стоимость доставки (она индивидуальна), точное время выдачи PIN сверх формулировки
   «обычно несколько минут в рабочие часы».

Граница и стиль:
8) Вопросы про СРЕЗАННЫЕ цветы и букеты (сорта, наличие, цена цветов на срез — это НЕ
   горшечные растения, они разбираются в товарном подборе выше по своему списку), про
   статус КОНКРЕТНОГО заказа клиента («где мой заказ», «не пришла оплата», «когда
   привезёте моё») и жалобы — это к менеджеру: верни ровно NO_ANSWER и больше ничего.
9) Оформление заказа сам не делай: чтобы оформить заказ или позвать человека — ${MANAGER_CONTACT}
10) Ты — ИИ-помощник и не скрываешь этого; если спрашивают, бот ли ты — честно подтверждай и
   предлагай позвать менеджера, если нужен человек (${MANAGER_CONTACT}).
11) Отвечай дружелюбно и живо, но коротко, на русском. Прощайся / желай хорошего дня
    ТОЛЬКО если клиент явно прощается.
12) Если по запросу нет ничего ни в списке товаров, ни в памятке — верни ровно NO_ANSWER.`

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

// Ответ, когда по запросу про расходку ничего не нашлось. НЕ тупик: честно + мягкий
// переспрос + контакт менеджера (работает и для расплывчатого запроса, и для реально
// отсутствующего товара). Правит Цвет.
const NOT_FOUND_REPLY = `Не нашёл точного совпадения 🙏 Уточните, пожалуйста, что именно нужно — назову цену и наличие. Если нужен живой человек — ${MANAGER_CONTACT}`

// Ответ виджета на «other» (эмоции / вне зоны / просьба позвать человека) — спокойный
// увод к менеджеру, осмысленный текст вместо тишины. На WhatsApp молчим (менеджер ведёт
// диалог сам). Правит Цвет.
const OTHER_WIDGET_REPLY = `Кажется, тут лучше поможет живой человек 🌸 ${MANAGER_CONTACT}`

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

type Intent = 'smalltalk' | 'accessories' | 'pot' | 'site_help' | 'other'

interface ClassifyResult {
  intent: Intent
  /** Для accessories — ключевые слова поиска; для smalltalk — подтип (greeting/thanks/farewell). */
  keywords: string[]
  classificationSource?: 'rules' | 'gemini' | 'fallback'
  reason?: 'ai_classification_timeout'
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
  code_1c: string | null
  // Реальный размер (только pot: у accessories обычно null) — передаётся в composeAnswer
  // как есть, НЕ как сурrogат размера через цену. См. SYSTEM_PROMPT правило 1/2.
  pot_diameter: number | null
  pot_height: number | null
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
  sku: string | null                // артикул 1С (code_1c), может быть пуст
  url: string                       // /product/{id}
}

// Ответ конвейера: текст + структурированные товары (для карточек виджета) +
// опционально фото товара (WhatsApp-карточка, отдельным сообщением, за флагом).
export interface BotReply {
  text: string | null
  products?: WidgetProduct[]
  photo?: { imageUrl: string; caption: string; productId: number }
  // Виджет: явный вопрос про регистрацию/вход → открыть форму в чате (см. detectAuthAction).
  action?: 'register' | 'login'
  // Версия B Такт 1.5: метаданные хода для анонимных лидов amoCRM.
  //   intent — классифицированный интент; helped — смог ли бот реально помочь
  //   (false при NOT_FOUND / вне зоны / NO_ANSWER → повод предложить оставить телефон).
  meta?: {
    intent: 'smalltalk' | 'accessories' | 'pot' | 'site_help' | 'other'
    helped: boolean
    classificationSource?: 'rules' | 'gemini' | 'fallback'
    classificationReason?: 'ai_classification_timeout'
    classificationDurationMs?: number
  }
}

function buildClassifiedMeta(
  cls: ClassifyResult,
  helped: boolean,
  classificationDurationMs: number,
): NonNullable<BotReply['meta']> {
  return {
    intent: cls.intent,
    helped,
    classificationSource: cls.classificationSource ?? 'gemini',
    classificationReason: cls.reason,
    classificationDurationMs,
  }
}

// Правило виджета: на ЯВНЫЙ вопрос про регистрацию/авторизацию отвечаем формой
// (register-form / login-form), а не только текстом FAQ. Детект по ключевым словам
// (ё→е). Регистрация имеет приоритет над входом при совпадении обоих.
export function detectAuthAction(message: string): 'register' | 'login' | null {
  const m = message.toLowerCase().replace(/ё/g, 'е')
  // \b в JS не работает с кириллицей (она не \w) → для отдельных слов lookaround-границы.
  const reg = /(регистрац|зарегистр|создать аккаунт|стать клиент|получить доступ|нет аккаунт|как.*регистр)/.test(m)
  const login = /(?<![а-я])(войти|вход|логин)(?![а-я])|авториз|залогин|забыл.{0,5}пин|не могу войти|сменить пин|как.*войти/.test(m)
  if (reg) return 'register'
  if (login) return 'login'
  return null
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
  const ruleResult = classifyByRules(message)
  if (ruleResult) {
    return { ...ruleResult, classificationSource: 'rules' }
  }

  const histBlock = formatHistory(history)
  const prompt = `Ты классификатор сообщений клиента оптовой базы цветов.
Определи intent сообщения:
- "smalltalk" — приветствие, благодарность или прощание (без конкретного вопроса).
- "accessories" — вопрос про РАСХОДНЫЕ МАТЕРИАЛЫ (горшки, кашпо, удобрения, грунт,
  плёнка, ленты, упаковка, бумага, коробки, корзины, средства защиты растений,
  инструменты, сопутствующие товары).
- "pot" — вопрос про ЖИВЫЕ ГОРШЕЧНЫЕ/КОМНАТНЫЕ РАСТЕНИЯ (в горшке, с корнем): конкретный
  вид (спатифиллум, монстера, драцена, фикус, орхидея, антуриум, суккулент, кактус,
  пальма и т.п.) ИЛИ общий вопрос про горшечные/комнатные растения без вида. Это НЕ
  срезанные цветы/букеты (розы, тюльпаны, хризантемы на срез — "other") и НЕ тара под
  растение (горшок, кашпо, ваза — "accessories"). Если вид продаётся ОБОИМИ способами
  (роза, орхидея, гортензия, антуриум, хризантема) и из фразы непонятно, нужен именно
  горшечный экземпляр, а не срез/букет — классифицируй как "other", не "pot".
- "site_help" — вопрос про РАБОТУ САЙТА: регистрация, доступ, вход, PIN, как оформить
  заказ, доставка (самовывоз/города/сроки/стоимость), оплата (карта/счёт/наличные),
  минимальный заказ, скидки, график работы, адрес склада, контакты.
- "other" — всё остальное: вопросы про сами цветы (сорта/наличие цветов), статус
  конкретного заказа клиента, жалобы, А ТАКЖЕ эмоциональные / непонятные / мета-реплики
  БЕЗ конкретного товара и БЕЗ вопроса по сайту («ты вообще понял?», «что за магазин»,
  «я о чём спрашиваю», «а подумать?»), сарказм и просьбы позвать живого человека.
  Если в реплике НЕТ ни конкретного товара/категории расходки, ни вопроса по работе
  сайта — это "other" (НЕ выдумывай товарный keyword из эмоций).

Верни ТОЛЬКО JSON-объект без markdown:
{ "intent": "smalltalk" | "accessories" | "pot" | "site_help" | "other", "keywords": string[] }

- Для "accessories": keywords — 1–5 коротких ключевых слов (на русском, в нижнем
  регистре, без чисел и единиц), по которым искать товар в каталоге.
  Извлекая keywords, приводи слова клиента к терминам каталога по словарю синонимов
  ниже, исправляй опечатки, используй единственное число именительный падеж.
  Словарь синонимов (клиент → каталог):
${SEARCH_SYNONYMS}
- Для "pot": если назван конкретный вид растения — keywords = [канонич. русское
  название в именительном падеже единственного числа, без чисел/размеров/сортов]
  (например: "монстера", "фикус", "спатифиллум"). Если вид НЕ назван (общий вопрос
  про горшечные/комнатные растения, вопрос про количество без вида) — верни РОВНО
  keywords: ["горшечные растения"].
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
"нужен горшок" → {"intent":"accessories","keywords":["горшок"]}
"есть кашпо?" → {"intent":"accessories","keywords":["кашпо"]}
"нужна ваза" → {"intent":"accessories","keywords":["ваза"]}
"есть спатифиллум?" → {"intent":"pot","keywords":["спатифиллум"]}
"покажите горшечные" → {"intent":"pot","keywords":["горшечные растения"]}
"какие комнатные растения есть?" → {"intent":"pot","keywords":["горшечные растения"]}
"есть драцена?" → {"intent":"pot","keywords":["драцена"]}
"нужен фикус" → {"intent":"pot","keywords":["фикус"]}
"есть монстера 14 см?" → {"intent":"pot","keywords":["монстера"]}
"нужно 5 одинаковых растений" → {"intent":"pot","keywords":["горшечные растения"]}
"нужен букет" → {"intent":"other","keywords":[]}
"есть розы?" → {"intent":"other","keywords":[]}
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
"ты вообще понял?" → {"intent":"other","keywords":[]}
"это что за магазин, вечно ничего нет" → {"intent":"other","keywords":[]}
"я о чём вообще спрашиваю" → {"intent":"other","keywords":[]}
"а подумать?" → {"intent":"other","keywords":[]}
"позови нормального человека" → {"intent":"other","keywords":[]}
${histBlock ? `\nИстория диалога (старые→новые):\n${histBlock}\n` : ''}
Сообщение клиента: ${JSON.stringify(message)}`

  const text = await withClassificationTimeout(
    () => callGemini(prompt, { json: true, temperature: 0.1, timingLabel: 'classification' }),
    message,
  )
  if (!text) return { intent: 'other', keywords: [], classificationSource: 'gemini' }
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      intent?: unknown
      keywords?: unknown
      classificationSource?: unknown
      reason?: unknown
    }
    const intent: Intent =
      parsed.intent === 'smalltalk' || parsed.intent === 'accessories' || parsed.intent === 'pot'
        || parsed.intent === 'site_help'
        ? parsed.intent
        : 'other'
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      : []
    const classificationSource =
      parsed.classificationSource === 'fallback' || parsed.classificationSource === 'rules'
        ? parsed.classificationSource
        : 'gemini'
    const reason = parsed.reason === 'ai_classification_timeout' ? parsed.reason : undefined
    return { intent, keywords, classificationSource, reason }
  } catch (err) {
    console.error('[accessories-bot] classify parse failed:', err, text)
    return { intent: 'other', keywords: [], classificationSource: 'gemini' }
  }
}

async function withClassificationTimeout(
  fn: () => Promise<string | null>,
  message: string,
): Promise<string | null> {
  const timeoutMs = getClassificationTimeoutMs()
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      fn(),
      new Promise<string | null>((resolve) => {
        timeout = setTimeout(() => {
          const fallback = hasAccessoryRuleKeyword(message)
            ? { intent: 'accessories', keywords: [] }
            : hasPotRuleKeyword(message)
              ? { intent: 'pot', keywords: [] }
              : { intent: 'other', keywords: [] }
          console.warn('[ai timing] classification timeout', {
            classificationSource: 'fallback',
            reason: 'ai_classification_timeout',
            durationMs: timeoutMs,
            intent: fallback.intent,
            keywordCount: fallback.keywords.length,
          })
          resolve(JSON.stringify({
            ...fallback,
            classificationSource: 'fallback',
            reason: 'ai_classification_timeout',
          }))
        }, timeoutMs)
        timeout.unref?.()
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function getClassificationTimeoutMs(): number {
  const raw = process.env.AI_CLASSIFICATION_TIMEOUT_MS
  if (!raw) return 10000

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 60000) return 10000
  return Math.trunc(parsed)
}

const SEARCH_SELECT = 'id, display_name, subcategory, price, unit, qty, pack_size, image_url, code_1c, pot_diameter, pot_height'

// Русские окончания прилагательных/существительных (длинные → короткие). Снимаются
// для основы, чтобы ILIKE ловил все формы: «цветная/цветной/цветным» → «цветн»,
// которое матчит «с цветным рисунком». В каталоге много длинных названий, где точная
// форма клиента не совпадает, а основа — да.
const RU_ENDINGS = ['иями', 'ыми', 'ими', 'ого', 'его', 'ому', 'ему', 'ями', 'ами', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ый', 'ий', 'ой', 'ом', 'ем', 'ым', 'им', 'ых', 'их', 'ую', 'юю', 'ов', 'ев', 'ах', 'ях', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ь', 'й']
function stemRu(w: string): string {
  for (const e of RU_ENDINGS) {
    if (w.length - e.length >= 4 && w.endsWith(e)) return w.slice(0, -e.length)
  }
  return w
}

// Один keyword классификатора → варианты для ILIKE: нормализуем (ё→е, нижний регистр),
// бьём на слова, добавляем основу каждого слова. Группа вариантов соответствует ОДНОМУ
// keyword (внутри — OR, между keyword'ами — AND, чтобы «цветная плёнка» уточняла, а не
// расширяла до всех плёнок).
function kwVariants(kw: string): string[] {
  const out = new Set<string>()
  for (const word of normalizeQuery(kw).split(/[\s,/]+/)) {
    const w = word.replace(/[%(),]/g, '').trim()
    if (w.length < 3) continue
    out.add(w)
    const s = stemRu(w)
    if (s !== w && s.length >= 4) out.add(s)
  }
  return [...out]
}
const ilikeOr = (variants: string[]) =>
  variants.flatMap((v) => [`name.ilike.%${v}%`, `display_name.ilike.%${v}%`]).join(',')

/**
 * Шаг B: поиск по расходке. Перед поиском — нормализация (ё→е) и снятие основы
 * (словоформы прилагательных). Три ступени:
 * 1a) ILIKE-AND (уточнение): каждый keyword обязателен (OR его вариантов) — «цветная
 *     плёнка» → только цветные плёнки, а не все;
 * 1b) ILIKE-OR (расширение): если AND пуст — любой вариант любого keyword;
 * 2)  trigram similarity (RPC, нормализованные слова) — опечатки/дальние формы.
 */
async function searchAccessories(keywords: string[]): Promise<AccessoryRow[]> {
  if (keywords.length === 0) return []
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[accessories-bot] SUPABASE_SERVICE_ROLE_KEY not set')
    return []
  }
  const supabase = createAdminClient()
  const base = () => supabase
    .from('products')
    .select(SEARCH_SELECT)
    .eq('category', 'accessories')
    .eq('is_active', true)
    .eq('hidden_for_demo', false)
    .gt('price', 0)

  const groups = keywords.map(kwVariants).filter((g) => g.length > 0)
  if (groups.length === 0) return []
  const allVariants = [...new Set(groups.flat())]

  // Ступень 1a: уточнение — AND между keyword'ами (каждый .or() ANDится в PostgREST).
  if (groups.length >= 2) {
    let q = base()
    for (const g of groups) q = q.or(ilikeOr(g))
    const { data, error } = await q.limit(20)
    if (error) console.error('[accessories-bot] ilike-AND failed:', error.message)
    else if (data && data.length > 0) {
      console.log(`[accessories-bot] search: ${data.length} via ilike-AND`)
      return data as AccessoryRow[]
    }
  }

  // Ступень 1b: расширение — OR всех вариантов.
  {
    const { data, error } = await base().or(ilikeOr(allVariants)).limit(20)
    if (error) console.error('[accessories-bot] ilike-OR failed:', error.message)
    else if (data && data.length > 0) {
      console.log(`[accessories-bot] search: ${data.length} via ilike-OR`)
      return data as AccessoryRow[]
    }
  }

  // Ступень 2: trigram similarity по НОРМАЛИЗОВАННЫМ словам (ё→е критично — «плёнка» с ё
  // даёт word_similarity ниже порога и теряет все плёнки).
  const trgmKeywords = [...new Set(
    keywords.flatMap((k) => normalizeQuery(k).split(/[\s,/]+/).map((w) => w.replace(/[%(),]/g, '').trim()).filter((w) => w.length >= 3)),
  )]
  const { data: trgm, error: trgmError } = await supabase.rpc('search_accessories_trgm', {
    p_keywords: trgmKeywords,
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

// Ключевые слова-маркеры «покажите горшечные / какие комнатные растения» — без
// конкретного вида (см. classifyMessage: для pot без вида keywords = ["горшечные
// растения"], тот же маркер отдаёт classifyByRules). Для них — listPotPlants()
// (реальный топ по остатку), не similarity-поиск по названию (он вернёт пусто).
const GENERIC_POT_KEYWORDS = new Set(['горшечные растения', 'комнатные растения'])

interface PotSearchRow {
  id: number
  rank: number
  sim: number
}

/**
 * Шаг B (pot): поиск живых горшечных растений по конкретному виду через УЖЕ
 * СУЩЕСТВУЮЩИЙ RPC search_products (миграция 20260614_search_products.sql,
 * категорийно-нейтральный, уже используется /api/search) с p_category='pot'.
 * НЕ копирует accessories-ступени (ilike + search_accessories_trgm) — та trgm-RPC
 * хардкодит category='accessories' в самом SQL, для pot непригодна без отдельной
 * миграции. НЕ использует CATEGORY_TREE (та таксономия — только для accessories).
 * search_products уже фильтрует is_active/price>0/hidden_for_demo/source — реальные
 * остатки витрины, характеристики не домысливаются.
 */
async function searchPotPlants(keywords: string[]): Promise<AccessoryRow[]> {
  if (keywords.length === 0) return []
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[accessories-bot] SUPABASE_SERVICE_ROLE_KEY not set')
    return []
  }
  const supabase = createAdminClient()

  const byId = new Map<number, PotSearchRow>()
  for (const kw of keywords) {
    const { data, error } = await supabase.rpc('search_products', {
      q: kw,
      p_category: 'pot',
      p_subcategory: null,
    })
    if (error) {
      console.error('[accessories-bot] search_products (pot) failed:', error.message)
      continue
    }
    for (const r of (data ?? []) as Array<PotSearchRow & { qty: number; price: number }>) {
      const prev = byId.get(r.id)
      if (!prev || r.rank > prev.rank || (r.rank === prev.rank && r.sim > prev.sim)) {
        byId.set(r.id, r)
      }
    }
  }
  if (byId.size === 0) return []

  const ranked = [...byId.values()].sort((a, b) => b.rank - a.rank || b.sim - a.sim).slice(0, 20)

  // RPC не возвращает unit/pack_size/code_1c (нужны для WidgetProduct/карточки) —
  // один точечный select по уже отфильтрованным id, без повторного применения
  // is_active/price/hidden_for_demo (они уже применены внутри search_products).
  const ids = ranked.map((r) => r.id)
  const { data: full, error: fullErr } = await supabase.from('products').select(SEARCH_SELECT).in('id', ids)
  if (fullErr) {
    console.error('[accessories-bot] pot rows fetch failed:', fullErr.message)
    return []
  }
  const byIdFull = new Map((full as AccessoryRow[]).map((r) => [r.id, r]))
  const rows = ranked.map((r) => byIdFull.get(r.id)).filter((r): r is AccessoryRow => Boolean(r))
  console.log(`[accessories-bot] search (pot): ${rows.length} товаров по`, JSON.stringify(keywords))
  return rows
}

/** Общий вопрос про горшечные без вида — реальный топ по остатку (category='pot'). */
async function listPotPlants(limit = 12): Promise<AccessoryRow[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[accessories-bot] SUPABASE_SERVICE_ROLE_KEY not set')
    return []
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('products')
    .select(SEARCH_SELECT)
    .eq('category', 'pot')
    .eq('is_active', true)
    .eq('hidden_for_demo', false)
    .gt('price', 0)
    .order('qty', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[accessories-bot] listPotPlants failed:', error.message)
    return []
  }
  const rows = (data ?? []) as AccessoryRow[]
  console.log(`[accessories-bot] list (pot browse): ${rows.length} товаров`)
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
type Channel = 'widget' | 'whatsapp'

// Канал «виджет сайта»: товары показываются ОТДЕЛЬНЫМИ карточками (products[]),
// поэтому текст — только разговорная фраза, БЕЗ перечисления товаров и БЕЗ ссылок.
// Перекрывает правила SYSTEM_PROMPT про названия/цены/ссылки. WhatsApp — без изменений.
const WIDGET_TEXT_RULES = `

=== КАНАЛ «ВИДЖЕТ САЙТА» (перекрывает правила про перечисление и ссылки выше) ===
Товары клиенту показываются ОТДЕЛЬНЫМИ КАРТОЧКАМИ (фото, цена, кнопки «В корзину»/«Открыть») —
НЕ в твоём тексте. Поэтому в ответе:
- НЕ перечисляй товары, НЕ пиши их названия / цены / наличие — всё это в карточках.
- НЕ вставляй НИКАКИХ ссылок (ни https://, ни /product, ни /catalog) — кнопки в карточках.
- Дай РОВНО одну короткую живую фразу (1–2 предложения): лёгкое вступление к карточкам
  («Вот что подойдёт под букеты 👇», «Смотрите варианты ниже 👇»), ИЛИ один уточняющий
  вопрос, ИЛИ короткий ответ по FAQ (для вопросов про сайт). Без списков и без ссылок.
- Если задаёшь УТОЧНЯЮЩИЙ вопрос (вариантов много / запрос размытый) — в КОНЦЕ добавь
  ОТДЕЛЬНОЙ строкой: «Варианты: A / B / C» (2–4 коротких варианта ответа, через « / »).
  Если уточнение не нужно — эту строку НЕ добавляй.`

async function composeAnswer(
  message: string,
  rows: AccessoryRow[],
  history: DialogMessage[] = [],
  channel: Channel = 'whatsapp',
  appliedFilters?: PotFilters,
): Promise<string | null> {
  const promptStartedAt = Date.now()
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

  // Фильтры клиента (диаметр/цена/остаток), УЖЕ применённые кодом (applyPotFilters) ДО
  // этого вызова — rows содержит только прошедшие проверку товары. Явно говорим об этом
  // Gemini, иначе SYSTEM_PROMPT правило 2 («никогда не утверждай соответствие непроверенному
  // условию») по умолчанию запрещает называть товары подходящими — а тут это уже честно.
  const filtersBlock =
    appliedFilters && hasActiveFilters(appliedFilters)
      ? `\nПРИМЕНЁННЫЕ ФИЛЬТРЫ (уже проверены кодом по реальным данным — это не догадка,
можешь прямо сказать, что показанные товары ИМ соответствуют): ${describePotFilters(appliedFilters)}.
Другие условия клиента, которых здесь нет (назначение, «одинаковые», цвет и т.п.), по-прежнему
НЕ проверены — на них продолжает действовать правило 2.\n`
      : ''

  const histBlock = formatHistory(history)
  const prompt = `${SYSTEM_PROMPT}${channel === 'widget' ? WIDGET_TEXT_RULES : ''}
${filtersBlock}
СПИСОК ТОВАРОВ (JSON): ${JSON.stringify(context)}

ПАМЯТКА (FAQ):
${CLIENT_FAQ}
${histBlock ? `\nИстория диалога (старые→новые):\n${histBlock}\n` : ''}
Сообщение клиента: ${message}`

  console.log('[ai timing] prompt preparation', {
    stage: 'compose',
    durationMs: Date.now() - promptStartedAt,
    productCount: rows.length,
    historyCount: history.length,
    promptChars: prompt.length,
  })

  const composeStartedAt = Date.now()
  const text = await callGemini(prompt, { temperature: 0.2, timingLabel: 'compose' })
  if (!text) return null
  const answer = text.trim()
  console.log('[ai timing] response composition', {
    stage: 'compose',
    durationMs: Date.now() - composeStartedAt,
    outputTextLength: answer.length,
  })
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
    // Канал ответа: 'widget' — текст разговорный, товары только в products[] (карточки);
    // 'whatsapp' (по умолчанию) — поведение без изменений (ссылки/перечисление в тексте).
    channel?: Channel
  },
): Promise<BotReply> {
  const totalStartedAt = Date.now()
  if (!message || !message.trim()) return { text: null }
  const channel: Channel = ctx?.channel ?? 'whatsapp'

  // Правило (виджет): явный вопрос про регистрацию/вход → форма в чате + короткий текст.
  // Короткое замыкание ДО классификации/Gemini — детерминированно. На WhatsApp формы нет.
  if (channel === 'widget') {
    const authAction = detectAuthAction(message)
    if (authAction) {
      const text = authAction === 'register'
        ? 'Регистрация займёт минуту — заполните форму ниже, PIN придёт в WhatsApp 🌸'
        : 'Вход по PIN — укажите номер в форме ниже, вышлем код в WhatsApp 🌸'
      return { text, action: authAction, meta: { intent: 'site_help', helped: true } }
    }
  }

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

  // Защитный конвейер: любой неожиданный сбой (классификация/поиск/compose) НЕ должен
  // ронять ответ. На исключении — мягкий переспрос, а не «не получилось ответить».
  try {
  const classifyStartedAt = Date.now()
  const cls = await classifyMessage(message, history)
  const classificationDurationMs = Date.now() - classifyStartedAt
  console.log('[ai timing] classification', {
    classificationSource: cls.classificationSource ?? 'gemini',
    reason: cls.reason,
    durationMs: classificationDurationMs,
    historyCount: history.length,
    intent: cls.intent,
    keywordCount: cls.keywords.length,
  })
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
    console.log('[ai diagnostic] accessories reply branch', {
      intent: cls.intent,
      classificationSource: cls.classificationSource ?? 'gemini',
      classificationReason: cls.reason,
      classificationDurationMs,
      keywordCount: cls.keywords.length,
      productCount: 0,
      composeCalled: false,
      composeReturnedNull: false,
      replyKind: 'smalltalk',
      normalizedOutputLength: reply.length,
      businessFallbackReason: undefined,
    })
    return { text: reply, meta: buildClassifiedMeta(cls, true, classificationDurationMs) }
  }

  // Прочее (живые цветы/букеты/статус заказа/жалоба/эмоции). Виджет: спокойный увод к
  // менеджеру осмысленным текстом. WhatsApp: молчим — менеджер ведёт диалог сам.
  if (cls.intent === 'other') {
    console.log('[ai diagnostic] accessories reply branch', {
      intent: cls.intent,
      classificationSource: cls.classificationSource ?? 'gemini',
      classificationReason: cls.reason,
      classificationDurationMs,
      keywordCount: cls.keywords.length,
      productCount: 0,
      composeCalled: false,
      composeReturnedNull: false,
      replyKind: channel === 'widget' ? 'widget_other_reply' : 'business_fallback',
      normalizedOutputLength: channel === 'widget' ? OTHER_WIDGET_REPLY.length : 0,
      businessFallbackReason: channel === 'widget' ? undefined : 'intent_other_whatsapp_null_text',
    })
    return {
      text: channel === 'widget' ? OTHER_WIDGET_REPLY : null,
      meta: buildClassifiedMeta(cls, false, classificationDurationMs),
    }
  }

  // accessories / pot / site_help → единый compose (каталог + FAQ), без изменений.
  // Товары ищем для accessories/pot; для site_help список пустой (отвечаем по памятке).
  let rows: AccessoryRow[] = []
  let appliedPotFilters: PotFilters | undefined
  if (cls.intent === 'accessories') {
    const searchStartedAt = Date.now()
    rows = await searchAccessories(cls.keywords)
    console.log('[ai timing] catalog search', {
      durationMs: Date.now() - searchStartedAt,
      keywordCount: cls.keywords.length,
      productCount: rows.length,
    })
    console.log(`[accessories-bot] search: ${rows.length} товаров по`, JSON.stringify(cls.keywords))
    if (rows.length === 0) {
      // Товаров нет — пробуем угадать раздел и предложить подборку.
      const leaf = matchLeafByKeywords(cls.keywords)
      if (leaf) {
        const groupId = groupIdForLeafSlug(leaf.slug)
        console.log('[accessories-bot] fallback category:', leaf.slug, '→ group', groupId)
        if (groupId) {
          // Виджет: без ссылки на подборку в тексте (по хэндоффу) — просто подсказываем раздел.
          const text = channel === 'widget'
            ? `Точную позицию не нашёл, но посмотрите раздел «${leaf.label}» в каталоге. Что-то конкретное подсказать?`
            : CATEGORY_SUGGESTION(leaf.label, catalogUrlForGroup(groupId))
          console.log('[ai diagnostic] accessories reply branch', {
            intent: cls.intent,
            classificationSource: cls.classificationSource ?? 'gemini',
            classificationReason: cls.reason,
            classificationDurationMs,
            keywordCount: cls.keywords.length,
            productCount: rows.length,
            composeCalled: false,
            composeReturnedNull: false,
            replyKind: 'category_suggestion',
            normalizedOutputLength: text.length,
            businessFallbackReason: undefined,
          })
          return { text, meta: buildClassifiedMeta(cls, true, classificationDurationMs) }
        }
      }
      // И раздел не угадался — честно к менеджеру (бот не помог → можно предложить телефон).
      console.log('[accessories-bot] not found → контакт менеджера')
      console.log('[ai diagnostic] accessories reply branch', {
        intent: cls.intent,
        classificationSource: cls.classificationSource ?? 'gemini',
        classificationReason: cls.reason,
        classificationDurationMs,
        keywordCount: cls.keywords.length,
        productCount: rows.length,
        composeCalled: false,
        composeReturnedNull: false,
        replyKind: 'not_found_reply',
        normalizedOutputLength: NOT_FOUND_REPLY.length,
        businessFallbackReason: 'accessories_not_found',
      })
      return { text: NOT_FOUND_REPLY, meta: buildClassifiedMeta(cls, false, classificationDurationMs) }
    }
  } else if (cls.intent === 'pot') {
    const searchStartedAt = Date.now()
    // Вид назван → similarity-поиск по названию (search_products). Вид не назван
    // (только общий маркер «горшечные растения» / «комнатные растения») → реальный
    // топ по остатку (listPotPlants) — similarity-поиск по такой фразе вернёт пусто.
    const specificKeywords = cls.keywords.filter((k) => !GENERIC_POT_KEYWORDS.has(k))
    rows = specificKeywords.length > 0 ? await searchPotPlants(specificKeywords) : await listPotPlants()
    console.log('[ai timing] catalog search', {
      durationMs: Date.now() - searchStartedAt,
      keywordCount: cls.keywords.length,
      productCount: rows.length,
    })
    if (rows.length === 0) {
      // Нет CATEGORY_TREE-таксономии для pot (та — только для accessories) — честно
      // к менеджеру, без угадывания раздела.
      console.log('[accessories-bot] pot not found → контакт менеджера')
      console.log('[ai diagnostic] accessories reply branch', {
        intent: cls.intent,
        classificationSource: cls.classificationSource ?? 'gemini',
        classificationReason: cls.reason,
        classificationDurationMs,
        keywordCount: cls.keywords.length,
        productCount: rows.length,
        composeCalled: false,
        composeReturnedNull: false,
        replyKind: 'not_found_reply',
        normalizedOutputLength: NOT_FOUND_REPLY.length,
        businessFallbackReason: 'pot_not_found',
      })
      return { text: NOT_FOUND_REPLY, meta: buildClassifiedMeta(cls, false, classificationDurationMs) }
    }

    // Числовые условия клиента (диаметр/цена/остаток) — извлекаем ДЕТЕРМИНИРОВАННО из
    // сырого message, НЕ из cls.keywords: classifyByRules() может вернуть intent раньше
    // Gemini (именованные виды — «монстера 14 см» и т.п., это основной путь, а не edge
    // case) и никогда не видит числа — извлечение обязано быть независимым от того, как
    // определился intent. Фильтруем ДО composeAnswer, чтобы Gemini физически не увидел
    // товары, не прошедшие проверку — не полагаемся только на текст промпта (см. Priority
    // 1-4 разбор: одного prompt-запрета оказалось недостаточно).
    const potFilters = extractPotFilters(message)
    if (hasActiveFilters(potFilters)) {
      const filteredRows = applyPotFilters(rows, potFilters)
      if (filteredRows.length === 0) {
        const label = specificKeywords.length > 0 ? specificKeywords.join(', ') : 'горшечные растения'
        const text = `${label.charAt(0).toUpperCase()}${label.slice(1)} есть в наличии, но нет `
          + `варианта с параметрами: ${describePotFilters(potFilters)}. ${MANAGER_CONTACT}`
        console.log('[accessories-bot] pot filters excluded all rows →', JSON.stringify(potFilters))
        console.log('[ai diagnostic] accessories reply branch', {
          intent: cls.intent,
          classificationSource: cls.classificationSource ?? 'gemini',
          classificationReason: cls.reason,
          classificationDurationMs,
          keywordCount: cls.keywords.length,
          productCount: rows.length,
          composeCalled: false,
          composeReturnedNull: false,
          replyKind: 'pot_filter_no_match',
          normalizedOutputLength: text.length,
          businessFallbackReason: 'pot_filters_excluded_all',
        })
        return { text, meta: buildClassifiedMeta(cls, false, classificationDurationMs) }
      }
      rows = filteredRows
      appliedPotFilters = potFilters
      console.log(`[accessories-bot] pot filters applied: ${JSON.stringify(potFilters)} → ${rows.length} товаров`)
    }
  }

  const answer = await composeAnswer(message, rows, history, channel, appliedPotFilters)
  console.log(`[accessories-bot] compose (${cls.intent}, ${channel}):`, answer ? `ответ len=${answer.length}` : 'NO_ANSWER')
  console.log('[ai diagnostic] accessories reply branch', {
    intent: cls.intent,
    classificationSource: cls.classificationSource ?? 'gemini',
    classificationReason: cls.reason,
    classificationDurationMs,
    keywordCount: cls.keywords.length,
    productCount: rows.length,
    composeCalled: true,
    composeReturnedNull: answer == null,
    replyKind: answer == null ? 'compose_null' : 'compose_text',
    normalizedOutputLength: answer?.length ?? 0,
    businessFallbackReason: answer == null ? 'compose_returned_null' : undefined,
  })
  console.log('[ai timing] accessories total', {
    durationMs: Date.now() - totalStartedAt,
    intent: cls.intent,
    productCount: rows.length,
    historyCount: history.length,
    outputTextLength: answer?.length ?? 0,
  })

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
    sku: r.code_1c, url: `${SITE_URL}/product/${r.id}`,
  }))

  return {
    text: answer,
    products: products.length ? products : undefined,
    photo,
    meta: buildClassifiedMeta(cls, answer != null, classificationDurationMs),
  }
  } catch (err) {
    console.error('[accessories-bot] pipeline failed:', err instanceof Error ? err.message : err)
    // Мягкий переспрос — не «упал». Вне зоны/непонятно → менеджер подхватит.
    return {
      text: 'Не совсем понял вопрос 🌸 Уточните, что именно подобрать — например, плёнку, '
        + 'горшок или удобрение? Или напишите менеджеру, поможем.',
      meta: { intent: 'other', helped: false },
    }
  }
}
