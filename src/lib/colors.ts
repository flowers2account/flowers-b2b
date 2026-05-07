export const COLORS = [
  { key: 'white',         label: 'Белый',         bg: '#FFFFFF', border: '#E0E0E0' },
  { key: 'cream',         label: 'Кремовый',       bg: '#FFF8E7', border: '#E8D8A0' },
  { key: 'pink',          label: 'Розовый',        bg: '#FFB6C1', border: '#E991A0' },
  { key: 'peach',         label: 'Персиковый',     bg: '#FFCBA4', border: '#E8A87C' },
  { key: 'red',           label: 'Красный',        bg: '#E53935', border: '#C62828' },
  { key: 'bordeaux',      label: 'Бордовый',       bg: '#7B1A2E', border: '#5C1220' },
  { key: 'orange',        label: 'Оранжевый',      bg: '#FF7043', border: '#E64A19' },
  { key: 'yellow',        label: 'Жёлтый',         bg: '#FDD835', border: '#F9A825' },
  { key: 'lavender',      label: 'Лавандовый',     bg: '#CE93D8', border: '#AB47BC' },
  { key: 'purple',        label: 'Фиолетовый',     bg: '#7B1FA2', border: '#6A1B9A' },
  { key: 'green',         label: 'Зелёный',        bg: '#66BB6A', border: '#388E3C' },
  { key: 'mix',           label: 'Микс',           gradient: 'conic-gradient(#E53935 0deg,#FDD835 90deg,#66BB6A 180deg,#7B1FA2 270deg,#E53935 360deg)' },
  { key: 'mix_pink',      label: 'Пинк микс',      gradient: 'linear-gradient(135deg,#FFB6C1 50%,#FFFFFF 50%)' },
  { key: 'mix_red_white', label: 'Красно-белый',   gradient: 'linear-gradient(135deg,#E53935 50%,#FFFFFF 50%)' },
] as const

export type ColorDef = typeof COLORS[number]
