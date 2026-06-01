export const COUNTRY_LABELS: Record<string, string> = {
  BE: 'Бельгия',
  CN: 'Китай',
  CO: 'Колумбия',
  DE: 'Германия',
  DK: 'Дания',
  EC: 'Эквадор',
  EG: 'Египет',
  ET: 'Эфиопия',
  FR: 'Франция',
  IL: 'Израиль',
  IT: 'Италия',
  KE: 'Кения',
  NL: 'Голландия',
  RU: 'Россия',
  TZ: 'Танзания',
  UA: 'Украина',
  UG: 'Уганда',
  ZA: 'ЮАР',
}

/** ISO 3166-1 alpha-2 → emoji flag. countryFlag('NL') === '🇳🇱' */
export function countryFlag(iso: string): string {
  return [...iso.toUpperCase()]
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('')
}

export function countryName(iso: string): string {
  return COUNTRY_LABELS[iso] ?? iso
}
