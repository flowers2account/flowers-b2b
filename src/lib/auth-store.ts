import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone } from '@/lib/phone'
import { useCart } from '@/lib/cart-store'
import { useFavorites } from '@/lib/favorites-store'

type Role = 'admin' | 'manager' | 'client' | null

interface AuthState {
  user: { id: string } | null
  role: Role
  phone: string | null
  isAuthed: boolean
  init: () => Promise<void>
  login: (phone: string, pin: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
}

let _initialized = false

async function fetchProfile(userId: string) {
  try {
    const { data } = await createClient()
      .from('profiles')
      .select('role, phone')
      .eq('id', userId)
      .single()
    return data
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  phone: null,
  isAuthed: false,

  init: async () => {
    if (_initialized) return
    _initialized = true
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session?.user) {
        _initialized = false  // allow retry — no session yet
        return
      }
      const profile = await fetchProfile(session.user.id)
      set({
        user: { id: session.user.id },
        role: (profile?.role ?? null) as Role,
        phone: profile?.phone ?? null,
        isAuthed: true,
      })
    } catch {
      _initialized = false  // allow retry on network error
    }
  },

  login: async (phone: string, pin: string) => {
    const supabase = createClient()
    const normalized = normalizePhone(phone)
    const email = `${normalized.replace('+', '')}@flowers.local`

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pin })

    if (error || !data?.user) {
      return { error: 'Неверный телефон или PIN' }
    }

    const userId = data.user.id
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, phone')
      .eq('id', userId)
      .single()

    _initialized = true
    set({
      user: { id: userId },
      role: (profile?.role ?? null) as Role,
      phone: normalizePhone(profile?.phone ?? normalized),
      isAuthed: true,
    })

    return {}
  },

  logout: async () => {
    await createClient().auth.signOut()
    _initialized = false
    set({ user: null, role: null, phone: null, isAuthed: false })
    // Чистим персональные данные, чтобы не утекли следующему пользователю
    useCart.getState().clear()
    useFavorites.getState().loadForPhone('')
  },
}))

if (typeof window !== 'undefined') {
  createClient().auth.onAuthStateChange(async (event: string, session: Session | null) => {
    if (event === 'SIGNED_OUT') {
      _initialized = false
      useAuthStore.setState({ user: null, role: null, phone: null, isAuthed: false })
      // Любой разлогин (истёк токен, выход в другой вкладке), не только кнопка «Выйти»,
      // должен чистить персональную корзину/избранное — иначе остатки висят у гостя.
      useCart.getState().clear()
      useFavorites.getState().loadForPhone('')
      return
    }

    // INITIAL_SESSION fires on page load when a stored session exists in localStorage.
    // Handling it here restores auth state before any useEffect runs.
    if (event === 'INITIAL_SESSION' && session?.user && !_initialized) {
      _initialized = true
      try {
        const profile = await fetchProfile(session.user.id)
        useAuthStore.setState({
          user: { id: session.user.id },
          role: (profile?.role ?? null) as Role,
          phone: profile?.phone ?? null,
          isAuthed: true,
        })
      } catch {
        _initialized = false
      }
    }
  })
}
