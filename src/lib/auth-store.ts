import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

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

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = '7' + digits.slice(1)
  return digits
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

    supabase.auth.onAuthStateChange(async (_, session) => {
      if (!session?.user) {
        set({ user: null, role: null, phone: null, isAuthed: false })
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, phone')
        .eq('id', session.user.id)
        .single()
      set({
        user: { id: session.user.id },
        role: (profile?.role ?? null) as Role,
        phone: profile?.phone ?? null,
        isAuthed: true,
      })
    })

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
    const digits = normalizePhone(phone)
    const email = `${digits}@flowers.local`

    console.log('LOGIN ATTEMPT:', { email, pin, pinLength: pin.length })
    console.log('email:', email, 'password:', pin)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pin })
    if (error || !data.user) {
      return { error: 'Неверный телефон или PIN' }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, phone')
      .eq('id', data.user.id)
      .single()

    set({
      user: { id: data.user.id },
      role: (profile?.role ?? null) as Role,
      phone: profile?.phone ?? digits,
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
