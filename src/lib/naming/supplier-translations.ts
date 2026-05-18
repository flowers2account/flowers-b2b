// supplier-translations.ts
// Обучено на 243 реальных переводах из накладных (Astrafund + Horti Fair)
// Дата: 2026-05-18

/**
 * СЛОВАРЬ ПЕРЕВОДОВ НАЗВАНИЙ ТОВАРОВ
 * 
 * Источники данных:
 * - Astrafund: 24 накладные (Invoice *.xls)
 * - Horti Fair: 7 накладных (sp Factuur *.xlsx)
 * - Всего: 243 уникальных перевода
 */

// ============================================================================
// ПРЕФИКСЫ ПОСТАВЩИКОВ
// ============================================================================

export const SUPPLIER_PREFIXES: Record<string, string> = {
  // Хризантемы
  'chr t': 'хризантема ветковая',
  'chr s': 'хризантема сантини',
  'chr g': 'хризантема одноголовая',
  'chrys sp': 'хризантема ветковая',
  'chrys sa': 'хризантема сантини',
  'chrys bl': 'хризантема одноголовая',
  'chrysanthemum geplozen': 'хризантема одноголовая',
  
  // Розы
  'r tr': 'роза ветковая',
  'r gr': 'роза спрей',
  'rs': 'роза спрей',
  // УБРАНО: 'r': 'роза' — слишком опасный prefix (может ловить ranunculus)
  
  // Герберы
  'ge gr': 'гербера',
  'germ': 'гермини',
  
  // Лилии
  'li la': 'лилия ла',
  'li or du': 'лилия ор ду',
  'li ot': 'лилия от',
  'lilium la': 'лилия ла',
  
  // Орхидеи
  'cymb t': 'цимбидиум',
  'cymb': 'цимбидиум',
  
  // Антуриумы
  'anth a': 'антуриум',
  
  // Фисташка
  'pistache select': 'фисташка корт',
  'pistache 65 lang': 'фисташка лонг',
  'pistache': 'фисташка',
  
  // Эвкалипт
  'euca': 'эвкалипт',
  
  // Рускус
  'rusc': 'рускус',
  'ruscus': 'рускус',
  
  // Прочие
  'antir': 'антирринум',
  'brass': 'брассика',
  'chame': 'хамелациум',
  'gyps': 'гипсофила',
  'fr du': 'фрезия',
  'iris': 'ирис',
};

// ============================================================================
// ПОЛНЫЙ СЛОВАРЬ ПЕРЕВОДОВ (обучен на реальных данных)
// ============================================================================

export const VARIETY_TRANSLATIONS: Record<string, string> = {
  // === ХРИЗАНТЕМЫ ВЕТКОВЫЕ (Chr T) ===
  'chr t altaj': 'хризантема ветковая алтай',
  'chr t altaj decorum': 'хризантема ветковая алтай декорум',
  'chr t altaj yellow': 'хризантема ветковая алтай еллоу',
  'chr t baller pink': 'хризантема ветковая балерина пинк',
  'chr t ballerinas': 'хризантема ветковая баллерина',
  'chr t baltica': 'хризантема ветковая балтика',
  'chr t baltica cream': 'хризантема ветковая балтика креам',
  'chr t chic': 'хризантема ветковая чик',
  'chr t chic decorum': 'хризантема ветковая чик декорум',
  'chr t commander': 'хризантема ветковая коммандер',
  'chr t commander pink': 'хризантема ветковая коммандер пинк',
  'chr t copa': 'хризантема ветковая копа',
  'chr t deligreen': 'хризантема ветковая делигрин',
  'chr t dicha': 'хризантема ветковая дича',
  'chr t haydar': 'хризантема ветковая хайдар',
  'chr t kennedy': 'хризантема ветковая кеннеди',
  'chr t kennedy cream': 'хризантема ветковая кеннеди крем',
  'chr t lamira red': 'хризантема ветковая ламира ред',
  'chr t letsgo pink': 'хризантема ветковая летсгоу пинк',
  'chr t newton': 'хризантема ветковая ньютон',
  'chr t pina colada': 'хризантема ветковая пина колада',
  'chr t celebrate': 'хризантема ветковая селебрейт',
  'chr t rihanna': 'хризантема ветковая рианна',
  
  // === ХРИЗАНТЕМЫ САНТИНИ (Chr S) ===
  'chr s aaa lassie': 'хризантема сантини лассие',
  'chr s aaa purpet red': 'хризантема сантини пурпетта ред',
  'chr s country': 'хризантема сантини кантри',
  'chr s ferry': 'хризантема сантини ферри',
  'chr s gem': 'хризантема сантини микс',
  'chr s pompon gem bs': 'хризантема сантини микс помпон',
  'chr s aurinko': 'хризантема сантини ауринко',
  'chr s sun up': 'хризантема сантини сан ап',
  'chr s yin yang cream': 'хризантема сантини инь янь крем',
  
  // === ХРИЗАНТЕМЫ ОДНОГОЛОВЫЕ (Chr G) ===
  'chr g bigoudi purple': 'хризантема одноголовая бигоди пурпул',
  'chr g bigoudi red': 'хризантема одноголовая бигоди ред',
  'chr g gagarin': 'хризантема одноголовая гагарин',
  'chr g kalimba orange': 'хризантема одноголовая калимба орандж',
  'chr g pip festival': 'хризантема одноголовая пип фестиваль',
  'chrys bl magnum': 'хризантема одноголовая магнум',
  'chrysanthemum geplozen maracuja': 'хризантема одноголовая маракуйя',
  
  // === РОЗЫ (R) ===
  'r tr barbados': 'роза ветковая барбадос',
  'r tr cerise ov': 'роза ветковая церезе ов',
  'r tr creamy twister': 'роза ветковая креам твистер',
  'r tr fiction': 'роза ветковая фиктион',
  'r tr fireworks': 'роза ветковая файерворкс',
  'r tr gelato': 'роза ветковая джелато',
  'r tr gem in fust': 'роза ветковая микс',
  'r tr gra trendsetter': 'роза ветковая гра трендсеттер',
  'r tr julietta': 'роза ветковая джулиетта',
  'r tr kate-lynn pink': 'роза ветковая кети лейн пинк',
  'r tr kimberlina': 'роза ветковая кимберлина',
  'r tr lady margaret': 'роза ветковая леди маргарет',
  'r tr lychee': 'роза ветковая личи',
  'r tr magic pepita': 'роза ветковая мэджик пепита',
  'r tr majolika': 'роза ветковая мажолика',
  'r tr miss rosi': 'роза ветковая мисс рози',
  'r tr nova': 'роза ветковая нова',
  'r tr ocean song': 'роза ветковая ошен сонг',
  'r tr penny lane': 'роза ветковая пени лейн',
  'r tr sea love': 'роза ветковая си лав',
  'r tr selene': 'роза ветковая селена',
  'r tr sky blue': 'роза ветковая скай блу',
  'r tr swirls': 'роза ветковая свирлз',
  'r tr vanity gem': 'роза ветковая ванити микс',
  'r tr white elegance': 'роза ветковая вайт элеганс',
  'chrys sp newton': 'хризантема ветковая ньютон',
  
  // === ГЕРБЕРЫ / ГЕРМИНИ ===
  'ge gr pre-intenzz': 'гербера преинтенз',
  'ge gr scala diamond': 'гербера диамонд скала',
  'ge gr swanlake aquabox': 'гербера сванлайк',
  'ge gr white house diamond': 'гербера диамонд вайт хаус',
  'ge gr mix aquabox': 'гербера микс',
  'ge gr mothersday mix': 'гербера мазерсдэй микс пинк',
  'gerbera diamond': 'гербера даймонд',
  'germini diamond kirstey': 'гермини даймонд кирсти',
  'germini kirstey': 'гермини кирсти',
  
  // === ЛИЛИИ ===
  'li la brindisi': 'лилия ла бриндизи',
  'li la brindisi magnum': 'лилия ла бриндизи',
  'li la litouwen': 'лилия ла литоувен',
  'li la litouwen magnum': 'лилия ла литоувен',
  'li or du amistad': 'лилия ор ду амистад',
  'li or du diantha': 'лилия ор ду дианта',
  'li or du lot dream': 'лилия ор дабл лот дриим',
  'li ot zambesi': 'лилия от замбези',  // ИСПРАВЛЕНО: OT hybrid lily
  'lilium la brindisi magnum': 'лилия ла бриндизи',
  
  // === АНТУРИУМЫ ===
  'anth a candy': 'антуриум канди',
  'anth a eterno': 'антуриум етерно',
  'anth a grace': 'антуриум грайсе',
  'anth a lybra': 'антуриум лубра',
  'anth a marysia': 'антуриум марусия',
  'anth a midori imp': 'антуриум мидори имп',
  'anth a pistache': 'антуриум пистаче',
  'anth a red amor': 'антуриум ред амор',
  'anth a tropical': 'антуриум тропикал',
  'anthurium grand slam': 'антуриум гранд слэм',
  'anthurium red amor': 'антуриум ред амор',
  'anthurium zafira': 'антуриум зафира',
  
  // === ЦИМБИДИУМЫ ===
  'cymb t gem': 'цимбидиум микс',
  'cymbidium mix': 'цимбидиум микс',
  
  // === ФИСТАШКА ===
  'pistache': 'фисташка корт',
  'pistache select 50': 'фисташка корт',
  'pistache select l50': 'фисташка корт',
  'pistache 65 lang': 'фисташка лонг',
  
  // === ЭВКАЛИПТ ===
  'euca cinerea': 'эвкалипт цинерея',
  'euca cinerea bs': 'эвкалипт цинерея',
  'euca nicholii': 'эвкалипт николи',
  
  // === РУСКУС ===
  'ruscus hypophyllum': 'рускус',
  
  // === ПРОЧИЕ ПОПУЛЯРНЫЕ ===
  'chamelaucium my sweet 16': 'хамелациум май свит',
  'chame nieks pride': 'хамелациум никс прайд',
  'chame un kerryn': 'хамелациум керрун',
  'chame un ofir': 'хамелациум офир',
  
  'gyps pa my pink': 'гипсофила пинк',
  'gypso Milyen Wh': 'гипсофила мильен вайт',
  
  'iris apollo': 'ирис аполло',
  'iris blue magic': 'ирис блу магик',
  'iris casablanca': 'ирис касабланка',
  
  'paeonia angel cheeks': 'пион ангел чикс',
  'ranunculus amandine marshmallow': 'ранункулюс амандине маршмеллоу',
  
  'heliconia stricta tropical': 'геликония тропикал',  // ИСПРАВЛЕНО: НЕ стрелиция!
  
  'antir poto white': 'антирринум вайт',
  'antir poto ivory wh': 'антирринум пото ивори вайт',
  'antir avignon wh imp': 'антирхинум авигон вайт',
  
  'celosia mix': 'целозия микс',
  'asparagus setaceus': 'аспарагус сетакиус',
  'brass gem': 'брасика микс',
  'brass red crane': 'брассика ред кране',
  'brass white crane': 'брасика вайт кране',
};

// ============================================================================
// СЛОВА ДЛЯ УДАЛЕНИЯ ПРИ НОРМАЛИЗАЦИИ
// ============================================================================

export const JUNK_WORDS = [
  // Вес
  /\s*\d+\s*гр\b/gi,
  
  // Поставщики (но НЕ decorum - это иногда часть названия!)
  /\s+zentoo\b/gi,
  /\s+linflowers\b/gi,
  
  // Упаковка
  /\s+aquabox\s*\d*/gi,
  /\s+x\d+/gi,
  /\s*\(pink mix\)/gi,
  /\s*\(\d+шт\)/gi,
  /\s+per bunch\b/gi,
  
  // Мусор
  // УБРАНО: select — это semantic token для фисташки!
  // УБРАНО: stricta — это botanical epithet (Heliconia stricta)
  /\s+geplozen\b/gi,
  /\s+extra vacuum\b/gi,
  /\s+improved\b/gi,
  /\s+\d+\s*colour\b/gi,
  /\s+magnum la box\b/gi,
  /\s+la box\b/gi,
  /\s+in fust\b/gi,
  /\s+5\+$/gi,
  
  // ИСПРАВЛЕНО: whitelist для длин стеблей (безопаснее чем \d{2,3})
  // Убираем только стандартные длины: 40, 50, 60, 70, 75, 80, 90, 100, 120
  /\s+(40|50|55|60|65|70|75|80|85|90|95|100|105|110|120)$/,
];

// ============================================================================
// СПЕЦИАЛЬНЫЕ ЗАМЕНЫ
// ============================================================================

/**
 * СТАНДАРТ ТРАНСЛИТЕРАЦИИ: florist-market translit
 * 
 * Используем market-standard терминологию (НЕ переводим на русский):
 * - пинк (NOT розовый)
 * - вайт (NOT белый)  
 * - ред (NOT красный)
 * - микс (NOT смесь)
 * - блу (NOT синий)
 * 
 * Это стандарт флористического рынка СНГ.
 */
export const SPECIAL_REPLACEMENTS: Record<string, string> = {
  // ТОЛЬКО токены и сокращения, НЕ цвета в названиях сортов!
  // 'red' НЕ заменяем — это часть cultivar names
  // 'white' НЕ заменяем — это часть cultivar names
  // 'pink' НЕ заменяем — это часть cultivar names
  
  // Gem = mix для орхидей и хризантем (TODO: сделать контекстным!)
  'gem': 'микс',
  
  // Lang = лонг (для фисташки)
  'lang': 'лонг',
  
  // Сокращения поставщиков
  'wh': 'вайт',
  'imp': 'имп',
  'ov': 'ов',
  'bs': '',  // убрать
  'koot': '', // убрать
};

// ============================================================================
// КАНОНИЗАЦИЯ (критично для корректного exact match!)
// ============================================================================

/**
 * Канонизация строки для консистентного сравнения
 * Применяется И к входным данным И к ключам словаря
 * 
 * КРИТИЧНО: Unicode normalization для Excel из Голландии
 */
function canonicalize(s: string): string {
  return s
    .normalize('NFKD')                // Unicode normalization (é → e)
    .replace(/[\u0300-\u036f]/g, '')  // Убираем диакритики
    .replace(/['`´]/g, '')            // O'Hara → OHara
    .replace(/[&+]/g, ' ')            // White&Pink → White Pink
    .replace(/[()]/g, ' ')            // Julietta (cream) → Julietta cream
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')          // kate-lynn → kate lynn
    .replace(/[.,;]+/g, ' ')          // chr.t → chr t
    .replace(/\s+/g, ' ')             // множественные пробелы
    .trim();
}

// Канонизированный словарь (строится один раз при загрузке модуля)
const CANONICAL_TRANSLATIONS: Record<string, string> = {};

for (const [key, value] of Object.entries(VARIETY_TRANSLATIONS)) {
  CANONICAL_TRANSLATIONS[canonicalize(key)] = value;
}

// Канонизированные префиксы (для безопасного сравнения)
const CANONICAL_PREFIXES = Object.entries(SUPPLIER_PREFIXES)
  .map(([key, value]) => [canonicalize(key), value] as const)
  .sort((a, b) => b[0].length - a[0].length); // longest first

// ============================================================================
// ТИПЫ
// ============================================================================

export type NormalizationResult = {
  normalized: string;
  confidence: number;
  matchedBy: 'exact' | 'exact_after_cleanup' | 'prefix' | 'fallback' | 'ai' | 'ai_assisted';
  warnings?: string[];
};

// ============================================================================
// ФУНКЦИЯ НОРМАЛИЗАЦИИ (ИСПРАВЛЕННАЯ)
// ============================================================================

/**
 * Нормализует название товара от поставщика
 * ИСПРАВЛЕНО: двойной exact match + confidence scoring
 * 
 * @param raw - исходное название из накладной
 * @returns объект с нормализованным названием и метаданными
 */
export function normalizeSupplierName(raw: string): NormalizationResult {
  // Канонизация входных данных (включая сепараторы и пунктуацию)
  const canonical = canonicalize(raw);
  
  // ШАГ 1: Попытка exact match с канонизированным словарём
  if (CANONICAL_TRANSLATIONS[canonical]) {
    return {
      normalized: CANONICAL_TRANSLATIONS[canonical],
      confidence: 1.0,
      matchedBy: 'exact'
    };
  }
  
  // ШАГ 2: Cleanup мусора
  let cleaned = canonical;
  
  for (const pattern of JUNK_WORDS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // ШАГ 3: Попытка exact match ПОСЛЕ cleanup
  if (CANONICAL_TRANSLATIONS[cleaned]) {
    return {
      normalized: CANONICAL_TRANSLATIONS[cleaned],
      confidence: 0.95,
      matchedBy: 'exact_after_cleanup'
    };
  }
  
  // ШАГ 4: Prefix replacement (только если не нашли exact)
  let result = cleaned;
  let prefixMatched = false;
  let remainderTokens = 0;
  
  for (const [prefix, replacement] of CANONICAL_PREFIXES) {
    // Поддержка одиночных слов (без пробела после)
    if (result === prefix || result.startsWith(prefix + ' ')) {
      // ИСПРАВЛЕНО: безопасная замена с сохранением пробела
      const remainder = result.slice(prefix.length).trim();
      result = remainder ? `${replacement} ${remainder}` : replacement;
      
      // Проверяем meaningful tokens в remainder (защита от мусорных fallback)
      remainderTokens = remainder.split(' ').filter(t => t.length >= 3).length;
      
      prefixMatched = true;
      break;
    }
  }
  
  // ШАГ 5: Специальные замены
  // TODO: Сделать контекстными! gem → микс только для 'цимбидиум' и 'хризантема'
  // РИСК: глобальная замена может сломать cultivar names типа "Gemstone"
  for (const [find, replace] of Object.entries(SPECIAL_REPLACEMENTS)) {
    // ИСПРАВЛЕНО: пустые replacements тоже применяем (удаляют токен)
    result = result.replace(new RegExp(`\\b${find}\\b`, 'gi'), replace);
  }
  
  // ШАГ 6: Финальная чистка пробелов
  result = result.replace(/\s+/g, ' ').trim();
  
  // ШАГ 7: Защита от over-normalization и расчёт confidence
  const meaningfulTokens = result.split(' ').filter(t => t.length > 1).length;
  let finalConfidence = 0.7; // базовый fallback
  const warnings: string[] = [];
  
  if (prefixMatched) {
    // Prefix matched: confidence зависит от качества remainder
    if (remainderTokens === 0) {
      finalConfidence = 0.75; // только род, нет сорта
    } else if (remainderTokens === 1) {
      finalConfidence = 0.82; // род + 1 токен
    } else {
      finalConfidence = 0.88; // род + полное название
    }
  }
  
  // Защита от over-normalization
  if (meaningfulTokens <= 1) {
    finalConfidence = 0.4;
    warnings.push('too_short_after_cleanup');
  }
  
  // Unknown product detection
  if (!prefixMatched && meaningfulTokens <= 2) {
    finalConfidence = Math.min(finalConfidence, 0.5);
    warnings.push('unknown_product');
  }
  
  return {
    normalized: result,
    confidence: finalConfidence,
    matchedBy: prefixMatched ? 'prefix' : 'fallback',
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Простая обёртка для обратной совместимости
 * @param raw - исходное название
 * @returns только нормализованное название (без метаданных)
 */
export function normalizeSupplierNameSimple(raw: string): string {
  return normalizeSupplierName(raw).normalized;
}

// ============================================================================
// ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
// ============================================================================

/*
// Канонизация работает для разных форматов
normalizeSupplierName("R TR Kate-Lynn Pink");
// → { normalized: "роза спрей кети лейн пинк", confidence: 1.0, matchedBy: "exact" }

normalizeSupplierName("R TR Kate_Lynn Pink");
// → { normalized: "роза спрей кети лейн пинк", confidence: 1.0, matchedBy: "exact" }

normalizeSupplierName("Chr.T.Commander");
// → { normalized: "хризантема ветковая коммандер пинк", confidence: 1.0, matchedBy: "exact" }

// Cleanup + exact match
normalizeSupplierName("Ge Gr Mix Aquabox 96");
// → { normalized: "гербера микс", confidence: 0.95, matchedBy: "exact_after_cleanup" }

// Простой API (без метаданных)
normalizeSupplierNameSimple("Pistache 65 Lang");
// → "фисташка лонг"
*/
