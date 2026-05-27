export const COLORS = [
  { key: 'white',      label: 'Белый',        bg: '#FFFFFF',   border: '#E0E0E0' },
  { key: 'cream',      label: 'Кремовый',     bg: '#FFF8E7',   border: '#E8D8A0' },

  { key: 'yellow',        label: 'Жёлтый',          bg: '#FDD835',   border: '#F9A825' },
  { key: 'yellow_orange', label: 'Жёлто-оранжевый', bg: '#FFAB40',   border: '#FF8F00' },
  { key: 'orange',        label: 'Оранжевый',       bg: '#FF7043',   border: '#E64A19' },
  { key: 'light_orange',  label: 'Светло-оранжевый',bg: '#FFCC80',   border: '#FFA040' },
  { key: 'peach',         label: 'Персиковый',      bg: '#FFCBA4',   border: '#E8A87C' },
  { key: 'coral',      label: 'Коралловый',   bg: '#FF6B6B',   border: '#E53935' },

  { key: 'red',        label: 'Красный',      bg: '#E53935',   border: '#C62828' },
  { key: 'burgundy',   label: 'Бордовый',     bg: '#7B1A2E',   border: '#5C1220' },

  { key: 'light_pink', label: 'Светло-розовый', bg: '#FFE4EC',  border: '#FFADB8' },
  { key: 'pink',       label: 'Розовый',        bg: '#FFB6C1',  border: '#E991A0' },
  { key: 'hot_pink',   label: 'Ярко-розовый',   bg: '#FF1493',  border: '#C71585' },

  { key: 'lilac',      label: 'Сиреневый',       bg: '#DDB6F2',   border: '#B39DDB' },
  { key: 'lilac_dark', label: 'Тёмно-сиреневый', bg: '#9B59B6',   border: '#7D3C98' },
  { key: 'lavender',   label: 'Лавандовый',      bg: '#CE93D8',   border: '#AB47BC' },
  { key: 'purple',     label: 'Фиолетовый',   bg: '#7B1FA2',   border: '#6A1B9A' },

  { key: 'blue',       label: 'Голубой',      bg: '#64B5F6',   border: '#1E88E5' },
  { key: 'navy',       label: 'Синий',        bg: '#283593',   border: '#1A237E' },

  { key: 'green',      label: 'Зелёный',      bg: '#66BB6A',   border: '#388E3C' },
  { key: 'lime',       label: 'Салатовый',    bg: '#C5E1A5',   border: '#7CB342' },
  { key: 'silver',     label: 'Серебристый',  bg: '#CFD8DC',   border: '#90A4AE' },

  { key: 'brown',      label: 'Коричневый',   bg: '#795548',   border: '#5D4037' },
  { key: 'terracotta', label: 'Терракотовый', bg: '#C66E50',   border: '#A0522D' },

  { key: 'black',      label: 'Чёрный',       bg: '#212121',   border: '#000000' },

  { key: 'bicolor',              label: 'Биколор',           gradient: 'linear-gradient(135deg,#E53935 50%,#FFFFFF 50%)' },
  { key: 'bicolor_red_white',    label: 'Красно-белый',      gradient: 'linear-gradient(135deg,#E53935 50%,#FFFFFF 50%)' },
  { key: 'bicolor_pink_white',   label: 'Розово-белый',      gradient: 'linear-gradient(135deg,#FFB6C1 50%,#FFFFFF 50%)' },
  { key: 'bicolor_red_yellow',   label: 'Красно-жёлтый',     gradient: 'linear-gradient(135deg,#E53935 50%,#FDD835 50%)' },
  { key: 'bicolor_orange_yellow',label: 'Оранжево-жёлтый',   gradient: 'linear-gradient(135deg,#FF7043 50%,#FDD835 50%)' },
  { key: 'bicolor_orange_green', label: 'Оранжево-зелёный',  gradient: 'linear-gradient(135deg,#FF7043 50%,#66BB6A 50%)' },
  { key: 'bicolor_white_green',  label: 'Бело-зелёный',      gradient: 'linear-gradient(135deg,#FFFFFF 50%,#66BB6A 50%)' },
  { key: 'bicolor_blue_white',   label: 'Голубо-белый',      gradient: 'linear-gradient(135deg,#64B5F6 50%,#FFFFFF 50%)' },
  { key: 'multicolor',           label: 'Микс',              gradient: 'conic-gradient(#E53935 0deg,#FDD835 90deg,#66BB6A 180deg,#7B1FA2 270deg,#E53935 360deg)' },
] as const

export type ColorDef = typeof COLORS[number]
