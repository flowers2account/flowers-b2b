// Детерминированный скоринг кандидата КТРУ по набору сигналов.
// Веса подобраны так, чтобы семантическое совпадение (A,B) доминировало,
// а КПВЭД и популярность (C,D) только доуточняли порядок.

import type { KtruIndexRow, KtruSignals } from './types.ts'
import { lemmaSet, damerauLevenshtein } from './normalize.ts'
import type { QueryToken } from './normalize.ts'
import {
  SYNONYM_GROUPS,
  INCOMPATIBLE,
  DECOR_MATERIALS,
  CONCEPT_KPVED,
  ATTRIBUTE_TERMS,
} from './synonyms.ts'

export interface PreparedRow {
  row: KtruIndexRow
  /** леммы русского названия (для точности имени) */
  nameRuLemmas: Set<string>
  /** леммы названия ru+kz (для сигналов совпадения) */
  nameLemmas: Set<string>
  /** леммы описаний: пример из плана + официальное RefEnstru (ru+kz) + aliases */
  descLemmas: Set<string>
  /** леммы курируемых синонимов позиции */
  aliasLemmas: Set<string>
  allLemmas: Set<string>
}

export function prepareRow(row: KtruIndexRow): PreparedRow {
  const nameRuLemmas = lemmaSet(row.nameRu)
  const nameLemmas = new Set<string>([...nameRuLemmas, ...lemmaSet(row.nameKz)])
  const descLemmas = new Set<string>([
    ...lemmaSet(row.descExample),
    ...lemmaSet(row.descRu ?? ''),
    ...lemmaSet(row.descKz ?? ''),
  ])
  const aliasLemmas = new Set<string>()
  for (const a of row.aliases ?? []) for (const l of lemmaSet(a)) aliasLemmas.add(l)
  return {
    row,
    nameRuLemmas,
    nameLemmas,
    descLemmas,
    aliasLemmas,
    allLemmas: new Set<string>([...nameLemmas, ...descLemmas, ...aliasLemmas]),
  }
}

// Лемма → набор синонимов-лемм (симметрично по группам synonyms.ts).
const SYN_INDEX: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>()
  for (const members of Object.values(SYNONYM_GROUPS)) {
    const lemmas = members.map((x) => baseLemma(x))
    for (const l of lemmas) {
      if (!m.has(l)) m.set(l, new Set())
      for (const other of lemmas) if (other !== l) m.get(l)!.add(other)
    }
  }
  return m
})()

// Лёгкая обёртка, чтобы не тянуть циклический импорт normalize→synonyms→scoring.
function baseLemma(w: string): string {
  const t = w.toLowerCase().replace(/ё/g, 'е')
  return [...lemmaSet(t)][0] ?? t
}

// CONCEPT_KPVED с ключами, приведёнными к той же лемме, что и токены запроса.
const CONCEPT_KPVED_L: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(CONCEPT_KPVED)) m[baseLemma(k)] = v
  return m
})()

/** Синонимы-леммы для леммы токена (для этапа retrieval вне scoreRow). */
export function synonymsOf(lemma: string): Set<string> | undefined {
  return SYN_INDEX.get(lemma)
}

/** Классы КПВЭД, к которым относится концепт леммы (с учётом синонимов). */
export function conceptClassesOf(lemma: string): string[] {
  const out = new Set<string>()
  if (CONCEPT_KPVED_L[lemma]) for (const c of CONCEPT_KPVED_L[lemma]) out.add(c)
  const syns = SYN_INDEX.get(lemma)
  if (syns) for (const s of syns) if (CONCEPT_KPVED_L[s]) for (const c of CONCEPT_KPVED_L[s]) out.add(c)
  return [...out]
}

// Нечёткое совпадение с наименованием: только «длинные» токены, порог зависит
// от длины (защита от ложных срабатываний на коротких словах).
const FUZZY_MIN_LEN = 6
function fuzzyNameHit(lemma: string, nameRuLemmas: Set<string>): string | null {
  if (lemma.length < FUZZY_MIN_LEN) return null
  const budget = lemma.length >= 9 ? 2 : 1
  for (const nl of nameRuLemmas) {
    if (nl.length < FUZZY_MIN_LEN) continue
    if (Math.abs(nl.length - lemma.length) > budget) continue
    if (damerauLevenshtein(lemma, nl) <= budget) return nl
  }
  return null
}

const WEIGHTS = {
  name: 0.6,
  synonym: 0.5, // синонимы курируются вручную → доверие высокое
  desc: 0.2, // уточнение нашлось в официальном описании КТРУ
  fuzzy: 0.42, // «почти» совпадение имени (опечатка) — чуть слабее точного
  kpved: 0.14,
  popularity: 0.08,
  context: 0.08,
  fullCoverage: 0.15, // бонус, если ВСЕ значимые слова запроса нашли соответствие
  namePrecision: 0.22, // штраф: в названии КТРУ есть значимые слова вне запроса
  negative: 0.5,
}

/**
 * Этап 1 конвейера — candidate retrieval. Широкий, дешёвый матчинг: как минимум
 * один content-токен запроса цепляется за наименование / синоним / официальное
 * описание / alias / нечёткое имя, либо концепт токена соответствует классу
 * КПВЭД записи. Возвращает список сработавших каналов (пусто ⇒ не кандидат).
 */
export function retrievalSignals(pr: PreparedRow, tokens: QueryToken[]): string[] {
  const content = tokens.filter((t) => !t.isAttr)
  const via = new Set<string>()
  for (const t of content) {
    if (pr.nameLemmas.has(t.lemma)) {
      via.add('name')
    } else {
      const syns = SYN_INDEX.get(t.lemma)
      if (syns) {
        for (const s of syns) {
          if (pr.nameLemmas.has(s)) {
            via.add('synonym')
            break
          }
        }
      }
    }
    if (pr.descLemmas.has(t.lemma) || pr.aliasLemmas.has(t.lemma)) via.add('desc')
    if (!via.has('name') && fuzzyNameHit(t.lemma, pr.nameRuLemmas)) via.add('fuzzy')
  }
  if (!via.size) {
    for (const t of content) {
      if (conceptClassesOf(t.lemma).includes(pr.row.kpvedClass)) {
        via.add('kpved')
        break
      }
    }
  }
  return [...via]
}

// Если ГЛАВНОЕ слово запроса (первый content-токен) не совпало ни по названию,
// ни по синониму — кандидат отвечает лишь на уточнение → сильно понижаем.
const NO_HEAD_MATCH_FACTOR = 0.5
// Жёсткий потолок для кандидатов, отсечённых спец-гардом (декор vs живые цветы).
const HARD_REJECT_CAP = 0.04

// Вес токена по позиции: в запросах вида «X для Y» голова X важнее уточнения Y.
const HEAD_WEIGHT = 1.0
const TAIL_WEIGHT = 0.6
const posWeight = (i: number): number => (i === 0 ? HEAD_WEIGHT : TAIL_WEIGHT)

export interface ScoreInput {
  tokens: QueryToken[]
  maxPlanCount: number
}

export interface ScoredRow {
  code: string
  nameRu: string
  score: number
  reasons: string[]
  signals: KtruSignals
  planCount: number
}

export function scoreRow(pr: PreparedRow, input: ScoreInput): ScoredRow {
  const { tokens, maxPlanCount } = input
  const reasons: string[] = []
  const content = tokens.filter((t) => !t.isAttr)
  const attrs = tokens.filter((t) => t.isAttr)
  const totalWeight = content.length
    ? content.reduce((s, _t, i) => s + posWeight(i), 0)
    : 1

  // ---- Signal A: прямое совпадение с наименованием КТРУ ----
  const nameHits = content.filter((t) => pr.nameLemmas.has(t.lemma))
  let aWeight = 0
  content.forEach((t, i) => {
    if (pr.nameLemmas.has(t.lemma)) aWeight += posWeight(i)
  })
  const aRaw = aWeight / totalWeight
  if (nameHits.length) {
    reasons.push(
      `совпадение по названию КТРУ: ${nameHits.map((t) => `«${t.raw}»`).join(', ')}`,
    )
  }

  // ---- Signal B: совпадение через синонимы ----
  let synHits = 0
  let bWeight = 0
  const synSeen = new Set<string>()
  content.forEach((t, i) => {
    if (pr.nameLemmas.has(t.lemma)) return // уже учтено в A
    const syns = SYN_INDEX.get(t.lemma)
    if (!syns) return
    for (const s of syns) {
      if (pr.nameLemmas.has(s) && !synSeen.has(t.lemma)) {
        synHits++
        bWeight += posWeight(i)
        synSeen.add(t.lemma)
        reasons.push(`совпадение по синониму «${t.raw} → ${s}»`)
        break
      }
    }
  })
  const bRaw = bWeight / totalWeight

  // ---- Signal G: уточняющее слово запроса нашлось в ОФИЦИАЛЬНОМ описании КТРУ ----
  // Работает только для слов, не совпавших по имени/синониму — это доуточнение
  // («перчатки нитриловые» → поднять позиции, у которых в descRu есть «нитрил…»).
  let descHits = 0
  let gWeight = 0
  content.forEach((t, i) => {
    if (pr.nameLemmas.has(t.lemma) || synSeen.has(t.lemma)) return
    if (pr.descLemmas.has(t.lemma) || pr.aliasLemmas.has(t.lemma)) {
      descHits++
      gWeight += posWeight(i)
      reasons.push(`уточнение «${t.raw}» есть в описании КТРУ`)
    }
  })
  const gRaw = gWeight / totalWeight

  // ---- Signal H: нечёткое совпадение с наименованием (опечатка) ----
  let fuzzyHits = 0
  let hWeight = 0
  content.forEach((t, i) => {
    if (
      pr.nameLemmas.has(t.lemma) ||
      synSeen.has(t.lemma) ||
      pr.descLemmas.has(t.lemma)
    ) {
      return
    }
    const near = fuzzyNameHit(t.lemma, pr.nameRuLemmas)
    if (near) {
      fuzzyHits++
      hWeight += posWeight(i)
      reasons.push(`похоже на «${near}» в названии КТРУ (возможна опечатка: «${t.raw}»)`)
    }
  })
  const hRaw = hWeight / totalWeight

  // ---- Signal C: класс КПВЭД соответствует концепту запроса ----
  let cRaw = 0
  for (const t of content) {
    const concepts = new Set<string>()
    if (CONCEPT_KPVED_L[t.lemma]) concepts.add(t.lemma)
    const syns = SYN_INDEX.get(t.lemma)
    if (syns) for (const s of syns) if (CONCEPT_KPVED_L[s]) concepts.add(s)
    for (const c of concepts) {
      if (CONCEPT_KPVED_L[c].includes(pr.row.kpvedClass)) {
        cRaw = 1
        reasons.push(`класс КПВЭД ${pr.row.kpvedClass} относится к «${c}»`)
        break
      }
    }
    if (cRaw) break
  }

  // ---- Signal D: популярность (частота в планах) ----
  const dRaw =
    maxPlanCount > 0
      ? Math.log10((pr.row.planCount || 0) + 1) / Math.log10(maxPlanCount + 1)
      : 0
  if (pr.row.planCount >= 1000) {
    reasons.push(`часто встречается в закупках (${pr.row.planCount} планов)`)
  }

  // ---- Signal E: совпадение характеристик / уточняющих слов ----
  let ctxHits = 0
  for (const t of attrs) {
    if (pr.allLemmas.has(t.lemma)) {
      ctxHits++
      reasons.push(`совпадение характеристики «${t.raw}»`)
    }
  }
  // когезия: несколько content-слов запроса нашли соответствие (имя/синоним/описание/опечатка)
  const matchedContent = nameHits.length + synHits + descHits + fuzzyHits
  const cohesion = matchedContent >= 2 ? 0.5 : 0
  const eRaw = Math.min(1, ctxHits / Math.max(attrs.length, 1) + cohesion)

  // полное покрытие: все значимые слова запроса нашли соответствие
  const fullCoverage =
    content.length > 0 && matchedContent >= content.length ? 1 : 0
  if (fullCoverage) reasons.push('все ключевые слова запроса совпали')

  // Точность имени КТРУ: какая доля значимых слов В НАЗВАНИИ записи покрыта запросом.
  // «Цветы» для запроса «цветы» = 1.0; «Семена цветов однолетние» = 1/3 → ниже.
  const rowNameContent = [...pr.nameRuLemmas].filter(
    (l) => l.length > 2 && !ATTRIBUTE_TERMS.has(l),
  )
  let nameCovered = 0
  const qLemmas = new Set<string>()
  for (const t of content) {
    qLemmas.add(t.lemma)
    const syns = SYN_INDEX.get(t.lemma)
    if (syns) for (const s of syns) qLemmas.add(s)
  }
  for (const l of rowNameContent) if (qLemmas.has(l)) nameCovered++
  const namePrecision =
    rowNameContent.length > 0 ? nameCovered / rowNameContent.length : 1

  // ---- Signal F: конфликт характеристик ----
  let fRaw = 0
  for (const t of tokens) {
    for (const [x, y] of INCOMPATIBLE) {
      if (t.lemma === x && pr.allLemmas.has(y)) {
        fRaw = Math.max(fRaw, 1)
        reasons.push(`конфликт характеристики: запрос «${t.raw}», КТРУ содержит «${y}»`)
      }
      if (t.lemma === y && pr.allLemmas.has(x)) {
        fRaw = Math.max(fRaw, 1)
        reasons.push(`конфликт характеристики: запрос «${t.raw}», КТРУ содержит «${x}»`)
      }
    }
  }
  // спец-гард «Цветы»: живые/срезанные цветы vs декоративные изделия из керамики/фарфора
  const wantsFlower = content.some((t) => t.lemma === 'цветок' || t.lemma === 'растение')
  const rowIsFlowerName = pr.nameLemmas.has('цветок')
  const rowIsDecor =
    [...pr.allLemmas].some((l) => DECOR_MATERIALS.has(l)) ||
    /керамик|фарфор|фаянс|бетон|гипс|стекл/i.test(
      `${pr.row.nameRu} ${pr.row.descExample}`,
    )
  const queryAllowsDecor = tokens.some(
    (t) => t.lemma === 'декоративный' || t.lemma === 'керамический' || t.lemma === 'фарфоровый',
  )
  const decorRejected =
    wantsFlower && rowIsFlowerName && rowIsDecor && !queryAllowsDecor
  if (decorRejected) {
    fRaw = Math.max(fRaw, 1)
    reasons.push('вероятно декоративное изделие (керамика/фарфор), а не живые/срезанные цветы')
  }

  // Совпала ли ГОЛОВА запроса (первый значимый токен) — по названию, синониму
  // или нечёткому имени (опечатка). Совпадение только по описанию головой НЕ
  // считается — это по-прежнему «ответ лишь на уточнение».
  const headMatched =
    content.length === 0 ||
    pr.nameLemmas.has(content[0].lemma) ||
    synSeen.has(content[0].lemma) ||
    (!pr.descLemmas.has(content[0].lemma) &&
      fuzzyNameHit(content[0].lemma, pr.nameRuLemmas) !== null)
  if (!headMatched) {
    reasons.push('главное слово запроса не совпало — только уточнение')
  }

  // Официальное описание КТРУ — в причины всегда, когда оно есть: это то, чем
  // кандидаты-однофамильцы («Перчатки» × N) отличаются друг от друга в UI.
  if (pr.row.descRu && pr.row.descRu.trim()) {
    reasons.push(`описание КТРУ: «${pr.row.descRu.trim()}»`)
  }

  const signals: KtruSignals = {
    name: round(aRaw),
    synonym: round(bRaw),
    kpved: round(cRaw),
    popularity: round(dRaw),
    context: round(eRaw),
    negative: round(fRaw),
    desc: round(gRaw),
    fuzzy: round(hRaw),
  }

  let score = clamp(
    WEIGHTS.name * aRaw +
      WEIGHTS.synonym * bRaw +
      WEIGHTS.desc * gRaw +
      WEIGHTS.fuzzy * hRaw +
      WEIGHTS.kpved * cRaw +
      WEIGHTS.popularity * dRaw +
      WEIGHTS.context * eRaw +
      WEIGHTS.fullCoverage * fullCoverage -
      WEIGHTS.negative * fRaw -
      WEIGHTS.namePrecision * (1 - namePrecision),
    0,
    1,
  )
  if (namePrecision < 1 && (aRaw > 0 || bRaw > 0)) {
    reasons.push(
      `в названии КТРУ есть уточнения вне запроса (точность имени ${Math.round(namePrecision * 100)}%)`,
    )
  }
  if (!headMatched) score *= NO_HEAD_MATCH_FACTOR
  if (decorRejected) score = Math.min(score, HARD_REJECT_CAP)

  return {
    code: pr.row.code,
    nameRu: pr.row.nameRu,
    score: round(score),
    reasons,
    signals,
    planCount: pr.row.planCount,
    // A/B нужны вызывающему для фильтра «в выдачу только семантические совпадения»
    // (передаём через signals.name / signals.synonym)
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
function round(x: number): number {
  return Math.round(x * 1000) / 1000
}
