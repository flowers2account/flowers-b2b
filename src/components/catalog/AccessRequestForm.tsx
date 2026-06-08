'use client'
import { useState } from 'react'
import s from '@/app/about/about.module.css'

// Форма-заявка на доступ (секция «Как заказать» на /about) → POST /api/access-request.
export default function AccessRequestForm() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (name.trim().length < 2) { setError('Укажите имя'); return }
    if (phone.replace(/\D/g, '').length < 10) { setError('Укажите корректный номер'); return }

    // Клиентский анти-спам (сервер тоже проверяет): 1 заявка в 5 минут
    try {
      const last = Number(localStorage.getItem('access-request-ts') || 0)
      if (Date.now() - last < 5 * 60 * 1000) {
        setOk(true); return
      }
    } catch { /* ignore */ }

    setLoading(true)
    try {
      const res = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok || res.status === 429) {
        try { localStorage.setItem('access-request-ts', String(Date.now())) } catch { /* ignore */ }
        setOk(true)
      } else {
        setError(data.error || 'Не удалось отправить заявку')
      }
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  if (ok) {
    return (
      <div className={`${s.arMsg} ${s.ok}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        Спасибо! Свяжемся с вами и откроем доступ — пришлём PIN-код для входа.
      </div>
    )
  }

  return (
    <div className={s.arCol}>
      <div className={s.arForm}>
        <input
          className={s.arInput} type="text" autoComplete="name" placeholder="Ваше имя"
          value={name} onChange={e => setName(e.target.value)}
        />
        <input
          className={s.arInput} type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__"
          value={phone} onChange={e => setPhone(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <button className={s.arBtn} type="button" onClick={submit} disabled={loading}>
          {loading ? 'Отправляем…' : 'Получить доступ'}
        </button>
      </div>
      {error && <div className={`${s.arMsg} ${s.err}`}>{error}</div>}
    </div>
  )
}
