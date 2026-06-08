'use client'
import { useState, useRef, useCallback } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { normalizePhone } from '@/lib/phone'

type Screen = 'phone' | 'pin'

interface Props {
  onSuccess?: () => void
  onClose: () => void
}


const PIN_LEN = 6

export default function AuthModal({ onSuccess, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('phone')
  const [phoneDisplay, setPhoneDisplay] = useState('')

  const [pin, setPin] = useState(Array(PIN_LEN).fill(''))
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [criticalError, setCriticalError] = useState<{ title: string; message: string } | null>(null)
  const [sendingPin, setSendingPin] = useState(false)
  const [pinSentMessage, setPinSentMessage] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [notFoundName, setNotFoundName] = useState('')

  const pinRefs = Array.from({ length: PIN_LEN }, () => useRef<HTMLInputElement>(null)) // eslint-disable-line react-hooks/rules-of-hooks

  const { login } = useAuthStore()

  function handlePhoneInput(raw: string) {
    // Свободный ввод — только убираем лишние символы, оставляем + в начале
    const cleaned = raw.startsWith('+')
      ? '+' + raw.slice(1).replace(/\D/g, '').slice(0, 15)
      : raw.replace(/\D/g, '').slice(0, 15)
    setPhoneDisplay(cleaned)
    if (notFound) setNotFound(false)
  }

  // ── Screen 1: Phone ───────────────────────────────────────────────

  async function handleCheckPhone() {
    setError('')
    setCriticalError(null)
    setNotFound(false)
    let normalized: string
    try { normalized = normalizePhone(phoneDisplay) }
    catch { setError('Введите корректный номер телефона'); return }
    if (normalized.replace(/\D/g, '').length < 11 || normalized.replace(/\D/g, '').length > 15) {
      setError('Введите корректный номер телефона'); return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/send-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      })
      const data = await res.json()

      if (data.exists) {
        setClientName(data.name || '')
        setScreen('pin')
        setTimeout(() => pinRefs[0].current?.focus(), 80)
      } else if (data.error?.includes('PIN')) {
        // Client found but PIN not set — show actionable modal
        setCriticalError({
          title: 'PIN-код не установлен',
          message: 'Ваш аккаунт найден, но PIN-код ещё не создан.\nПожалуйста, свяжитесь с администратором для активации доступа.',
        })
      } else {
        // Номер не найден в базе → предложить написать в WhatsApp (самрегистрация отключена)
        setNotFound(true)
      }
    } catch {
      setError('Ошибка сервера. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendPinViaWhatsApp() {
    setSendingPin(true)
    setPinSentMessage('')
    setError('')
    try {
      let normalized: string
      try { normalized = normalizePhone(phoneDisplay) } catch { return }
      const res = await fetch('/api/whatsapp/send-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      })
      const data = await res.json()
      if (data.success) {
        setPinSentMessage('✅ PIN отправлен в ваш WhatsApp')
        setTimeout(() => setPinSentMessage(''), 8000)
      } else {
        setError(data.error || 'Ошибка отправки')
      }
    } catch {
      setError('Ошибка соединения')
    } finally {
      setSendingPin(false)
    }
  }

  // ── Screen 2: PIN input ───────────────────────────────────────────

  const verifyPin = useCallback(async (digits: string[]) => {
    const code = digits.join('')
    if (code.length !== PIN_LEN) return
    setLoading(true)
    setError('')
    const result = await login(phoneDisplay, code)
    setLoading(false)
    if (result.error) {
      setError('Неверный PIN-код.')
      setPin(Array(PIN_LEN).fill(''))
      setTimeout(() => pinRefs[0].current?.focus(), 80)
    } else {
      onSuccess?.()
      onClose()
    }
  }, [login, phoneDisplay, onSuccess, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePinChange(i: number, val: string) {
    if (!/^\d*$/.test(val)) return
    const next = [...pin]
    next[i] = val.slice(-1)
    setPin(next)
    if (val && i < PIN_LEN - 1) pinRefs[i + 1].current?.focus()
    if (val && i === PIN_LEN - 1 && next.every(d => d)) verifyPin(next)
  }

  function handlePinKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[i] && i > 0) pinRefs[i - 1].current?.focus()
  }

  function handlePinPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LEN)
    if (text.length === PIN_LEN) {
      e.preventDefault()
      const next = text.split('')
      setPin(next)
      pinRefs[PIN_LEN - 1].current?.focus()
      setTimeout(() => verifyPin(next), 50)
    }
  }

  const BRAND: React.CSSProperties = { backgroundColor: 'var(--accent)' }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">

        <div className="flex items-center justify-between px-6 py-4 border-b">
          <span className="text-sm font-semibold text-gray-700">
            {screen === 'phone' && 'Вход в личный кабинет'}
            {screen === 'pin' && (clientName ? `Привет, ${clientName}!` : 'Введите PIN-код')}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ── Экран 1: Телефон ──────────────────────────────── */}
          {screen === 'phone' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Номер телефона</label>
                <input
                  type="tel"
                  value={phoneDisplay}
                  onChange={e => handlePhoneInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCheckPhone()}
                  placeholder="+77001234567"
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-pink-400 font-mono"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}

              {notFound && (
                <div className="p-3 rounded-lg" style={{ background: '#FFF8E1', border: '1px solid #FCE8B2' }}>
                  <p className="text-sm text-gray-700 mb-1">Номер не найден в системе.</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Напишите нам в WhatsApp — добавим вас в базу и вышлем PIN-код.
                  </p>
                  <input
                    type="text"
                    value={notFoundName}
                    onChange={e => setNotFoundName(e.target.value)}
                    placeholder="Ваше имя"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-pink-400"
                  />
                  <a
                    href={`https://wa.me/77007575243?text=${encodeURIComponent('Здравствуйте! Хочу добавиться в базу. Имя: ' + (notFoundName || '—') + '. Мой номер: ' + (phoneDisplay || ''))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white no-underline"
                    style={{ backgroundColor: '#25D366' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                    Написать в WhatsApp
                  </a>
                </div>
              )}

              <button
                onClick={handleCheckPhone}
                disabled={loading || phoneDisplay.replace(/\D/g, '').length < 10}
                className="w-full py-3 text-white font-medium rounded-lg transition disabled:opacity-50"
                style={BRAND}
              >
                {loading ? 'Проверяем...' : 'Войти'}
              </button>
            </>
          )}

          {/* ── Экран 2: PIN ──────────────────────────────────── */}
          {screen === 'pin' && (
            <>
              <p className="text-sm text-gray-500 text-center">
                Введите ваш 6-значный PIN-код
              </p>

              {/* 6 PIN boxes */}
              <div className="flex justify-center gap-2 my-1">
                {pin.map((digit, i) => (
                  <input
                    key={i}
                    ref={pinRefs[i]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handlePinChange(i, e.target.value)}
                    onKeyDown={e => handlePinKeyDown(i, e)}
                    onPaste={handlePinPaste}
                    disabled={loading}
                    className="w-11 h-11 text-center text-xl font-bold border-2 rounded-xl focus:outline-none transition"
                    style={{ borderColor: digit ? 'var(--accent)' : '#D1D5DB' }}
                  />
                ))}
              </div>

              {error && <p className="text-red-500 text-sm text-center">{error}</p>}

              <button
                onClick={() => verifyPin(pin)}
                disabled={loading || pin.join('').length !== PIN_LEN}
                className="w-full py-3 text-white font-medium rounded-lg disabled:opacity-50"
                style={BRAND}
              >
                {loading ? 'Входим...' : 'Войти'}
              </button>

              {/* WhatsApp — send PIN directly via Umnico API */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-gray-400 text-center">Не знаете PIN?</p>
                {pinSentMessage ? (
                  <p className="text-sm text-green-700 text-center bg-green-50 border border-green-200 rounded-lg py-2 px-3">
                    {pinSentMessage}
                  </p>
                ) : (
                  <button
                    onClick={handleSendPinViaWhatsApp}
                    disabled={sendingPin}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-50"
                    style={{ backgroundColor: '#25D366' }}
                  >
                    {sendingPin ? (
                      'Отправка...'
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        Получить PIN в WhatsApp
                      </>
                    )}
                  </button>
                )}
              </div>

              <button
                onClick={() => { setScreen('phone'); setPin(Array(PIN_LEN).fill('')); setError('') }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                Изменить номер
              </button>
            </>
          )}

        </div>
      </div>

      {/* ── Critical error overlay (e.g. PIN not set) ──────── */}
      {criticalError && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{criticalError.title}</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line">{criticalError.message}</p>
            </div>

            <div className="space-y-2.5">
              <a
                href={`https://wa.me/77476108458?text=${encodeURIComponent(`Здравствуйте! Мне нужно активировать PIN-код для входа в каталог.\n\nМой телефон: ${phoneDisplay}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#25D366] text-white rounded-lg text-sm font-medium hover:bg-[#1EBE5E] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                Написать в WhatsApp
              </a>

              <button
                onClick={() => {
                  setCriticalError(null)
                  setPhoneDisplay('')
                  setError('')
                }}
                className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Понятно
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center mt-4">
              Администратор создаст PIN-код в течение нескольких минут
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
