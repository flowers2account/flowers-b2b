import { useMemo } from 'react'
import { useFilters } from './filter-store'

export type Chip = { label: string; onRemove: () => void }

const SUBCAT_LABELS: Record<string, string> = {
  roses: 'Розы', chrysanthemums: 'Хризантемы', carnations: 'Гвоздики',
  lilies: 'Лилии', hydrangeas: 'Гортензии', lisianthus: 'Лизиантус',
  tulips: 'Тюльпаны', gerberas: 'Герберы', callas: 'Каллы',
  irises: 'Ирисы', alstroemeria: 'Альстромерия', accents: 'Акцентные',
  fillers: 'Наполнители', greens: 'Зелень', seasonal: 'Сезонные',
  spring: 'Весенние', exotic: 'Экзотика',
  green: 'Зелёные', flowering: 'Цветущие', succulents: 'Суккуленты',
  outdoor: 'Уличные', large: 'Крупномеры',
  packaging: 'Упаковка', pots: 'Горшки', soil: 'Грунты',
  fertilizers: 'Удобрения', tools: 'Инструмент',
}
const VARIETY_TYPE_LABELS: Record<string, string> = {
  single: 'Одноголовые', spray: 'Кустовые', pompom: 'Помпонные',
  decorative: 'Пионовидные', ot: 'ОТ-гибриды', oriental: 'Восточные', asian: 'Азиатские',
}
const COLOR_LABELS: Record<string, string> = {
  white: 'Белый', cream: 'Кремовый', pink: 'Розовый', peach: 'Персиковый',
  red: 'Красный', bordeaux: 'Бордовый', orange: 'Оранжевый', yellow: 'Жёлтый',
  lavender: 'Лавандовый', purple: 'Фиолетовый', green: 'Зелёный',
  mix: 'Микс', mix_pink: 'Пинк микс', mix_red_white: 'Красно-белый',
}
const FLORAL_LABELS: Record<string, string> = {
  focal: '🌹 Фокусный', mass: '🌸 Массовый', line: '🌿 Линейный',
  filler: '🍃 Наполнитель', texture: '✨ Текстура', foliage: '🌱 Зелень',
}
const SEASON_LABELS: Record<string, string> = {
  spring: 'Весна', summer: 'Лето', autumn: 'Осень',
  winter: 'Зима', year: 'Круглый год', year_round: 'Круглый год',
}
const TAG_LABELS: Record<string, string> = {
  hit: '🔥 Хит', sale: '🏷 Акция', new: '🆕 Новинка',
}
const POT_SIZE_LABELS: Record<string, string> = {
  'до12': 'до 12 см', '14-17': '14–17 см', '19-23': '19–23 см', '25+': '25+ см',
}

export function useFilterChips(): Chip[] {
  const {
    subcat, varietyType, onlyAvailable, colors, lengths, origins,
    potSizes, tags, floralRoles, seasons,
    setSubcat, setVarietyType, setOnlyAvailable,
    toggleColor, toggleLength, toggleOrigin, togglePotSize,
    toggleTag, toggleFloralRole, toggleSeason,
  } = useFilters()

  return useMemo<Chip[]>(() => {
    const result: Chip[] = []
    if (subcat) {
      const parts = [SUBCAT_LABELS[subcat] ?? subcat]
      if (varietyType) parts.push(VARIETY_TYPE_LABELS[varietyType] ?? varietyType)
      result.push({ label: parts.join(' · '), onRemove: () => { setSubcat(''); setVarietyType('') } })
    }
    if (onlyAvailable) result.push({ label: 'В наличии', onRemove: () => setOnlyAvailable(false) })
    colors.forEach(c => result.push({ label: COLOR_LABELS[c] ?? c, onRemove: () => toggleColor(c) }))
    lengths.forEach(l => result.push({ label: l >= 80 ? '80+ см' : `${l} см`, onRemove: () => toggleLength(l) }))
    origins.forEach(o => result.push({ label: o, onRemove: () => toggleOrigin(o) }))
    potSizes.forEach(ps => result.push({ label: POT_SIZE_LABELS[ps] ?? ps, onRemove: () => togglePotSize(ps) }))
    tags.forEach(t => result.push({ label: TAG_LABELS[t] ?? t, onRemove: () => toggleTag(t) }))
    floralRoles.forEach(r => result.push({ label: FLORAL_LABELS[r] ?? r, onRemove: () => toggleFloralRole(r) }))
    seasons.forEach(s => result.push({ label: SEASON_LABELS[s] ?? s, onRemove: () => toggleSeason(s) }))
    return result
  }, [subcat, varietyType, onlyAvailable, colors, lengths, origins, potSizes, tags, floralRoles, seasons])
}
