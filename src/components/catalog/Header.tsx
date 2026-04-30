import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import ClientAuthButton from './ClientAuthButton'

async function signOut() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export default async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let role = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    role = profile?.role
  }

  return (
    <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-green-900 font-bold font-serif text-lg">🌸 Цветы Уральска</span>
          <span className="text-muted-foreground text-xs ml-2">оптовый склад</span>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <Link href="/orders">
              <Button variant="outline" size="sm">📋 Мои заказы</Button>
            </Link>
          )}
          {user ? (
            <>
              <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
              {role === 'admin' && (
                <Link href="/admin">
                  <Button variant="outline" size="sm">⚙️ Админка</Button>
                </Link>
              )}
              <form action={signOut}>
                <Button variant="ghost" size="sm" type="submit">Выйти</Button>
              </form>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm" className="bg-green-700 hover:bg-green-800">Войти</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
