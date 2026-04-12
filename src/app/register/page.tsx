'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleRegister() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { company_name: company, phone }
      }
    })
    if (error) {
      setError(error.message)
    } else {
      router.push('/')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold text-green-900 font-serif mb-2">🌸 Регистрация</h1>
        <p className="text-muted-foreground text-sm mb-6">Создайте аккаунт для оформления заказов</p>
        <div className="space-y-4">
          <Input placeholder="Название компании" value={company} onChange={e => setCompany(e.target.value)} />
          <Input placeholder="Телефон" value={phone} onChange={e => setPhone(e.target.value)} />
          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button className="w-full bg-green-700 hover:bg-green-800" onClick={handleRegister} disabled={loading}>
            {loading ? 'Регистрируем...' : 'Зарегистрироваться'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Уже есть аккаунт?{' '}
            <Link href="/login" className="text-green-700 font-medium hover:underline">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
