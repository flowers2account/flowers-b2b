import { create } from 'zustand'
import type { WidgetProduct } from '@/lib/bot/accessories-bot' // import type — серверный модуль не бандлится

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
  kind?: 'register-form' | 'login-form' | 'pin-entry'  // интерактивные блоки регистрации/входа в ленте
  ts: number
}

// История диалога — в рамках сессии браузера (без таблиц в БД). Стор-синглтон,
// виджет смонтирован один раз в layout → переживает клиентскую навигацию.
interface WidgetStore {
  open: boolean
  greeted: boolean                 // показали ли приветствие
  nudgedAnon: boolean              // показывали ли уже наджу гостю в этой сессии
  messages: ChatMessage[]
  pending: boolean
  pendingAdd: PendingAdd | null    // товар, который гость хотел добавить до регистрации
  regPhone: string | null          // телефон из формы регистрации (для входа по PIN в чате)
  setOpen: (v: boolean) => void
  toggle: () => void
  markGreeted: () => void
  markNudgedAnon: () => void
  addMessage: (m: Omit<ChatMessage, 'id' | 'ts'>) => void
  setPending: (v: boolean) => void
  setPendingAdd: (v: PendingAdd | null) => void
  setRegPhone: (v: string | null) => void
}

export const useWidget = create<WidgetStore>((set) => ({
  open: false,
  greeted: false,
  nudgedAnon: false,
  messages: [],
  pending: false,
  pendingAdd: null,
  regPhone: null,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
  markGreeted: () => set({ greeted: true }),
  markNudgedAnon: () => set({ nudgedAnon: true }),
  addMessage: (m) => set((s) => ({
    messages: [...s.messages, { ...m, id: crypto.randomUUID(), ts: Date.now() }],
  })),
  setPending: (v) => set({ pending: v }),
  setPendingAdd: (v) => set({ pendingAdd: v }),
  setRegPhone: (v) => set({ regPhone: v }),
}))
