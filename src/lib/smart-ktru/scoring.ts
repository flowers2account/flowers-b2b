// Детерминированный расчёт Индекса участия и вердикта. LLM здесь НЕ участвует.
// 6 факторов → взвешенная сумма → participationIndex → verdict по правилам → pros/cons/risks.

import type {
  MatchResult,
  Economics,
  ExtractedSpecification,
  ScoreFactor,
  ParticipationScore,
  Verdict,
  Confidence,
  FactorKey,
} from './types.ts'

export interface ScoringContext {
  match: MatchResult | null
  economics: Economics
  spec: ExtractedSpecification | null
  deadlineDaysLeft: number | null
  deadlinePassed: boolean
  tradeMethodId: number | null
  lotAmount: number | null
  regionKnown: boolean
  regionInZone: boolean | null
  /** история: сколько разных поставщиков выигрывали этот КТРУ (если считали) */
  historicalDistinctWinners?: number | null
  historicalSampleSize?: number | null
  /** целевая маржа для вердикта (доля), по умолчанию 0.10 */
  targetMargin?: number
}

const WEIGHTS: Record<FactorKey, number> = {
  compliance: 0.3,
  margin: 0.25,
  competition: 0.1,
  specComplexity: 0.1,
  deadline: 0.15,
  logistics: 0.1,
}

const LABELS: Record<FactorKey, string> = {
  compliance: 'Соответствие',
  margin: 'Маржа',
  competition: 'Конкуренция',
  specComplexity: 'Сложность ТС',
  deadline: 'Срок',
  logistics: 'Логистика',
}

const VERDICT_LABEL: Record<Verdict, string> = {
  recommend: 'Рекомендуем',
  consider: 'Рассмотреть',
  unlikely: 'Скорее нет',
  unsuitable: 'Не подходит',
}

function factor(
  key: FactorKey,
  score: number | null,
  reason: string,
  confidence: Confidence,
  source: string,
): ScoreFactor {
  return { key, label: LABELS[key], score, reason, confidence, source, weight: WEIGHTS[key] }
}

// ─────────────────── отдельные факторы ───────────────────

function fCompliance(m: MatchResult | null): ScoreFactor {
  if (!m || m.total === 0) {
    return factor('compliance', null, 'ТС не разобрана — сопоставить требования не с чем', 'none',
      'AI-разбор ТС + характеристики товара')
  }
  const comparable = m.matched + m.mismatched
  let score = comparable > 0 ? Math.round((m.matched / comparable) * 100) : 50
  if (m.criticalMismatches > 0) score = Math.min(score, 30)
  const reason =
    m.criticalMismatches > 0
      ? `${m.matched} из ${comparable} требований, но ${m.criticalMismatches} критическое несоответствие`
      : `${m.matched} из ${comparable} требований выполнены${m.pending ? `, ${m.pending} требуют проверки` : ''}`
  return factor('compliance', score, reason,
    m.pending > comparable ? 'medium' : 'high',
    'AI-разбор ТС + характеристики товара')
}

function fMargin(e: Economics): ScoreFactor {
  if (e.marginRatio == null) {
    const why = e.warnings.find((w) => /себестоимость/i.test(w)) || 'недостаточно данных для расчёта'
    return factor('margin', null, why, 'none', 'экономика лота')
  }
  const p = e.marginRatio
  let score: number
  if (p < 0) score = Math.max(0, Math.round(15 + p * 100))
  else if (p < 0.1) score = Math.round(30 + (p / 0.1) * 25)
  else if (p < 0.25) score = Math.round(55 + ((p - 0.1) / 0.15) * 25)
  else score = Math.min(100, Math.round(80 + ((p - 0.25) / 0.25) * 20))
  const pct = (p * 100).toFixed(1)
  const reason =
    p < 0
      ? `Потенциальная маржа отрицательная (${pct}%)`
      : `Потенциальная маржа ~${pct}%${e.usesHistoricalPrice ? ' (по исторической цене)' : ' (по потолку цены)'}`
  return factor('margin', score, reason, e.usesHistoricalPrice ? 'high' : 'medium',
    e.usesHistoricalPrice ? 'исторические контракты + мой товар' : 'потолок цены + мой товар')
}

function fCompetition(ctx: ScoringContext): ScoreFactor {
  const parts: string[] = []
  let score = 50
  let conf: Confidence = 'low'

  // способ закупки
  if (ctx.tradeMethodId === 3 || ctx.tradeMethodId === 126) {
    parts.push('запрос ценовых предложений — низкий барьер входа')
    score += 5
  } else if (ctx.tradeMethodId === 6) {
    parts.push('из одного источника — участие только по приглашению')
    score = 20
    conf = 'medium'
  } else if (ctx.tradeMethodId != null) {
    parts.push('конкурс/аукцион — выше требования и конкуренция')
    score -= 10
  }
  // размер лота
  if (ctx.lotAmount != null && ctx.lotAmount < 300_000) {
    parts.push('мелкий лот — обычно меньше серьёзных участников')
    score += 8
  } else if (ctx.lotAmount != null && ctx.lotAmount > 5_000_000) {
    parts.push('крупный лот — привлекает больше участников')
    score -= 8
  }
  // история
  if (ctx.historicalSampleSize && ctx.historicalSampleSize >= 3) {
    conf = 'medium'
    const w = ctx.historicalDistinctWinners ?? 0
    if (w <= 1) {
      parts.push('за 2 года по этому КТРУ у заказчика выигрывал один поставщик — возможен «свой»')
      score -= 15
    } else {
      parts.push(`за 2 года выигрывали ${w} разных поставщика`)
      score += 5
    }
  } else {
    parts.push('исторических данных по участникам мало')
  }

  score = Math.max(5, Math.min(95, score))
  const noSignal = ctx.tradeMethodId == null && !(ctx.historicalSampleSize && ctx.historicalSampleSize >= 3)
  if (noSignal) {
    return factor('competition', null, 'Недостаточно данных: участники и их цены в API недоступны',
      'none', 'способ закупки + история контрактов (косвенно)')
  }
  return factor('competition', score, parts.join('; '), conf,
    'КОСВЕННО: способ закупки, размер лота, история контрактов (участники в API недоступны)')
}

function fSpecComplexity(spec: ExtractedSpecification | null): ScoreFactor {
  if (!spec) {
    return factor('specComplexity', null, 'ТС не приложена или не разобрана', 'none', 'AI-разбор ТС')
  }
  if (!spec.meta.templateRecognized && spec.characteristics.length === 0) {
    return factor('specComplexity', 25, 'ТС не распозналась автоматически — разбирать вручную', 'low',
      'AI-разбор ТС')
  }
  const reqs = spec.characteristics.length
  const hardNum = spec.characteristics.filter((c) =>
    ['min', 'max', 'range', 'exact'].includes(c.requirementType),
  ).length
  const docs = (spec.documents?.length ?? 0) +
    spec.characteristics.filter((c) => c.requirementType === 'document').length
  let score = 100
  score -= Math.min(40, reqs * 4)
  score -= Math.min(20, hardNum * 3)
  score -= Math.min(30, docs * 15)
  score = Math.max(10, Math.round(score))
  const reason =
    `${reqs} требований, ${hardNum} числовых, ${docs ? docs + ' требований к документам' : 'документы не требуются'}` +
    (score >= 70 ? ' — простая' : score >= 45 ? ' — средняя' : ' — сложная')
  return factor('specComplexity', score, reason, 'high', 'AI-разбор ТС')
}

function fDeadline(daysLeft: number | null, passed: boolean): ScoreFactor {
  if (passed) {
    return factor('deadline', 10, 'Срок подачи по данным реестра уже истёк', 'high',
      'endDate лота (API) vs текущая дата')
  }
  if (daysLeft == null) {
    return factor('deadline', null, 'Срок окончания приёма заявок неизвестен', 'none', 'endDate лота')
  }
  let score: number
  if (daysLeft > 14) score = 90
  else if (daysLeft > 7) score = 72
  else if (daysLeft > 3) score = 52
  else if (daysLeft >= 1) score = 30
  else score = 12
  return factor('deadline', score, `Осталось ${daysLeft} дн.${daysLeft <= 3 ? ' — впритык' : ''}`, 'high',
    'endDate лота (API) vs текущая дата')
}

function fLogistics(ctx: ScoringContext): ScoreFactor {
  if (!ctx.regionKnown) {
    return factor('logistics', 45, 'Регион поставки не указан заказчиком — оценить логистику нельзя',
      'low', 'plnPointKatoList лота (пусто у 40–70% лотов)')
  }
  if (ctx.regionInZone === true) {
    return factor('logistics', 80, 'Регион поставки в вашей зоне доставки', 'medium',
      'КАТО лота ∩ ваши зоны')
  }
  if (ctx.regionInZone === false) {
    return factor('logistics', 30, 'Регион поставки вне вашей зоны доставки', 'medium',
      'КАТО лота ∩ ваши зоны')
  }
  return factor('logistics', 55, 'Регион известен, зоны доставки не настроены', 'low', 'КАТО лота')
}

// ─────────────────── итог ───────────────────

export function computeParticipationScore(ctx: ScoringContext): ParticipationScore {
  const factors = [
    fCompliance(ctx.match),
    fMargin(ctx.economics),
    fCompetition(ctx),
    fSpecComplexity(ctx.spec),
    fDeadline(ctx.deadlineDaysLeft, ctx.deadlinePassed),
    fLogistics(ctx),
  ]

  const scored = factors.filter((f) => f.score != null)
  const wSum = scored.reduce((s, f) => s + f.weight, 0)
  const participationIndex =
    wSum > 0 ? Math.round(scored.reduce((s, f) => s + (f.score as number) * f.weight, 0) / wSum) : 0

  const m = ctx.match
  const e = ctx.economics
  const target = ctx.targetMargin ?? 0.1
  const criticalBlock = (m?.criticalMismatches ?? 0) > 0
  const marginKnown = e.marginRatio != null

  let verdict: Verdict
  if (ctx.deadlinePassed) {
    verdict = 'unsuitable'
  } else if (criticalBlock && marginKnown && e.marginRatio! < 0) {
    verdict = 'unsuitable'
  } else if (criticalBlock) {
    verdict = 'unlikely' // критическое несоответствие — потолок «Скорее нет»
  } else if (marginKnown && e.marginRatio! < -0.02) {
    verdict = 'unsuitable'
  } else if (marginKnown && e.marginRatio! < 0.03) {
    verdict = 'unlikely'
  } else if (marginKnown && e.marginRatio! < target) {
    verdict = 'consider'
  } else if (participationIndex >= 65 && (!marginKnown || e.marginRatio! >= target)) {
    verdict = marginKnown ? 'recommend' : 'consider'
  } else {
    verdict = 'consider'
  }

  const { pros, cons, risks } = buildProsCons(ctx, factors)
  const summary = buildSummary(verdict, ctx)

  return {
    factors,
    participationIndex,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    summary,
    pros: pros.slice(0, 3),
    cons: cons.slice(0, 3),
    risks,
  }
}

function buildProsCons(ctx: ScoringContext, factors: ScoreFactor[]) {
  const m = ctx.match
  const e = ctx.economics
  const spec = ctx.spec
  const byKey = (k: FactorKey) => factors.find((f) => f.key === k)!

  const pros: string[] = []
  const cons: string[] = []
  const risks: string[] = []

  if (m && byKey('compliance').score != null && byKey('compliance').score! >= 80)
    pros.push(`Высокое соответствие ТС (${m.matched}/${m.matched + m.mismatched})`)
  if (e.marginRatio != null && e.marginRatio >= 0.15)
    pros.push(`Хорошая потенциальная маржа ~${(e.marginRatio * 100).toFixed(0)}%`)
  if (ctx.deadlineDaysLeft != null && ctx.deadlineDaysLeft >= 10)
    pros.push('Достаточно времени на подготовку')
  if (byKey('specComplexity').score != null && byKey('specComplexity').score! >= 70)
    pros.push('Простая ТС — мало требований')
  if (ctx.regionInZone === true) pros.push('Регион поставки в вашей зоне')
  if (byKey('competition').score != null && byKey('competition').score! >= 60)
    pros.push('Конкуренция скорее умеренная (косвенно)')

  if (m && m.mismatched > 0) cons.push(`${m.mismatched} несоответствие(й) требованиям ТС`)
  if (m && m.pending > 0) cons.push(`${m.pending} требование(й) нужно проверить вручную`)
  if (e.marginRatio != null && e.marginRatio >= 0 && e.marginRatio < 0.1)
    cons.push(`Невысокая маржа ~${(e.marginRatio * 100).toFixed(0)}%`)
  if (e.marginRatio == null) cons.push('Экономика не рассчитана (нужна себестоимость товара)')
  if (ctx.deadlineDaysLeft != null && ctx.deadlineDaysLeft < 7 && !ctx.deadlinePassed)
    cons.push(`Мало времени — осталось ${ctx.deadlineDaysLeft} дн.`)
  if (byKey('specComplexity').score != null && byKey('specComplexity').score! < 50)
    cons.push('Сложная ТС — много требований / нужны документы')
  if (!ctx.regionKnown) cons.push('Регион поставки не указан')

  // риски
  if (m && m.criticalMismatches > 0) {
    const cr = m.rows.find((r) => r.critical)
    risks.push(`Критическое несоответствие: ${cr?.requirement.name ?? '—'} (${cr?.explanation ?? ''})`)
  }
  if (ctx.deadlinePassed) risks.push('Срок подачи по данным реестра уже истёк — проверьте на портале')
  else if (ctx.deadlineDaysLeft != null && ctx.deadlineDaysLeft < 3)
    risks.push(`Очень короткий срок подачи (${ctx.deadlineDaysLeft} дн.)`)
  if (!spec) risks.push('Техническая спецификация не приложена или не разобрана')
  else if (!spec.meta.templateRecognized)
    risks.push('ТС не распозналась автоматически — сверьте требования вручную')
  if (spec && (spec.documents?.length ?? 0) > 0)
    risks.push(`Требуются документы: ${spec.documents!.slice(0, 3).join(', ')}`)
  if (byKey('competition').score == null)
    risks.push('Конкуренция неизвестна — нет исторических данных по участникам')
  if (e.warnings.some((w) => /потолку цены|оптимистич/i.test(w)))
    risks.push('Экономика посчитана по потолку цены (нет исторической цены) — оценка оптимистичная')
  if (e.marginRatio != null && e.marginRatio < 0.05)
    risks.push('Маленькая маржа — оцените, стоит ли времени на подготовку')

  if (risks.length === 0) risks.push('Существенных рисков не обнаружено')
  return { pros, cons, risks }
}

function buildSummary(verdict: Verdict, ctx: ScoringContext): string {
  const m = ctx.match
  const e = ctx.economics
  const marginTxt =
    e.marginRatio != null
      ? `потенциальная маржа ~${(e.marginRatio * 100).toFixed(0)}%`
      : 'экономика не рассчитана (нет себестоимости)'
  const complTxt = m
    ? `${m.matched} из ${m.matched + m.mismatched} требований выполнены${m.criticalMismatches ? `, ${m.criticalMismatches} критическое несоответствие` : ''}`
    : 'ТС не разобрана'
  switch (verdict) {
    case 'recommend':
      return `Товар соответствует основным требованиям ТС (${complTxt}). ${cap(marginTxt)}. Существенных блокеров нет — стоит участвовать.`
    case 'consider':
      return `${cap(complTxt)}. ${cap(marginTxt)}. Есть моменты для проверки — оцените риски ниже перед решением.`
    case 'unlikely':
      return `${cap(complTxt)}. ${cap(marginTxt)}. Скорее не стоит: слабая экономика или несоответствие, которое трудно закрыть вашим ассортиментом.`
    case 'unsuitable':
      return `${cap(complTxt)}. ${cap(marginTxt)}. Не подходит: ${ctx.deadlinePassed ? 'срок подачи истёк' : 'блокирующее несоответствие или отрицательная экономика'}.`
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
