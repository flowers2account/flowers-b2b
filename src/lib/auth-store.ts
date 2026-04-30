import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  clientId: string | null
  clientName: string | null
  clientPhone: string | null
  isAuthed: boolean
  setClient: (id: string, name: string, phone: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      clientId: null,
      clientName: null,
      clientPhone: null,
      isAuthed: false,
      setClient: (id, name, phone) =>
        set({ clientId: id, clientName: name, clientPhone: phone, isAuthed: true }),
      logout: () =>
        set({ clientId: null, clientName: null, clientPhone: null, isAuthed: false }),
    }),
    { name: 'flowers-auth' }
  )
)
