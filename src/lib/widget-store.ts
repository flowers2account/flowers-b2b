import { create } from 'zustand'
import type { WidgetProduct } from '@/lib/bot/accessories-bot' // import type — серверный модуль не бандлится

export interface ChatMessage {
  id: string
  role: 'user' | 'bot' | 'system'   // system — служебная подсказка в ленте («добавлено · N товаров»)
  text: string
  products?: WidgetProduct[]
  chips?: string[]                  // кликабельные варианты-уточнения под сообщением бота
  nudge?: boolean                   // показать наджу-карточку «войдите по PIN» (гость + товары)
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
  setOpen: (v: boolean) => void
  toggle: () => void
  markGreeted: () => void
  markNudgedAnon: () => void
  addMessage: (m: Omit<ChatMessage, 'id' | 'ts'>) => void
  setPending: (v: boolean) => void
}

export const useWidget = create<WidgetStore>((set) => ({
  open: false,
  greeted: false,
  nudgedAnon: false,
  messages: [],
  pending: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
  markGreeted: () => set({ greeted: true }),
  markNudgedAnon: () => set({ nudgedAnon: true }),
  addMessage: (m) => set((s) => ({
    messages: [...s.messages, { ...m, id: crypto.randomUUID(), ts: Date.now() }],
  })),
  setPending: (v) => set({ pending: v }),
}))
