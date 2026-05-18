// src/lib/naming/ai-normalizer.ts
import { normalizeSupplierName } from './supplier-translations';
import type { NormalizationResult } from './supplier-translations';

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Нормализация с AI fallback
 * 1. Rule-based first (быстро, бесплатно)
 * 2. Если confidence < 0.7 → Claude API (медленно, платно, точно)
 */
export async function normalizeWithAI(
  original: string,
  category?: 'cut' | 'pot'
): Promise<NormalizationResult> {

  // ШАГ 1: Rule-based нормализация
  const ruleBasedResult = normalizeSupplierName(original);

  // Если уверенность высокая — возвращаем сразу
  if (ruleBasedResult.confidence >= CONFIDENCE_THRESHOLD) {
    return ruleBasedResult;
  }

  // ШАГ 2: Низкая уверенность → спрашиваем AI
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, using rule-based result');
    return ruleBasedResult;
  }

  try {
    const aiResult = await askClaudeForTranslation(original, category, apiKey);

    // Сравниваем результаты
    if (aiResult.confidence > ruleBasedResult.confidence) {
      return {
        ...aiResult,
        matchedBy: 'ai_assisted',
        warnings: [
          ...(aiResult.warnings || []),
          `fallback_from_rule_based: ${ruleBasedResult.confidence.toFixed(2)}`
        ]
      };
    }
  } catch (error) {
    console.error('AI normalization failed:', error);
  }

  return ruleBasedResult;
}

async function askClaudeForTranslation(
  original: string,
  category: 'cut' | 'pot' | undefined,
  apiKey: string
): Promise<NormalizationResult> {

  const prompt = buildPrompt(original, category);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  return parseClaudeResponse(text, original);
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
   - delic. → deliciosa
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

function parseClaudeResponse(
  text: string,
  original: string
): NormalizationResult {

  const normalized = text.trim().toLowerCase();

  let confidence = 0.85;

  if (normalized.length < 5) confidence = 0.6;
  if (normalized === original.toLowerCase()) confidence = 0.5;
  if (normalized.includes('error') || normalized.includes('unknown')) confidence = 0.4;

  return {
    normalized,
    confidence,
    matchedBy: 'ai',
    warnings: undefined
  };
}
