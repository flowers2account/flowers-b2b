// src/lib/naming/ai-normalizer.ts
import { normalizeSupplierName } from './supplier-translations';
import type { NormalizationResult } from './supplier-translations';

const CONFIDENCE_THRESHOLD = 0.7;
const GEMINI_MODEL = 'gemini-2.5-flash-lite-latest';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Нормализация с AI fallback через Gemini API
 *
 * Workflow:
 * 1. Rule-based first (быстро, бесплатно, 243 known products)
 * 2. Если confidence < 0.7 → Gemini API (2-3s, платно, но точно)
 */
export async function normalizeWithAI(
  original: string,
  category?: 'cut' | 'pot'
): Promise<NormalizationResult> {

  // ШАГ 1: Rule-based нормализация
  const ruleBasedResult = normalizeSupplierName(original);

  // Если уверенность высокая — возвращаем сразу (экономим API calls)
  if (ruleBasedResult.confidence >= CONFIDENCE_THRESHOLD) {
    return ruleBasedResult;
  }

  // ШАГ 2: Низкая уверенность → спрашиваем Gemini
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('GOOGLE_GEMINI_API_KEY not set, using rule-based result');
    return ruleBasedResult;
  }

  try {
    const aiResult = await askGeminiForTranslation(original, category, apiKey);

    // Если AI уверен больше — используем его результат
    if (aiResult.confidence > ruleBasedResult.confidence) {
      return {
        ...aiResult,
        matchedBy: 'ai_assisted',
        warnings: [
          ...(aiResult.warnings || []),
          `rule_based_fallback: ${ruleBasedResult.confidence.toFixed(2)}`
        ]
      };
    }
  } catch (error) {
    console.error('Gemini API error:', error);
  }

  return ruleBasedResult;
}

async function askGeminiForTranslation(
  original: string,
  category: 'cut' | 'pot' | undefined,
  apiKey: string
): Promise<NormalizationResult> {

  const prompt = buildPrompt(original, category);

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 100,
        topP: 0.8,
        topK: 10
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No text in Gemini response');
  }

  return parseGeminiResponse(text, original);
}

function buildPrompt(original: string, category?: 'cut' | 'pot'): string {
  const categoryHint = category === 'pot'
    ? 'Это ГОРШЕЧНОЕ растение (pot plant).'
    : category === 'cut'
    ? 'Это СРЕЗАННЫЙ цветок (cut flower).'
    : 'Определи тип товара сам.';

  return `Ты — эксперт по флористическому рынку СНГ. Переведи название товара из голландской накладной на русский.

${categoryHint}

ПРАВИЛА:
1. Используй florist-market транслит: пинк, вайт, ред, микс (НЕ розовый, белый, красный, смесь)
2. Раскрывай botanical сокращения:
   - semp. → sempervivens
   - benja. → benjamina
   - frag. → fragrans
   - delic. → делициоза
   - exal. → exaltata
   - pulc. → pulcherrima
   - sim. → simsii
   - blos. → blossom
3. Сохраняй названия сортов: 'Karma White' → карма вайт
4. "..." означает микс
5. Lowercase, без лишних символов

ПРИМЕРЫ СРЕЗКИ:
Chr T Commander Pink → хризантема ветковая коммандер пинк
R Tr Fireworks → роза ветковая файерворкс
Li La Brindisi → лилия ла бриндизи

ПРИМЕРЫ ГОРШЕЧНЫХ:
Anthurium ...mix → антуриум микс
Ficus benja. 'Exotica' → фикус бенджамина экзотика
Kalanchoe blos. rosebud → каланхоэ бутон розы
Monstera delic. → монстера деликатесная
Spathiphyllum 'Sweet Chico' → спатифиллум свит чико

ВХОДНЫЕ ДАННЫЕ:
${original}

ОТВЕТ (только перевод, без объяснений):`;
}

function parseGeminiResponse(
  text: string,
  original: string
): NormalizationResult {

  const normalized = text.trim().toLowerCase();

  let confidence = 0.85;

  if (normalized.length < 5) confidence = 0.6;
  if (normalized === original.toLowerCase()) confidence = 0.5;
  if (normalized.includes('error') || normalized.includes('unknown')) confidence = 0.4;

  // Повышаем если есть признаки качественного перевода
  if (
    normalized.includes('хризантема') || normalized.includes('роза') ||
    normalized.includes('лилия')      || normalized.includes('антуриум') ||
    normalized.includes('фикус')      || normalized.includes('монстера')
  ) {
    confidence = Math.min(confidence + 0.1, 0.95);
  }

  return { normalized, confidence, matchedBy: 'ai', warnings: undefined };
}
