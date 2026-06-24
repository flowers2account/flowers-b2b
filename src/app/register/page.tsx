'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { company } from '@/config/company'
import s from '../login/login.module.css'

// Standalone-форма регистрации (не только в виджете). Механика идентична
// AiWidget RegisterForm/PinEntry: POST /api/auth/self-register → аккаунт + клиент +
// registration_requests + лид amoCRM + PIN в WhatsApp → ввод PIN → вход по PIN.

const TYPES = ['ИП', 'ТОО', 'Физлицо']
const WA = `https://wa.me/${company.phone.replace(/\D/g, '')}`

export default function RegisterPage() {
  const router = useRouter()
  const { login, isAuthed, init } = useAuthStore()

  const [step, setStep] = useState<'form' | 'pin'>('form')

  // форма регистрации
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [type, setType] = useState('ИП')
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // ввод PIN
  const [regPhone, setRegPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => { init() }, [])
  useEffect(() => { if (isAuthed) router.replace('/cabinet') }, [isAuthed, router])

  async function handleRegister() {
    setError(''); setInfo('')
    if (name.trim().length < 2) { setError('Укажите имя'); return }
    const digits = phone.replace(/\D/g, '')
    if (!/^[78]\d{10}$/.test(digits)) { setError('Телефон в формате +7XXXXXXXXXX'); return }
    const normalized = '+7' + digits.slice(1)
    setBusy(true)
    try {
      const r = await fetch('/api/auth/self-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: normalized, company_name: companyName.trim(), client_type: type, city: city.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.alreadyExists) {
        setRegPhone(d.phone || normalized); setStep('pin')
        setNote(d.delivered
          ? `Вы уже зарегистрированы 🌸 Выслали PIN в WhatsApp на ${d.phone || normalized}. Введите его ниже, чтобы войти.`
          : `Вы уже зарегистрированы. PIN не удалось отправить автоматически на ${d.phone || normalized} — нажмите «Выслать повторно» или напишите менеджеру.`)
        return
      }
      if (d.ok) {
        setRegPhone(d.phone || normalized); setStep('pin')
        setNote(d.delivered
          ? `PIN отправлен в WhatsApp на ${d.phone || normalized}. Введите его ниже, чтобы войти.`
          : `Аккаунт создан, но PIN не удалось отправить в WhatsApp на ${d.phone || normalized}. Нажмите «Выслать повторно» или напишите менеджеру.`)
        return
      }
      setError(d.error || 'Не удалось зарегистрировать. Попробуйте позже.')
    } catch {
      setError('Сеть недоступна, попробуйте ещё раз.')
    } finally { setBusy(false) }
  }

  async function handlePinLogin() {
    setPinError('')
    if (!/^\d{6}$/.test(pin)) { setPinError('PIN — 6 цифр'); return }
    if (!regPhone) { setPinError('Телефон не найден, начните заново'); return }
    setPinBusy(true)
    const res = await login(regPhone, pin)
    setPinBusy(false)
    if (res.error) { setPinError('Неверный PIN. Проверьте код или вышлите новый.'); return }
    router.replace('/cabinet')
  }

  // Честный resend: Umnico подтверждает только отправку, не доставку.
  async function resend() {
    if (!regPhone) return
    try {
      const r = await fetch('/api/whatsapp/send-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: regPhone }),
      })
      const d = await r.json().catch(() => ({}))
      setNote(r.ok && d.success
        ? 'PIN выслан повторно в WhatsApp.'
        : `Не удалось выслать PIN${d.error ? ` (${d.error})` : ''}. Напишите менеджеру в WhatsApp.`)
    } catch {
      setNote('Сеть недоступна. Напишите менеджеру в WhatsApp.')
    }
  }

  const managerHref = `${WA}?text=${encodeURIComponent(`Не пришёл PIN для входа, номер ${regPhone || phone}`)}`

  const typeRow: React.CSSProperties = { display: 'flex', gap: 7, marginBottom: 15 }
  const typeBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, height: 42, borderRadius: 8, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-light)' : '#fff', color: active ? 'var(--accent)' : 'var(--ink-3)',
  })

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

            {step === 'form' && (
              <div>
                <div className={s.title}>Регистрация</div>
                <div className={s.lead}>Заполните форму — создадим доступ и пришлём PIN-код в WhatsApp. Вход — прямо здесь.</div>

                <div className={s.field}>
                  <label>Имя*</label>
                  <input type="text" autoComplete="name" placeholder="Как к вам обращаться"
                    value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className={s.field}>
                  <label>Телефон*</label>
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__"
                    value={phone} onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRegister()} />
                </div>
                <div className={s.field}>
                  <label>Название компании</label>
                  <input type="text" autoComplete="organization" placeholder="Необязательно"
                    value={companyName} onChange={e => setCompanyName(e.target.value)} />
                </div>
                <div className={s.field}>
                  <label>Тип</label>
                  <div style={typeRow}>
                    {TYPES.map(t => (
                      <button key={t} type="button" onClick={() => setType(t)} style={typeBtn(type === t)}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className={s.field}>
                  <label>Город</label>
                  <input type="text" autoComplete="address-level2" placeholder="Необязательно"
                    value={city} onChange={e => setCity(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRegister()} />
                </div>

                {error && <div className={s.err}>{error}</div>}
                {info && <div className={s.lead}>{info}</div>}
                <button className={s.submit} onClick={handleRegister} disabled={busy}>
                  {busy ? 'Регистрируем…' : <>Получить доступ<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></>}
                </button>

                <div className={s.rowBetween} style={{ marginTop: 16, justifyContent: 'center' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Уже есть доступ?&nbsp;</span>
                  <button className={s.flink} onClick={() => router.push('/login')}>Войти</button>
                </div>
                <div className={s.hint}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  <span>PIN-код приходит в WhatsApp на указанный номер. Его можно сменить в личном кабинете после входа.</span>
                </div>
              </div>
            )}

            {step === 'pin' && (
              <div>
                <div className={s.title}>Введите PIN из WhatsApp</div>
                <div className={s.lead}>{note}</div>
                <div className={`${s.field} ${s.pin}`}>
                  <label>PIN-код</label>
                  <input type="text" inputMode="numeric" maxLength={6} placeholder="••••••"
                    value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && handlePinLogin()} />
                </div>
                {pinError && <div className={s.err}>{pinError}</div>}
                <button className={s.submit} onClick={handlePinLogin} disabled={pinBusy}>
                  {pinBusy ? 'Входим…' : <>Войти<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg></>}
                </button>
                <div className={s.rowBetween} style={{ marginTop: 14 }}>
                  <button className={s.flink} onClick={resend}>Выслать повторно</button>
                  <a className={s.flink} href={managerHref} target="_blank" rel="noopener noreferrer">PIN не пришёл? Менеджер</a>
                </div>
                <div className={s.hint}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                  <span>PIN отправлен в WhatsApp{regPhone ? ` на ${regPhone}` : ''}. Не пришёл в течение минуты — нажмите «Выслать повторно» или напишите менеджеру.</span>
                </div>
              </div>
            )}

          </div>
        </div>
        <div className={s.foot}>Нужна помощь? <a href={WA} target="_blank" rel="noopener noreferrer">Напишите в WhatsApp</a></div>
      </div>
    </div>
  )
}
