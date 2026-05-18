import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeSupplierName, NormalizationResult } from '@/lib/naming/supplier-translations';
import { normalizeText } from '@/lib/utils/normalize-text';

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

  const { data, error } = await supabase
    .from('translation_memory')
    .select('*')
    .in('normalized_original', normalizedProducts)
    .eq('is_flagged', false)
    .not('approved_by', 'is', null);

  if (error) {
    console.error('[findExactInDB] Error:', error);
    return [];
  }

  return data || [];
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

  const prompt = `Ты — эксперт по флористике СНГ. Переведи названия товаров.

ПРАВИЛА:
1. Florist-market транслит: pink→пинк, white→вайт, red→ред, mix→микс
2. Раскрывай сокращения: benja.→benjamina, delic.→deliciosa, fr→fragrans
3. Сохраняй названия сортов в кавычках: 'Princess'→'принцесс'
4. Убирай технический мусор (высота, диаметр)

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

    // ШАГ 4: Отбор для AI (confidence < 0.85 и нет в БД)
    const needAI = ruleResults.filter(r => {
      const inDB = dbResults.some((db: Record<string, unknown>) =>
        db.normalized_original === r.normalized
      );
      return r.ruleResult.confidence < 0.85 && !inDB;
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
      // Приоритет 1: Exact match в БД
      const dbMatch = dbResults.find((db: Record<string, unknown>) =>
        db.normalized_original === r.normalized
      );
      if (dbMatch) {
        return {
          original: r.original,
          translated: dbMatch.translated as string,
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

    console.log('[Batch] Complete');

    return NextResponse.json({
      success: true,
      results: final,
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
