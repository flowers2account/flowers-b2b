'use client'
import { useState, useRef, useCallback } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { normalizePhone } from '@/lib/phone'

type Screen = 'phone' | 'pin' | 'staff'

interface Props {
  onSuccess?: () => void
  onClose: () => void
}

function formatDisplay(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  const local = d.startsWith('7') ? d.slice(1) : d
  let r = '+7'
  if (local.length > 0) r += ` (${local.slice(0, 3)}`
  if (local.length >= 3) r += `) ${local.slice(3, 6)}`
  if (local.length >= 6) r += `-${local.slice(6, 8)}`
  if (local.length >= 8) r += `-${local.slice(8, 10)}`
  return r
}

const PIN_LEN = 6

export default function AuthModal({ onSuccess, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('phone')
  const [phoneDisplay, setPhoneDisplay] = useState('')

  const [pin, setPin] = useState(Array(PIN_LEN).fill(''))
  const [whatsappUrl, setWhatsappUrl] = useState('')
  const [clientName, setClientName] = useState('')
  const [staffPin, setStaffPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const pinRefs = Array.from({ length: PIN_LEN }, () => useRef<HTMLInputElement>(null)) // eslint-disable-line react-hooks/rules-of-hooks

  const { login } = useAuthStore()

  function handlePhoneInput(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 11)
    setPhoneDisplay(digits ? formatDisplay(digits) : '')
  }

  // ── Screen 1: Phone ───────────────────────────────────────────────

  async function handleCheckPhone() {
    setError('')
    let normalized: string
    try { normalized = normalizePhone(phoneDisplay) }
    catch { setError('Введите корректный номер телефона'); return }
    if (normalized.replace(/\D/g, '').length < 11) {
      setError('Введите полный номер телефона'); return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/send-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      })
      const data = await res.json()

      if (!res.ok || !data.exists) {
        setError(data.error || 'Номер не найден. Обратитесь к администратору.')
        return
      }

      setWhatsappUrl(data.whatsappUrl)
      setClientName(data.name || '')
      setScreen('pin')
      setTimeout(() => pinRefs[0].current?.focus(), 80)
    } catch {
      setError('Ошибка сервера. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
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

  // ── Screen 3: Staff PIN ───────────────────────────────────────────

  async function handleStaffLogin() {
    setLoading(true); setError('')
    const result = await login(phoneDisplay, staffPin)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    onSuccess?.(); onClose()
  }

  const BRAND: React.CSSProperties = { backgroundColor: 'var(--accent)' }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">

        <div className="flex items-center justify-between px-6 py-4 border-b">
          <span className="text-sm font-semibold text-gray-700">
            {screen === 'phone' && 'Вход в личный кабинет'}
            {screen === 'pin' && (clientName ? `Привет, ${clientName}!` : 'Введите PIN-код')}
            {screen === 'staff' && 'Вход для сотрудников'}
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
                  placeholder="+7 (700) 000-00-00"
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-pink-400 font-mono"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                onClick={handleCheckPhone}
                disabled={loading || phoneDisplay.replace(/\D/g, '').length < 11}
                className="w-full py-3 text-white font-medium rounded-lg transition disabled:opacity-50"
                style={BRAND}
              >
                {loading ? 'Проверяем...' : 'Войти'}
              </button>
              <button onClick={() => { setScreen('staff'); setError('') }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
                Вход для сотрудников
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

              {/* WhatsApp — optional, on demand, uses cached URL (no extra API call) */}
              {whatsappUrl && (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs text-gray-400 text-center">Не знаете PIN?</p>
                  <button
                    onClick={() => window.open(whatsappUrl, '_blank')}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white transition"
                    style={{ backgroundColor: '#25D366' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                    📱 Получить PIN в WhatsApp
                  </button>
                </div>
              )}

              <button
                onClick={() => { setScreen('phone'); setPin(Array(PIN_LEN).fill('')); setError('') }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                Изменить номер
              </button>
            </>
          )}

          {/* ── Экран 3: Персонал ─────────────────────────────── */}
          {screen === 'staff' && (
            <>
              <p className="text-sm text-gray-500">Менеджеры и администраторы — вход с постоянным PIN.</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Телефон</label>
                <input type="tel" value={phoneDisplay} onChange={e => handlePhoneInput(e.target.value)}
                  placeholder="+7 (700) 000-00-00" autoFocus
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-pink-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">PIN-код (6 цифр)</label>
                <input type="password" value={staffPin} onChange={e => setStaffPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => e.key === 'Enter' && handleStaffLogin()}
                  placeholder="••••••" maxLength={6}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-pink-400" />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-2">
                <button onClick={handleStaffLogin} disabled={loading || !staffPin}
                  className="flex-1 py-3 text-white font-medium rounded-lg disabled:opacity-50" style={BRAND}>
                  {loading ? 'Входим...' : 'Войти'}
                </button>
                <button onClick={() => { setScreen('phone'); setError('') }}
                  className="flex-1 py-3 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Назад
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
