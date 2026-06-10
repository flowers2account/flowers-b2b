'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import s from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const { login, isAuthed, init } = useAuthStore()
  const [tab, setTab] = useState<'login' | 'access'>('login')

  // login form
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // access form
  const [arName, setArName] = useState('')
  const [arPhone, setArPhone] = useState('')
  const [arLoading, setArLoading] = useState(false)
  const [arError, setArError] = useState('')
  const [arOk, setArOk] = useState(false)

  useEffect(() => { init() }, [])
  useEffect(() => { if (isAuthed) router.replace('/cabinet') }, [isAuthed, router])

  async function handleLogin() {
    setError('')
    if (phone.replace(/\D/g, '').length < 10) { setError('Введите корректный номер телефона'); return }
    if (pin.replace(/\D/g, '').length < 4) { setError('Введите PIN-код'); return }
    setLoading(true)
    const res = await login(phone, pin)
    setLoading(false)
    if (res.error) setError('Неверный номер или PIN-код. Проверьте данные или запросите новый PIN.')
    else router.replace('/cabinet')
  }

  async function handleAccess() {
    setArError('')
    if (arName.trim().length < 2) { setArError('Укажите имя'); return }
    if (arPhone.replace(/\D/g, '').length < 10) { setArError('Укажите корректный номер'); return }
    try {
      const last = Number(localStorage.getItem('access-request-ts') || 0)
      if (Date.now() - last < 5 * 60 * 1000) { setArOk(true); return }
    } catch { /* ignore */ }
    setArLoading(true)
    try {
      const res = await fetch('/api/access-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: arName.trim(), phone: arPhone }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok || res.status === 429) {
        try { localStorage.setItem('access-request-ts', String(Date.now())) } catch { /* ignore */ }
        setArOk(true)
      } else setArError(data.error || 'Не удалось отправить заявку')
    } catch { setArError('Ошибка сети. Попробуйте ещё раз.') }
    finally { setArLoading(false) }
  }

  return (
    <div className={s.wrap}>
      <div>
        <div className={s.auth}>
          <div className={s.head}>
            <span className={s.brand}>
              <span className={s.mark} />
              <span className={s.wm}><span className={s.nm}>Цветы Уральска</span><span className={s.sub}>оптовая база</span></span>
            </span>
          </div>
          <div className={s.bodyc}>
            <div className={s.tabs}>
              <button className={tab === 'login' ? s.on : ''} onClick={() => setTab('login')}>Вход</button>
              <button className={tab === 'access' ? s.on : ''} onClick={() => setTab('access')}>Получить доступ</button>
            </div>

            {tab === 'login' && (
              <div>
                <div className={s.title}>Вход в магазин</div>
                <div className={s.lead}>Войдите по номеру телефона и PIN-коду, который выдал менеджер.</div>
                <div className={s.field}>
                  <label>Номер телефона</label>
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__"
                    value={phone} onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                </div>
                <div className={`${s.field} ${s.pin}`}>
                  <label>PIN-код</label>
                  <input type="password" inputMode="numeric" maxLength={6} placeholder="••••••"
                    value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                </div>
                {error && <div className={s.err}>{error}</div>}
                <div className={s.rowBetween}>
                  <span className={`${s.remember} ${remember ? s.on : ''}`} onClick={() => setRemember(v => !v)}>
                    <span className={s.box}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                    Запомнить меня
                  </span>
                  <button className={s.flink} onClick={() => setTab('access')}>Забыли PIN?</button>
                </div>
                <button className={s.submit} onClick={handleLogin} disabled={loading}>
                  {loading ? 'Входим…' : <>Войти<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg></>}
                </button>
                <div className={s.hint}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                  <span>PIN-код можно сменить в личном кабинете после входа. Забыли — нажмите «Забыли PIN?», и менеджер пришлёт новый.</span>
                </div>
              </div>
            )}

            {tab === 'access' && (
              <div>
                {arOk ? (
                  <div className={s.msg}>
                    <div className={s.ic}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
                    <div className={s.tt}>Заявка отправлена</div>
                    <div className={s.dd}>Свяжемся с вами и откроем доступ к магазину. PIN-код пришлём на указанный номер.</div>
                    <div className={s.back}><button className={s.flink} onClick={() => { setArOk(false); setTab('login') }}>← Вернуться ко входу</button></div>
                  </div>
                ) : (
                  <div>
                    <div className={s.title}>Получить доступ</div>
                    <div className={s.lead}>Оставьте номер — откроем доступ к магазину и пришлём PIN-код для входа. Это займёт пару минут.</div>
                    <div className={s.field}>
                      <label>Ваше имя</label>
                      <input type="text" autoComplete="name" placeholder="Как к вам обращаться"
                        value={arName} onChange={e => setArName(e.target.value)} />
                    </div>
                    <div className={s.field}>
                      <label>Номер телефона</label>
                      <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__"
                        value={arPhone} onChange={e => setArPhone(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAccess()} />
                    </div>
                    {arError && <div className={s.err}>{arError}</div>}
                    <button className={s.submit} onClick={handleAccess} disabled={arLoading}>
                      {arLoading ? 'Отправляем…' : <>Получить доступ<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></>}
                    </button>
                    <div className={s.hint}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      <span>Доступ открывает менеджер. После подтверждения вы войдёте по номеру и PIN-коду.</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={s.foot}>Нужна помощь? <a href="https://wa.me/77476108458" target="_blank" rel="noopener noreferrer">Напишите в WhatsApp</a></div>
      </div>
    </div>
  )
}
