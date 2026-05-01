import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone } from '@/lib/phone'

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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  phone: null,
  isAuthed: false,

  init: async () => {
    if (_initialized) return
    _initialized = true
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, phone')
      .eq('id', user.id)
      .single()
    set({
      user: { id: user.id },
      role: (profile?.role ?? null) as Role,
      phone: profile?.phone ?? null,
      isAuthed: true,
    })
  },

  login: async (phone: string, pin: string) => {
    const supabase = createClient()
    const normalized = normalizePhone(phone)
    const email = `${normalized.replace('+', '')}@flowers.local`

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pin })
    console.log('AUTH RESULT:', { userId: data?.user?.id, error: error?.message })

    if (error || !data?.user) {
      return { error: 'Неверный телефон или PIN' }
    }

    const userId = data.user.id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, phone')
      .eq('id', userId)
      .single()

    console.log('PROFILE:', { profile, profileError: profileError?.message })

    set({
      user: { id: userId },
      role: (profile?.role ?? null) as Role,
      phone: normalizePhone(profile?.phone ?? normalized),
      isAuthed: true,
    })

    return {}
  },

  logout: async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    set({ user: null, role: null, phone: null, isAuthed: false })
  },
}))
