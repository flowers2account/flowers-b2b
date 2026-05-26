import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeSupplierName, NormalizationResult } from '@/lib/naming/supplier-translations';
import { normalizeText } from '@/lib/utils/normalize-text';

export const dynamic = 'force-dynamic';

// ========================================
// ТИПЫ
// ========================================

interface TranslationResult {
  original: string;
  translated: string;
  confidence: number;
  method: 'db_exact' | 'ai_assisted' | 'rule_based';
  source?: string;
  editable: boolean;
}

interface GeminiTranslation {
  original: string;
  translated: string;
  confidence: number;
}

// ========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ========================================

const TRANSLATION_PREFIXES = new Set([
  // виды
  'хризантема','роза','лилия','гербера','тюльпан','гвоздика','пион',
  'гортензия','эустома','лизиантус','альстромерия','антуриум','орхидея',
  'цимбидиум','калла','ирис','дельфиниум','подсолнух','ранункулюс',
  'анемон','матрикария','гипсофила','озотхамнус','хамелациум','эвкалипт',
  'гиппеаструм','амариллис','нарцисс','гиацинт','георгин','статица',
  'мимоза','илекс','нобилис','лейкодендрон','стрелиция','геликония',
  // типы сортов
  'ветковая','кустовая','одноголовая','сантини','спрей','стандарт',
  'махровая','махровый','махровое','восточная','восточный',
  // цветовые дескрипторы используемые как тип (не сорт)
  'ред','вайт','розовая','белый','белая','красный',
  // прочие нейтральные слова
  'микс','аквабокс','вакуум',
])

function addGuillemets(s: string): string {
  if (!s || s.includes('«')) return s

  const words = s.toLowerCase().trim().split(/\s+/)
  let i = 0
  while (i < words.length && TRANSLATION_PREFIXES.has(words[i])) i++

  // Культивар не найден или вся строка — префиксные слова
  if (i === 0 || i >= words.length) {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const prefix = words.slice(0, i)
  const cultivar = words.slice(i)

  const prefixStr = prefix[0].charAt(0).toUpperCase() + prefix[0].slice(1)
    + (prefix.length > 1 ? ' ' + prefix.slice(1).join(' ') : '')
  const cultivarStr = cultivar.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  return `${prefixStr} «${cultivarStr}»`
}

function extractKeywords(product: string): string[] {
  const normalized = normalizeText(product);
  const words = normalized.split(/\s+/);

  const keywords = [words[0]];
  if (words[1] && words[1].length > 3) {
    keywords.push(words[1]);
  }

  return keywords.filter(Boolean);
}

async function findSimilarFromDB(products: string[], limit: number = 10) {
  const supabase = await createClient();

  const keywords = products
    .flatMap(p => extractKeywords(p))
    .filter((v, i, a) => v && a.indexOf(v) === i);

  if (keywords.length === 0) {
    console.log('[findSimilarFromDB] No keywords extracted');
    return [];
  }

  const orConditions = keywords.map(k =>
    `normalized_original.ilike.%${k}%`
  ).join(',');

  const { data, error } = await supabase
    .from('translation_memory_context')
    .select('*')
    .or(orConditions)
    .order('usage_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[findSimilarFromDB] Error:', error);
    return [];
  }

  console.log(`[findSimilarFromDB] Found ${data?.length || 0} similar`);
  return data || [];
}

async function findExactInDB(normalizedProducts: string[]) {
  const supabase = await createClient();

  const [forwardResult, reverseResult] = await Promise.all([
    supabase
      .from('translation_memory')
      .select('original, normalized_original, translated, normalized_translated, confidence, source')
      .in('normalized_original', normalizedProducts)
      .eq('is_flagged', false)
      .not('approved_by', 'is', null),
    supabase
      .from('translation_memory')
      .select('original, normalized_original, translated, normalized_translated, confidence, source')
      .in('normalized_translated', normalizedProducts)
      .eq('is_flagged', false)
      .not('approved_by', 'is', null),
  ]);

  if (forwardResult.error) console.error('[findExactInDB] Forward error:', forwardResult.error);
  if (reverseResult.error) console.error('[findExactInDB] Reverse error:', reverseResult.error);

  const forward = (forwardResult.data || []).map(r => ({ ...r, _direction: 'forward' as const }));
  const reverse = (reverseResult.data || []).map(r => ({ ...r, _direction: 'reverse' as const }));

  // Forward takes priority — exclude reverse hits already covered by forward
  const forwardKeys = new Set(forward.map(r => r.normalized_translated));
  const uniqueReverse = reverse.filter(r => !forwardKeys.has(r.normalized_translated));

  console.log(`[findExactInDB] Forward: ${forward.length}, Reverse: ${uniqueReverse.length}`);
  return [...forward, ...uniqueReverse];
}

async function translateBatchWithGemini(
  products: string[],
  context: Record<string, unknown>[]
): Promise<GeminiTranslation[]> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[Gemini] API key not set');
    return [];
  }

  const contextFormatted = context
    .map(c => `"${c.original}" → "${c.translated}"`)
    .join('\n');

  const prompt = `Ты профессиональный floral catalog normalizer для русскоязычного цветочного каталога.

Твоя задача:
- расшифровывать florist abbreviations
- переводить botanical terms на русский
- транслитерировать сорта на кириллицу
- нормализовать коммерческие названия цветов
- приводить всё к единому catalog style

ПРАВИЛА:

1. Переводить botanical/common terms:
Chr / Chrys → Хризантема
Rosa / Rose → Роза
Carn → Гвоздика
Lis / Lisianthus → Эустома
Hydr → Гортензия
Paeonia / Pae → Пион
Lilium / Lil → Лилия
Gyps → Гипсофила
Helianthus → Подсолнух
Delphinium → Дельфиниум
Matricaria → Матрикария
Chamelaucium → Хамелациум
Cymbidium → Цимбидиум
Ozothamnus → Озотхамнус
Leaf eucalyptus → Эвкалипт
Leaf leather fern → Ледерфёрн

2. Нормализовать florist forms:
T / Spray / Spr / sp → ветковая
bl / Disb → одноголовая
sa / Santini → сантини
dbl / do → махровая
or → восточная

3. Сорта:
- НЕ переводить по смыслу
- транслитерировать кириллицей
- каждое слово с заглавной буквы
- ВСЕГДА оборачивать в русские ёлочки «»

Примеры транслитерации:
Explorer → Эксплорер
Pink Mondial → Пинк Мондиаль
Rosita White → Розита Вайт
Baltica Bubblegum → Балтика Бабблгам
Commander → Коммандер
Newton → Ньютон
Altaj → Алтай

4. Формат результата: [Тип] [форма] «Сорт»
Примеры:
Chr T Baltica White → Хризантема ветковая «Балтика Вайт»
Chrys bl Superbowl → Хризантема одноголовая «Супербол»
Rosa sp Purple Sky → Роза кустовая «Пёрпл Скай»
Paeonia Sarah Bernhardt → Пион «Сара Бернар»
Lisianthus do Rosita White → Эустома махровая «Розита Вайт»

5. Технический мусор (высота в см, коды партий, имена ферм) — игнорировать.

6. Не добавлять комментариев. Только готовое название.

${contextFormatted ? `ПРИМЕРЫ ИЗ БД (используй этот стиль):\n${contextFormatted}\n` : ''}
ПЕРЕВЕДИ (верни ТОЛЬКО JSON массив):
${JSON.stringify(products)}

Формат ответа (БЕЗ markdown):
[
  {
    "original": "точная исходная строка",
    "translated": "русский перевод",
    "confidence": 0.9
  }
]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini] HTTP error:', response.status, errorText);
      return [];
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('[Gemini] No text in response');
      return [];
    }

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    console.log(`[Gemini] Translated ${parsed.length} products`);
    return parsed;

  } catch (error) {
    console.error('[Gemini] Error:', error);
    return [];
  }
}

// ========================================
// ГЛАВНЫЙ HANDLER
// ========================================

export async function POST(request: NextRequest) {
  try {
    const { products } = await request.json();

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: 'Invalid input: products must be non-empty array' },
        { status: 400 }
      );
    }

    console.log(`[Batch] Processing ${products.length} products`);

    // ШАГ 1: Нормализация
    const normalized = products.map((p: string) => ({
      original: p,
      normalized: normalizeText(p)
    }));

    // ШАГ 2: Rule-based для ВСЕХ
    const ruleResults: Array<{
      original: string;
      normalized: string;
      ruleResult: NormalizationResult;
    }> = normalized.map(n => ({
      original: n.original,
      normalized: n.normalized,
      ruleResult: normalizeSupplierName(n.original)
    }));

    console.log('[Batch] Rule-based complete');

    // ШАГ 3: Поиск exact match в БД
    const dbResults = await findExactInDB(
      normalized.map(n => n.normalized)
    );

    console.log(`[Batch] Found ${dbResults.length} exact matches in DB`);

    // ШАГ 4: Отбор для AI (confidence < 0.85 ИЛИ культивар содержит латиницу, и нет в БД)
    const SPECIES_FORMS = /^(хризантема|роза|гвоздика|эустома|гортензия|лилия|гербера|тюльпан|пион|альстромерия|антуриум|орхидея|калла|ирис|дельфиниум|подсолнух|ранункулюс|анемон|матрикария|гипсофила|цимбидиум|ветковая|одноголовая|сантини|махровая|восточная|спрей|стандарт)\s*/gi

    const needAI = ruleResults.filter(r => {
      const inDB = dbResults.some((db: Record<string, unknown>) =>
        db._direction === 'forward'
          ? db.normalized_original === r.normalized
          : db.normalized_translated === r.normalized
      );
      const cultivar = r.ruleResult.normalized.replace(SPECIES_FORMS, '').trim()
      const hasLatinCultivar = cultivar.length > 0 && /[a-zA-Z]/.test(cultivar)
      return (r.ruleResult.confidence < 0.85 || hasLatinCultivar) && !inDB;
    });

    console.log(`[Batch] ${needAI.length} products need AI`);

    // ШАГ 5: Batch перевод через Gemini
    let aiResults: GeminiTranslation[] = [];
    if (needAI.length > 0) {
      const context = await findSimilarFromDB(
        needAI.map(n => n.original),
        10
      );

      console.log(`[Batch] Loaded ${context.length} context examples`);

      aiResults = await translateBatchWithGemini(
        needAI.map(n => n.original),
        context
      );
    }

    // ШАГ 6: Merge результатов
    const final: TranslationResult[] = ruleResults.map(r => {
      // Приоритет 1: Exact match в БД (прямой или обратный)
      const dbMatch = dbResults.find((db: Record<string, unknown>) =>
        db._direction === 'forward'
          ? db.normalized_original === r.normalized
          : db.normalized_translated === r.normalized
      );
      if (dbMatch) {
        const isReverse = dbMatch._direction === 'reverse';
        return {
          original: r.original,
          translated: isReverse
            ? (dbMatch.original as string)
            : (dbMatch.translated as string),
          confidence: 1.0,
          method: 'db_exact' as const,
          source: dbMatch.source as string | undefined,
          editable: true
        };
      }

      // Приоритет 2: AI (сравнение через нормализацию)
      const aiMatch = aiResults.find(ai =>
        normalizeText(ai.original) === r.normalized
      );

      if (aiMatch && aiMatch.confidence > r.ruleResult.confidence) {
        return {
          original: r.original,
          translated: aiMatch.translated,
          confidence: aiMatch.confidence,
          method: 'ai_assisted' as const,
          source: 'gemini',
          editable: true
        };
      }

      // Приоритет 3: Rule-based fallback
      return {
        original: r.original,
        translated: r.ruleResult.normalized || r.original.toLowerCase(),
        confidence: r.ruleResult.confidence,
        method: 'rule_based' as const,
        source: r.ruleResult.matchedBy || 'fallback',
        editable: true
      };
    });

    // ШАГ 7: Постобработка — добавляем «ёлочки» и нормализуем термины
    const finalFormatted = final
      .map(r => r.method === 'db_exact' ? r : { ...r, translated: addGuillemets(r.translated) })
      .map(r => ({ ...r, translated: r.translated.replace(/кустовая/gi, 'ветковая') }))

    console.log('[Batch] Complete');

    return NextResponse.json({
      success: true,
      results: finalFormatted,
      stats: {
        total: products.length,
        db_exact: final.filter(f => f.method === 'db_exact').length,
        ai_assisted: final.filter(f => f.method === 'ai_assisted').length,
        rule_based: final.filter(f => f.method === 'rule_based').length
      }
    });

  } catch (error) {
    console.error('[Batch] Fatal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
