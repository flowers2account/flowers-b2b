import { create } from 'zustand'
import type { WidgetProduct } from '@/lib/bot/accessories-bot' // import type — серверный модуль не бандлится

export interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  text: string
  products?: WidgetProduct[]
  ts: number
}

// История диалога — в рамках сессии браузера (без таблиц в БД). Стор-синглтон,
// виджет смонтирован один раз в layout → переживает клиентскую навигацию.
interface WidgetStore {
  open: boolean
  greeted: boolean                 // показали ли приветствие
  messages: ChatMessage[]
  pending: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
  markGreeted: () => void
  addMessage: (m: Omit<ChatMessage, 'id' | 'ts'>) => void
  setPending: (v: boolean) => void
}

export const useWidget = create<WidgetStore>((set) => ({
  open: false,
  greeted: false,
  messages: [],
  pending: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
  markGreeted: () => set({ greeted: true }),
  addMessage: (m) => set((s) => ({
    messages: [...s.messages, { ...m, id: crypto.randomUUID(), ts: Date.now() }],
  })),
  setPending: (v) => set({ pending: v }),
}))
