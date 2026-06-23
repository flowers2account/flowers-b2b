import { create } from 'zustand'
import type { WidgetProduct } from '@/lib/bot/accessories-bot' // import type — серверный модуль не бандлится

// Стабильный id гостя для привязки беседы (между визитами). Хранится в localStorage,
// генерится лениво. Версия B Такт 1.
export function getAnonId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem('aiw_anon_id')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('aiw_anon_id', id) }
    return id
  } catch { return '' }
}

// Что гость пытался добавить до регистрации — кладём в корзину после входа.
export interface PendingAdd {
  id: number
  name: string
  price: number
  available: number
  pack: number | null
  image: string | null
  unit: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'bot' | 'system'   // system — служебная подсказка в ленте («добавлено · N товаров»)
  text: string
  products?: WidgetProduct[]
  chips?: string[]                  // кликабельные варианты-уточнения под сообщением бота
  nudge?: boolean                   // наджа-карточка «зарегистрируйтесь, чтобы покупать»
  kind?: 'register-form' | 'login-form' | 'pin-entry' | 'phone-capture'  // интерактивные блоки в ленте
  ts: number
}

// История диалога — в рамках сессии браузера (без таблиц в БД). Стор-синглтон,
// виджет смонтирован один раз в layout → переживает клиентскую навигацию.
interface WidgetStore {
  open: boolean
  greeted: boolean                 // показали ли приветствие
  nudgedAnon: boolean              // показывали ли уже наджу гостю в этой сессии
  phoneAsked: boolean              // предлагали ли гостю оставить телефон (1×/сессию)
  messages: ChatMessage[]
  pending: boolean
  pendingAdd: PendingAdd | null    // товар, который гость хотел добавить до регистрации
  regPhone: string | null          // телефон из формы регистрации (для входа по PIN в чате)
  setOpen: (v: boolean) => void
  toggle: () => void
  markGreeted: () => void
  markNudgedAnon: () => void
  markPhoneAsked: () => void
  addMessage: (m: Omit<ChatMessage, 'id' | 'ts'>) => void
  openForm: (kind: 'register-form' | 'login-form') => void
  setPending: (v: boolean) => void
  setPendingAdd: (v: PendingAdd | null) => void
  setRegPhone: (v: string | null) => void
}

export const useWidget = create<WidgetStore>((set) => ({
  open: false,
  greeted: false,
  nudgedAnon: false,
  phoneAsked: false,
  messages: [],
  pending: false,
  pendingAdd: null,
  regPhone: null,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
  markGreeted: () => set({ greeted: true }),
  markNudgedAnon: () => set({ nudgedAnon: true }),
  markPhoneAsked: () => set({ phoneAsked: true }),
  addMessage: (m) => set((s) => ({
    messages: [...s.messages, { ...m, id: crypto.randomUUID(), ts: Date.now() }],
  })),
  // Открыть форму регистрации/входа: в ленте одновременно только ОДНА форма.
  // Та же форма уже есть → no-op (не дублируем, ввод сохраняем). Другая → заменяем.
  openForm: (kind) => set((s) => {
    if (s.messages.some((m) => m.kind === kind)) return s
    const cleaned = s.messages.filter((m) => m.kind !== 'register-form' && m.kind !== 'login-form')
    return { messages: [...cleaned, { id: crypto.randomUUID(), ts: Date.now(), role: 'bot', kind, text: '' }] }
  }),
  setPending: (v) => set({ pending: v }),
  setPendingAdd: (v) => set({ pendingAdd: v }),
  setRegPhone: (v) => set({ regPhone: v }),
}))
