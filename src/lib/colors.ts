export const COLORS = [
  { key: 'white',      label: 'Белый',        bg: '#FFFFFF',   border: '#E0E0E0' },
  { key: 'cream',      label: 'Кремовый',     bg: '#FFF8E7',   border: '#E8D8A0' },
  { key: 'ivory',      label: 'Айвори',       bg: '#FFFFF0',   border: '#E8E4C8' },

  { key: 'yellow',        label: 'Жёлтый',          bg: '#FDD835',   border: '#F9A825' },
  { key: 'apricot',       label: 'Абрикосовый',     bg: '#FFBE7D',   border: '#E8943A' },
  { key: 'yellow_orange', label: 'Жёлто-оранжевый', bg: '#FFAB40',   border: '#FF8F00' },
  { key: 'orange',        label: 'Оранжевый',       bg: '#FF7043',   border: '#E64A19' },
  { key: 'light_orange',  label: 'Светло-оранжевый',bg: '#FFCC80',   border: '#FFA040' },
  { key: 'peach',         label: 'Персиковый',      bg: '#FFCBA4',   border: '#E8A87C' },
  { key: 'salmon',        label: 'Лососёвый',       bg: '#FA8072',   border: '#E05C50' },
  { key: 'coral',      label: 'Коралловый',   bg: '#FF6B6B',   border: '#E53935' },
  { key: 'orange_red',    label: 'Оранжево-красный', bg: '#FF4500',  border: '#CC2200' },

  { key: 'red',        label: 'Красный',      bg: '#E53935',   border: '#C62828' },
  { key: 'burgundy',   label: 'Бордовый',     bg: '#7B1A2E',   border: '#5C1220' },
  { key: 'red_dark',   label: 'Тёмно-красный', bg: '#B71C1C',   border: '#7F0000' },

  { key: 'pink_light', label: 'Нежно-розовый',  bg: '#FADADD',  border: '#F4A7B0' },
  { key: 'pink',       label: 'Розовый',        bg: '#FFB6C1',  border: '#E991A0' },
  { key: 'cerise',     label: 'Вишнёвый',       bg: '#DE3163',   border: '#B71C1C' },
  { key: 'hot_pink',   label: 'Ярко-розовый',   bg: '#FF1493',  border: '#C71585' },
  { key: 'pink_dark',  label: 'Тёмно-розовый',  bg: '#C2185B',   border: '#880E4F' },

  { key: 'lilac',      label: 'Сиреневый',       bg: '#DDB6F2',   border: '#B39DDB' },
  { key: 'milka',      label: 'Милка',           bg: '#C9A8E0',   border: '#9B72BB' },
  { key: 'lilac_dark', label: 'Тёмно-сиреневый', bg: '#9B59B6',   border: '#7D3C98' },
  { key: 'lavender',   label: 'Лавандовый',      bg: '#CE93D8',   border: '#AB47BC' },
  { key: 'purple',     label: 'Фиолетовый',   bg: '#7B1FA2',   border: '#6A1B9A' },

  { key: 'blue',       label: 'Голубой',      bg: '#64B5F6',   border: '#1E88E5' },
  { key: 'navy',       label: 'Синий',        bg: '#283593',   border: '#1A237E' },

  { key: 'green',      label: 'Зелёный',      bg: '#66BB6A',   border: '#388E3C' },
  { key: 'lime',       label: 'Салатовый',    bg: '#C5E1A5',   border: '#7CB342' },
  { key: 'silver',     label: 'Серебристый',  bg: '#CFD8DC',   border: '#90A4AE' },

  { key: 'sand',       label: 'Песочный',     bg: '#E8D5B0',   border: '#C8A870' },
  { key: 'brown',      label: 'Коричневый',   bg: '#795548',   border: '#5D4037' },
  { key: 'bronze',     label: 'Бронзовый',    bg: '#CD7F32',   border: '#A0522D' },
  { key: 'terracotta', label: 'Терракотовый', bg: '#C66E50',   border: '#A0522D' },

  { key: 'black',      label: 'Чёрный',       bg: '#212121',   border: '#000000' },

  { key: 'pink_white',           label: 'Розово-белый',      gradient: 'linear-gradient(135deg,#FFB6C1 50%,#FFFFFF 50%)' },
  { key: 'lilac_white',          label: 'Сиренево-белый',    gradient: 'linear-gradient(135deg,#DDB6F2 50%,#FFFFFF 50%)' },
  { key: 'purple_white',         label: 'Фиолетово-белый',   gradient: 'linear-gradient(135deg,#7B1FA2 50%,#FFFFFF 50%)' },
  { key: 'red_white',            label: 'Красно-белый',      gradient: 'linear-gradient(135deg,#E53935 50%,#FFFFFF 50%)' },
  { key: 'red_yellow',           label: 'Красно-жёлтый',     gradient: 'linear-gradient(135deg,#E53935 50%,#FDD835 50%)' },
  { key: 'green_white',          label: 'Зелёно-белый',      gradient: 'linear-gradient(135deg,#66BB6A 50%,#FFFFFF 50%)' },
  { key: 'green_pink',           label: 'Зелёно-розовый',    gradient: 'linear-gradient(135deg,#66BB6A 50%,#FFB6C1 50%)' },
  { key: 'bicolor',              label: 'Биколор',           gradient: 'linear-gradient(135deg,#E53935 50%,#FFFFFF 50%)' },
  { key: 'bicolor_orange_yellow',label: 'Оранжево-жёлтый',   gradient: 'linear-gradient(135deg,#FF7043 50%,#FDD835 50%)' },
  { key: 'bicolor_orange_green', label: 'Оранжево-зелёный',  gradient: 'linear-gradient(135deg,#FF7043 50%,#66BB6A 50%)' },
  { key: 'bicolor_blue_white',   label: 'Голубо-белый',      gradient: 'linear-gradient(135deg,#64B5F6 50%,#FFFFFF 50%)' },
  { key: 'multicolor',           label: 'Микс',              gradient: 'conic-gradient(#E53935 0deg,#FDD835 90deg,#66BB6A 180deg,#7B1FA2 270deg,#E53935 360deg)' },
] as const

export type ColorDef = typeof COLORS[number]

// ── Выбор цвета (Вариант А: цвет — ярлык, не SKU) ───────────────────────────────
// Источник вариантов — products.colors (text[]). Остаток/резерв общие на товар.

const ASSORTI_RE = /^(ассорти|assorti)$/i

export function isAssorti(slug: string): boolean {
  return ASSORTI_RE.test(slug.trim())
}

/**
 * Режим выбора цвета по products.colors:
 *  - 'none'    — пусто/null: блока цвета нет, color = null
 *  - 'assorti' — ровно один элемент «ассорти»: статичный бейдж, color = "ассорти"
 *  - 'select'  — один и более настоящих цветов: чипсы, выбор обязателен
 */
export function getColorMode(colors?: string[] | null): 'none' | 'assorti' | 'select' {
  const list = (colors ?? []).map(c => c?.trim()).filter(Boolean) as string[]
  if (list.length === 0) return 'none'
  if (list.length === 1 && isAssorti(list[0])) return 'assorti'
  return 'select'
}

/** Человекочитаемая подпись цвета по слагу (для чипсов, корзины, уведомления, Excel). */
export function colorLabel(slug: string): string {
  if (isAssorti(slug)) return 'Ассорти'
  return COLORS.find(c => c.key === slug)?.label ?? slug
}

/**
 * CSS-фон свотча. Принимает и слаг ('red'), и подпись ('Красный') —
 * в корзине/заказе хранится подпись, в палитре ключ — слаг.
 * Для неизвестных/ассорти — радужный микс.
 */
export function colorSwatch(slugOrLabel: string): string {
  if (isAssorti(slugOrLabel)) return 'conic-gradient(#E53935 0deg,#FDD835 90deg,#66BB6A 180deg,#7B1FA2 270deg,#E53935 360deg)'
  const v = slugOrLabel.trim().toLowerCase()
  const c = COLORS.find(c => c.key.toLowerCase() === v || c.label.toLowerCase() === v)
  if (!c) return '#ccc'
  return ('gradient' in c ? c.gradient : c.bg) as string
}
