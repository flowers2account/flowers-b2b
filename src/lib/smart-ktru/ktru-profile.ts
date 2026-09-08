// Effective KTRU Profile — чистая композиция «КТРУ товара + КТРУ группы».
// Без React/сети/БД. Правило приоритета: product > group; primary > alternative.
// Групповые коды НЕ копируются в товар физически (задача #7) — только логически здесь.
//
// Плюс маленькие reducer-хелперы над списком ProductKtru/ProductGroupKtru —
// одни и те же в store-действиях и в тестах (задача #25, DoD #1–5, #8–10).

import type {
  ProductKtru,
  ProductKtruRole,
  ProductKtruSource,
  ProductGroup,
  ProductGroupKtru,
  Product,
  EffectiveKtruEntry,
  EffectiveKtruProfile,
} from './types.ts'

const now = () => new Date().toISOString()

// ─────────────────────────── reducer-хелперы над списком ───────────────────────────

type KtruEntry = ProductKtru | ProductGroupKtru

/** Ровно один primary: если primary нет — первый становится primary; если несколько — остаётся первый. */
export function normalizeKtruList<T extends KtruEntry>(list: T[]): T[] {
  const seen = new Set<string>()
  const uniq = list.filter((e) => {
    const c = (e.code ?? '').trim()
    if (!c || seen.has(c)) return false
    seen.add(c)
    return true
  })
  if (uniq.length === 0) return uniq
  const primaries = uniq.filter((e) => e.role === 'primary')
  if (primaries.length === 1) return uniq
  const keepPrimary = primaries[0] ?? uniq[0]
  return uniq.map((e) => ({ ...e, role: (e === keepPrimary ? 'primary' : 'alternative') as ProductKtruRole }))
}

/** Добавить код. Если уже есть — no-op (дубль не создаётся, DoD #3). role='primary' демотирует прежний primary. */
export function addKtruEntry<T extends KtruEntry>(
  list: T[],
  code: string,
  role: ProductKtruRole = 'alternative',
  source: ProductKtruSource = 'user',
  confidence?: number,
): T[] {
  const c = (code ?? '').trim()
  if (!c) return list
  if (list.some((e) => e.code === c)) return list
  const entry = { code: c, role, source, createdAt: now(), updatedAt: now(), ...(confidence != null ? { confidence } : {}) } as T
  const base = role === 'primary' ? list.map((e) => ({ ...e, role: 'alternative' as ProductKtruRole })) : list
  return normalizeKtruList([...base, entry])
}

/** Удалить код. Удаление alternative не трогает primary (DoD #5); удаление primary промотит первую alternative. */
export function removeKtruEntry<T extends KtruEntry>(list: T[], code: string): T[] {
  const rest = list.filter((e) => e.code !== code)
  return normalizeKtruList(rest)
}

/** Сделать код primary (код должен существовать). Прежний primary → alternative (DoD #4). */
export function setPrimaryEntry<T extends KtruEntry>(list: T[], code: string): T[] {
  if (!list.some((e) => e.code === code)) return list
  return list.map((e) => ({
    ...e,
    role: (e.code === code ? 'primary' : 'alternative') as ProductKtruRole,
    updatedAt: e.code === code || e.role === 'primary' ? now() : e.updatedAt,
  }))
}

/** Полная замена списка из выбора пользователя. entries[0] (или помеченный primary) → primary. */
export function setKtruList<T extends KtruEntry>(
  entries: Array<{ code: string; role?: ProductKtruRole; confidence?: number; source?: ProductKtruSource }>,
  defaultSource: ProductKtruSource = 'user',
): T[] {
  const built = entries
    .map((e) => ({ ...e, code: (e.code ?? '').trim() }))
    .filter((e) => e.code)
    .map(
      (e, i) =>
        ({
          code: e.code,
          role: (e.role ?? (i === 0 ? 'primary' : 'alternative')) as ProductKtruRole,
          source: e.source ?? defaultSource,
          createdAt: now(),
          updatedAt: now(),
          ...(e.confidence != null ? { confidence: e.confidence } : {}),
        }) as T,
    )
  return normalizeKtruList(built)
}

/** codes[] (legacy) → ProductKtru[] : codes[0] → primary, остальные → alternative. Для migrate() и импорта. */
export function ktruListFromCodes(codes: string[], source: ProductKtruSource = 'imported'): ProductKtru[] {
  return setKtruList<ProductKtru>(
    (codes ?? []).map((c) => ({ code: c })),
    source,
  )
}

// ─────────────────────────── Effective profile ───────────────────────────

/**
 * КТРУ товара + КТРУ его группы → единый профиль без дублей.
 * product > group (код из товара перекрывает такой же из группы, вместе с ролью).
 */
export function effectiveKtruProfile(
  product: Pick<Product, 'ktru'>,
  group?: Pick<ProductGroup, 'ktru'> | null,
): EffectiveKtruProfile {
  const byCode = new Map<string, EffectiveKtruEntry>()
  for (const k of product.ktru ?? []) {
    if (!k.code) continue
    byCode.set(k.code, { code: k.code, role: k.role, origin: 'product' })
  }
  for (const k of group?.ktru ?? []) {
    if (!k.code || byCode.has(k.code)) continue
    byCode.set(k.code, { code: k.code, role: k.role, origin: 'group' })
  }
  const all = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
  return {
    primary: all.filter((e) => e.role === 'primary'),
    alternatives: all.filter((e) => e.role !== 'primary'),
    all,
  }
}

/** Плоский уникальный список кодов effective-профиля — для фетча закупок. */
export function effectiveKtruCodes(profile: EffectiveKtruProfile): string[] {
  return profile.all.map((e) => e.code)
}

/** Роль конкретного кода в effective-профиле (для ярлыка «КТРУ закупки: X — Alternative»). */
export function roleOfCode(profile: EffectiveKtruProfile, code: string): EffectiveKtruEntry | null {
  return profile.all.find((e) => e.code === code) ?? null
}
