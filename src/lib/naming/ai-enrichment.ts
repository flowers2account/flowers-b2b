import { createClient } from '@/lib/supabase/server';

export interface EnrichedProductData {
  raw_name: string;
  species_id: number | null;
  cultivar_cyrillic: string | null;
  cultivar_latin: string | null;
  color: string | null;
  colors: string[];
  country_iso: string | null;
  length_cm: number | null;
  pack_size: number | null;
  stems_per_pack: number | null;
  confidence: number;
  source: 'cache' | 'ai' | 'failed';
  translation_memory_id: number | null;
}

interface GeminiItem {
  original: string;
  species_code: string | null;
  cultivar_cyrillic: string | null;
  cultivar_latin: string | null;
  country_iso: string | null;
  color: string | null;
  length_cm: number | null;
  confidence: number;
}

const BATCH_SIZE = 40;

function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function callGeminiEnrich(names: string[], speciesRef: string): Promise<GeminiItem[]> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[AI enrichment] GOOGLE_GEMINI_API_KEY not set');
    return [];
  }

  const prompt = `Ты эксперт по цветочной продукции. Определи атрибуты товаров из прайса 1С (оптовый склад цветов).

СПРАВОЧНИК ВИДОВ:
${speciesRef}

ДЛЯ КАЖДОГО НАЗВАНИЯ ВЕРНИ JSON-объект:
- original: точная исходная строка (без изменений)
- species_code: код вида из справочника выше (null если нельзя определить)
- cultivar_cyrillic: кириллическое название сорта, без длины и без названия вида (null если нет)
- cultivar_latin: латинское название сорта если есть (null если нет)
- country_iso: ISO-2 только если страна явно указана в названии (KE/EC/NL/CN/CO/EG/ET) — null иначе
- color: цвет только если явно указан в названии — null иначе
- length_cm: число — длина в см из названия — null если нет числа
- confidence: уверенность 0.0–1.0

ПРАВИЛА:
- Числа в конце названия = длина в см
- Не придумывай данные, которых нет в исходном названии
- Сорт = всё что не является видом, длиной, страной или цветом

ПРИМЕРЫ:
"Ред Наоми 60" → species_code:"rose_large_flowered", cultivar_cyrillic:"Ред Наоми", length_cm:60, confidence:0.95
"Тюльпан Стронг Лав 40" → подбери точный код тюльпана, cultivar_cyrillic:"Стронг Лав", length_cm:40
"Хризантема Бакарди 70" → подбери код хризантемы, cultivar_cyrillic:"Бакарди", length_cm:70

ВХОДНЫЕ ДАННЫЕ (верни ТОЛЬКО JSON массив без markdown):
${JSON.stringify(names)}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!res.ok) {
      console.error('[AI enrichment] Gemini HTTP error:', res.status, await res.text());
      return [];
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('[AI enrichment] Empty Gemini response');
      return [];
    }

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as GeminiItem[];
  } catch (err) {
    console.error('[AI enrichment] Gemini call failed:', err);
    return [];
  }
}

export async function enrichProductBatch(rawNames: string[]): Promise<EnrichedProductData[]> {
  if (rawNames.length === 0) return [];

  const supabase = await createClient();

  const normalized = rawNames.map(normalizeName);

  // Load species reference once
  const { data: speciesRows } = await supabase
    .from('species')
    .select('id, code, name_ru, name_ru_abbrev');

  const speciesMap = new Map<string, number>(
    (speciesRows ?? []).map(s => [s.code as string, s.id as number])
  );

  const speciesRef = (speciesRows ?? [])
    .map(s => `  ${s.code}: ${s.name_ru}${s.name_ru_abbrev ? ` (${s.name_ru_abbrev})` : ''}`)
    .join('\n');

  // Cache lookup — any non-flagged hit counts as cached
  const { data: cachedRows } = await supabase
    .from('translation_memory')
    .select('id, normalized_original, species_id, color, country_iso, length_cm, confidence')
    .in('normalized_original', normalized)
    .eq('is_flagged', false);

  const cachedMap = new Map<string, NonNullable<typeof cachedRows>[number]>();
  for (const c of cachedRows ?? []) {
    const key = c.normalized_original as string;
    if (!cachedMap.has(key)) cachedMap.set(key, c);
  }

  // Find names that need AI
  const toEnrich = rawNames.filter((_, i) => !cachedMap.has(normalized[i]));

  // Call AI in batches, save results to TM
  const aiMap = new Map<string, GeminiItem & { tm_id: number | null }>();

  for (let offset = 0; offset < toEnrich.length; offset += BATCH_SIZE) {
    const batch = toEnrich.slice(offset, offset + BATCH_SIZE);
    let results: GeminiItem[] = [];

    try {
      results = await callGeminiEnrich(batch, speciesRef);
    } catch {
      // batch failed entirely — continue with failed fallback
    }

    for (const r of results) {
      const norm = normalizeName(r.original);
      const speciesId = r.species_code ? (speciesMap.get(r.species_code) ?? null) : null;

      let tmId: number | null = null;
      const { data: saved, error: saveErr } = await supabase
        .from('translation_memory')
        .insert({
          original: r.original,
          normalized_original: norm,
          translated: r.cultivar_cyrillic ?? r.original,
          normalized_translated: normalizeName(r.cultivar_cyrillic ?? r.original),
          source: 'ai',
          confidence: r.confidence ?? 0.7,
          is_flagged: false,
          species_id: speciesId,
          cultivar_cyrillic: r.cultivar_cyrillic ?? null,
          cultivar_latin: r.cultivar_latin ?? null,
          color: r.color ?? null,
          country_iso: r.country_iso ?? null,
          length_cm: r.length_cm ?? null,
        })
        .select('id')
        .maybeSingle();

      if (saveErr) {
        // Likely unique constraint violation from concurrent import — non-fatal
        console.warn('[AI enrichment] TM insert skipped:', saveErr.message);
      } else {
        tmId = (saved?.id as number) ?? null;
      }

      aiMap.set(norm, { ...r, tm_id: tmId });
    }
  }

  // Build final result array
  return rawNames.map((name, i) => {
    const norm = normalized[i];
    const c = cachedMap.get(norm);

    if (c) {
      return {
        raw_name: name,
        species_id: (c.species_id as number | null) ?? null,
        cultivar_cyrillic: null,
        cultivar_latin: null,
        color: (c.color as string | null) ?? null,
        colors: c.color ? [c.color as string] : [],
        country_iso: (c.country_iso as string | null) ?? null,
        length_cm: (c.length_cm as number | null) ?? null,
        pack_size: null,
        stems_per_pack: null,
        confidence: (c.confidence as number) ?? 0,
        source: 'cache' as const,
        translation_memory_id: (c.id as number) ?? null,
      };
    }

    const ai = aiMap.get(norm);
    if (ai) {
      const speciesId = ai.species_code ? (speciesMap.get(ai.species_code) ?? null) : null;
      return {
        raw_name: name,
        species_id: speciesId,
        cultivar_cyrillic: ai.cultivar_cyrillic ?? null,
        cultivar_latin: ai.cultivar_latin ?? null,
        color: ai.color ?? null,
        colors: ai.color ? [ai.color] : [],
        country_iso: ai.country_iso ?? null,
        length_cm: ai.length_cm ?? null,
        pack_size: null,
        stems_per_pack: null,
        confidence: ai.confidence ?? 0.7,
        source: 'ai' as const,
        translation_memory_id: ai.tm_id,
      };
    }

    return {
      raw_name: name,
      species_id: null,
      cultivar_cyrillic: null,
      cultivar_latin: null,
      color: null,
      colors: [],
      country_iso: null,
      length_cm: null,
      pack_size: null,
      stems_per_pack: null,
      confidence: 0,
      source: 'failed' as const,
      translation_memory_id: null,
    };
  });
}
