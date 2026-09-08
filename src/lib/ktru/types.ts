// Типы для умного поиска КТРУ/ЕНС ТРУ (v1). Без AI/embeddings — детерминированный
// лексический поиск по локальному индексу data/enstru/enstru_index.json.

/** Одна запись локального индекса КТРУ (см. data/enstru/enstru_index.json). */
export interface KtruIndexRow {
  /** Код ЕНС ТРУ, формат NNNNNN.NNN.NNNNNN */
  code: string
  /** Наименование КТРУ на русском (как отдаёт API, обычно 1–2 слова) */
  nameRu: string
  /** Наименование на казахском */
  nameKz: string
  /** Пример краткой характеристики из позиции плана — НЕ атрибут КТРУ, справочно */
  descExample: string
  /** Официальное описание КТРУ из справочника RefEnstru (ru) — отличает однофамильцев */
  descRu?: string
  /** Официальное описание КТРУ из справочника RefEnstru (kz) */
  descKz?: string
  /** Курируемые синонимы/разговорные формулировки конкретно этой позиции */
  aliases?: string[]
  /** Первые 6 цифр кода = класс СКП ВЭД (КПВЭД) */
  kpvedClass: string
  /** Цифры 8–10 кода = группа */
  kpvedGroup: string
  /** Последние 6 цифр = позиция */
  kpvedPosition: string
  /** Наблюдаемые единицы измерения (коды ref_units) */
  units: string[]
  /** Вид предмета: 1 товар / 2 работа / 3 услуга */
  subjectTypes: number[]
  /** По каким поисковым терминам код был намыт из планов (слабый хинт) */
  seenVia: string[]
  /** Годы, в которых код встречается в планах */
  years: number[]
  /** Сколько всего позиций планов с этим кодом (популярность) */
  planCount: number
  /** Источник данных */
  source: string
}

/** Вклад каждого сигнала в итоговый score (для прозрачности ранжирования). */
export interface KtruSignals {
  /** A — совпадение токенов запроса с наименованием КТРУ */
  name: number
  /** B — совпадение через синонимы */
  synonym: number
  /** C — соответствие класса КПВЭД концепту запроса */
  kpved: number
  /** D — популярность (частота в планах) */
  popularity: number
  /** E — совпадение характеристик/уточняющих слов */
  context: number
  /** F — штраф за конфликт характеристик (пластиковый vs керамический и т.п.) */
  negative: number
  /** G — уточняющие слова запроса найдены в официальном описании КТРУ (descRu/descKz) */
  desc: number
  /** H — нечёткое совпадение с наименованием (опечатки) */
  fuzzy: number
}

export interface KtruSearchResult {
  code: string
  nameRu: string
  /** Официальное описание КТРУ (RefEnstru) — для UI: чем кандидаты отличаются */
  descRu?: string
  /** Итоговая оценка 0..1, детерминированная */
  score: number
  /** Как кандидат попал в выдачу: name | synonym | desc | fuzzy | kpved */
  retrievedVia: string[]
  /** Человекочитаемые причины, почему запись найдена и как оценена */
  reasons: string[]
  signals: KtruSignals
}

export interface SearchOptions {
  /** Сколько результатов вернуть (по умолчанию 10) */
  limit?: number
  /** Минимальный score для попадания в выдачу (по умолчанию 0.01) */
  minScore?: number
  /** Явно подставить индекс (для тестов). По умолчанию — загрузка из файла */
  index?: KtruIndexRow[]
}
