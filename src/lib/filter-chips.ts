import { useMemo } from 'react'
import { useFilters } from './filter-store'
import { leafForSubcat, labelForLeafSlug } from './category-tree'

export type Chip = { label: string; onRemove: () => void }

// cut/pot — лейблы остаются здесь (источник accessories — category-tree.ts).
const SUBCAT_LABELS: Record<string, string> = {
  roses: 'Розы', chrysanthemums: 'Хризантемы', carnations: 'Гвоздики',
  tulips: 'Тюльпаны', peonies: 'Пионы', ranunculus: 'Ранункулюсы',
  anemones: 'Анемоны', lilies: 'Лилии', gerberas: 'Герберы',
  lisianthus: 'Эустомы', alstroemeria: 'Альстромерии', hydrangeas: 'Гортензии',
  orchids: 'Орхидеи', callas: 'Каллы', anthuriums: 'Антуриумы',
  proteas: 'Протеи', sunflowers: 'Подсолнухи', irises: 'Ирисы',
  delphiniums: 'Дельфиниумы',
  greens: 'Зелень', branches: 'Ветки', fillers: 'Наполнители',
  texture: 'Текстурные', berries: 'Ягоды', vines: 'Лианы',
  // legacy
  accents: 'Акцентные', seasonal: 'Сезонные', spring: 'Весенние', exotic: 'Экзотика',
  // pot
  green: 'Зелёные', flowering: 'Цветущие', succulents: 'Суккуленты',
  outdoor: 'Уличные', large: 'Крупномеры',
}
const VARIETY_TYPE_LABELS: Record<string, string> = {
  single: 'Одноголовые', spray: 'Кустовые', pompom: 'Помпонные',
  decorative: 'Пионовидные', ot: 'ОТ-гибриды', oriental: 'Восточные', asian: 'Азиатские',
}
const COLOR_LABELS: Record<string, string> = {
  white: 'Белый', cream: 'Кремовый',
  yellow: 'Жёлтый', orange: 'Оранжевый', peach: 'Персиковый', coral: 'Коралловый',
  red: 'Красный', burgundy: 'Бордовый',
  pink: 'Розовый', hot_pink: 'Ярко-розовый',
  lilac: 'Сиреневый', lavender: 'Лавандовый', purple: 'Фиолетовый',
  blue: 'Голубой', navy: 'Синий',
  green: 'Зелёный', lime: 'Салатовый', silver: 'Серебристый',
  brown: 'Коричневый', terracotta: 'Терракотовый',
  black: 'Чёрный',
  bicolor: 'Биколор', multicolor: 'Микс',
  // legacy keys from DB
  bordeaux: 'Бордовый', mix: 'Микс', mix_pink: 'Пинк микс', mix_red_white: 'Красно-белый',
}
const SEASON_LABELS: Record<string, string> = {
  spring: 'Весна', summer: 'Лето', autumn: 'Осень',
  winter: 'Зима', year: 'Круглый год', year_round: 'Круглый год',
}
export const ORIGIN_LABELS: Record<string, string> = {
  ecuador: 'Эквадор', kenya: 'Кения', holland: 'Голландия',
  china: 'Китай', russia: 'Россия', colombia: 'Колумбия', local: 'Местный',
  // ISO-коды (из country_iso в products)
  CN: 'Китай', NL: 'Голландия', EC: 'Эквадор', KE: 'Кения',
  CO: 'Колумбия', ET: 'Эфиопия', IL: 'Израиль', RU: 'Россия',
  BE: 'Бельгия', DK: 'Дания', IT: 'Италия', DE: 'Германия', FR: 'Франция',
  TR: 'Турция', ZA: 'ЮАР', TZ: 'Танзания', UG: 'Уганда',
}
const TAG_LABELS: Record<string, string> = {
  hit: '🔥 Хит', sale: '🏷 Акция', new: '🆕 Новинка',
  premium: '⭐ Премиум', wedding: '💍 Свадебные',
  exotic: '🌿 Экзотика', seasonal: '🌸 Сезонные', spring: '🌷 Весна',
}
const POT_SIZE_LABELS: Record<string, string> = {
  'до12': 'до 12 см', '14-17': '14–17 см', '19-23': '19–23 см', '25+': '25+ см',
}

export function useFilterChips(): Chip[] {
  const {
    subcat, varietyType, selectedLeaves, colors, lengths, origins, farms,
    potSizes, tags, seasons,
    setSubcat, setVarietyType, toggleLeaf,
    toggleColor, toggleLength, toggleOrigin, toggleFarm, togglePotSize,
    toggleTag, toggleSeason,
  } = useFilters()

  return useMemo<Chip[]>(() => {
    const result: Chip[] = []
    if (subcat) {
      const parts = [leafForSubcat(subcat)?.label ?? SUBCAT_LABELS[subcat] ?? subcat]
      if (varietyType) parts.push(VARIETY_TYPE_LABELS[varietyType] ?? varietyType)
      result.push({ label: parts.join(' · '), onRemove: () => { setSubcat(''); setVarietyType('') } })
    }
    // accessories — мульти-выбор листьев
    selectedLeaves.forEach(slug =>
      result.push({ label: labelForLeafSlug(slug), onRemove: () => toggleLeaf(slug) })
    )
    colors.forEach(c => result.push({ label: COLOR_LABELS[c] ?? c, onRemove: () => toggleColor(c) }))
    lengths.forEach(l => result.push({ label: `${l} см`, onRemove: () => toggleLength(l) }))
    origins.forEach(o => result.push({ label: ORIGIN_LABELS[o] ?? o, onRemove: () => toggleOrigin(o) }))
    farms.forEach(f => result.push({ label: f, onRemove: () => toggleFarm(f) }))
    potSizes.forEach(ps => result.push({ label: POT_SIZE_LABELS[ps] ?? ps, onRemove: () => togglePotSize(ps) }))
    tags.forEach(t => result.push({ label: TAG_LABELS[t] ?? t, onRemove: () => toggleTag(t) }))
    seasons.forEach(s => result.push({ label: SEASON_LABELS[s] ?? s, onRemove: () => toggleSeason(s) }))
    return result
  }, [subcat, varietyType, selectedLeaves, colors, lengths, origins, farms, potSizes, tags, seasons])
}
