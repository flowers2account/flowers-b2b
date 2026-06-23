'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { useWidget, getAnonId, type ChatMessage } from '@/lib/widget-store'
import { useAuthStore } from '@/lib/auth-store'
import { useCart } from '@/lib/cart-store'
import { useIsMobile } from '@/lib/use-mobile'
import { company } from '@/config/company'
import type { WidgetProduct } from '@/lib/bot/accessories-bot'
import ProductCard, { type CardProduct } from '@/components/widget/ProductCard'

const WA = `https://wa.me/${company.phone.replace(/\D/g, '')}`
// Акцентный шрифт виджета — Playfair Display (решение хэндоффа), фолбэк Lora→Georgia.
const PLAYFAIR = "var(--font-playfair), 'Playfair Display', 'Lora', Georgia, serif"
const FALLBACK_MANAGER =
  'С этим лучше поможет менеджер 🌸 Нажмите «Продолжить в WhatsApp» — ответим в рабочие часы.'
const STARTERS = ['Плёнка для букетов', 'Горшки и кашпо', 'Удобрения', 'Условия доставки']

// products[] из /api/chat → контракт карточки.
const toCard = (p: WidgetProduct): CardProduct => ({
  id: p.id, sku: p.sku, name: p.display_name ?? 'Товар', image: p.image_url,
  price: p.price, unit: p.unit, stock: p.qty ?? 0, pack: p.pack_size, url: p.url,
})

// Плоский текст: переносы строк + автолинк голых URL (markdown виджет не рендерит).
function renderText(text: string) {
  return text.split('\n').map((line, i) => (
    <span key={i} style={{ display: 'block' }}>
      {line.split(/(https?:\/\/\S+)/g).map((part, j) =>
        /^https?:\/\//.test(part) ? (
          <a key={j} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{part}</a>
        ) : (
          <span key={j}>{part}</span>
        ),
      )}
    </span>
  ))
}

const chipStyle: React.CSSProperties = {
  fontSize: 11.5, padding: '6px 11px', borderRadius: 999, border: '1px solid var(--accent-mid)',
  background: 'var(--accent-light)', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const cardWrap: React.CSSProperties = {
  width: '100%', background: 'linear-gradient(135deg,#FBF6F8,#F7EEF2)', border: '1px solid var(--accent-light)',
  borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
}
const fieldStyle: React.CSSProperties = {
  height: 36, border: '1px solid var(--border)', borderRadius: 9, padding: '0 10px',
  fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: '#fff', color: 'var(--text)', width: '100%',
}
const primaryBtn: React.CSSProperties = {
  height: 36, border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#fff',
  fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
}
const ghostBtn: React.CSSProperties = {
  height: 36, border: '1px solid var(--accent-mid)', borderRadius: 10, background: '#fff', color: 'var(--accent)',
  fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
}
const REG_TYPES = ['ИП', 'ТОО', 'Физлицо']

// Открыть форму в ленте. В ленте одновременно только одна форма (регистрация ИЛИ вход):
// повторный тап той же — no-op (ввод сохраняем), переключение — замена, без плодения.
function openFormOnce(kind: 'register-form' | 'login-form') {
  useWidget.getState().openForm(kind)
}

// Отражение диалога в amoCRM (Версия B Такт 1/1.5, односторонне). Шлём на закрытии
// виджета сводку: телефон + корзина. Сервер пишет в КОНТАКТ известного клиента или в
// ЛИД анонимного обращения (если он был создан). Гость без лида → сервер тихо пропускает.
function flushDialog(beacon: boolean) {
  if (typeof window === 'undefined') return
  const authed = useAuthStore.getState().isAuthed
  const ph = authed ? (useAuthStore.getState().phone ?? '') : ''
  const cart = useCart.getState().items.map((i) => ({ name: i.name, qty: i.qty }))
  const payload = JSON.stringify({ anon_id: getAnonId(), phone: ph, cart })
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/chat/flush', new Blob([payload], { type: 'application/json' }))
    } else {
      fetch('/api/chat/flush', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
    }
  } catch { /* ignore */ }
}

// Наджа: гость не может класть в корзину → быстрая регистрация (PIN в WhatsApp).
function NudgeCard() {
  return (
    <div style={cardWrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
        </span>
        <div style={{ fontFamily: PLAYFAIR, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Зарегистрируйтесь, чтобы покупать</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.4 }}>Доступ к корзине и заказам — после быстрой регистрации, PIN придёт в WhatsApp.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => openFormOnce('register-form')} style={{ ...primaryBtn, flex: 1 }}>Зарегистрироваться</button>
        <button onClick={() => openFormOnce('login-form')} style={{ ...ghostBtn, flex: 1 }}>Уже есть доступ — войти</button>
      </div>
    </div>
  )
}

// Форма регистрации прямо в ленте (без ухода на /register).
function RegisterForm() {
  const { addMessage, setRegPhone } = useWidget()
  const [f, setF] = useState({ name: '', phone: '', company: '', type: 'ИП', city: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    setErr('')
    if (!f.name.trim()) { setErr('Укажите имя'); return }
    const digits = f.phone.replace(/\D/g, '')
    if (!/^[78]\d{10}$/.test(digits)) { setErr('Телефон в формате +7XXXXXXXXXX'); return }
    const normalized = '+7' + digits.slice(1)
    setBusy(true)
    try {
      const r = await fetch('/api/auth/self-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, phone: f.phone, company_name: f.company, client_type: f.type, city: f.city, anon_id: getAnonId() }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.alreadyExists) {
        setDone(true); setRegPhone(normalized)
        addMessage({ role: 'bot', text: 'На этот номер уже есть доступ 🌸 Введите PIN из WhatsApp, чтобы войти, или вышлите код повторно.', kind: 'pin-entry' })
        return
      }
      if (d.ok) {
        setDone(true); setRegPhone(d.phone || normalized)
        if (d.delivered) addMessage({ role: 'bot', text: `Готово! PIN отправлен в WhatsApp на ${d.phone}. Введите его ниже, чтобы войти.`, kind: 'pin-entry' })
        else addMessage({ role: 'bot', text: `Аккаунт создан, но PIN не удалось отправить в WhatsApp на ${d.phone}. Менеджер свяжется и вышлет код.` })
        return
      }
      setErr(d.error || 'Не удалось зарегистрировать. Попробуйте позже.')
    } catch {
      setErr('Сеть недоступна, попробуйте ещё раз.')
    } finally { setBusy(false) }
  }

  return (
    <div style={cardWrap}>
      <div style={{ fontFamily: PLAYFAIR, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Регистрация</div>
      <input style={fieldStyle} placeholder="Имя*" value={f.name} onChange={(e) => set('name', e.target.value)} disabled={done} />
      <input style={fieldStyle} placeholder="Телефон* +7XXXXXXXXXX" value={f.phone} onChange={(e) => set('phone', e.target.value)} disabled={done} inputMode="tel" />
      <input style={fieldStyle} placeholder="Название компании" value={f.company} onChange={(e) => set('company', e.target.value)} disabled={done} />
      <div style={{ display: 'flex', gap: 6 }}>
        {REG_TYPES.map((t) => (
          <button key={t} onClick={() => set('type', t)} disabled={done}
            style={{ flex: 1, height: 32, borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: done ? 'default' : 'pointer', fontFamily: 'inherit',
              border: `1px solid ${f.type === t ? 'var(--accent)' : 'var(--border)'}`, background: f.type === t ? 'var(--accent-light)' : '#fff', color: f.type === t ? 'var(--accent)' : 'var(--text-mid)' }}>
            {t}
          </button>
        ))}
      </div>
      <input style={fieldStyle} placeholder="Город" value={f.city} onChange={(e) => set('city', e.target.value)} disabled={done} />
      {err && <div style={{ fontSize: 11.5, color: '#C0392B' }}>{err}</div>}
      {!done && <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Отправляем…' : 'Получить доступ'}</button>}
    </div>
  )
}

// Вход для существующего клиента прямо в чате: телефон → высылаем PIN → pin-entry.
// Никакого ухода на /login.
function LoginForm() {
  const { setRegPhone, addMessage } = useWidget()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    setErr('')
    const digits = phone.replace(/\D/g, '')
    if (!/^[78]\d{10}$/.test(digits)) { setErr('Телефон в формате +7XXXXXXXXXX'); return }
    const normalized = '+7' + digits.slice(1)
    setBusy(true)
    try {
      const r = await fetch('/api/whatsapp/send-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.success) {
        setDone(true); setRegPhone(normalized)
        addMessage({ role: 'bot', kind: 'pin-entry', text: `PIN отправлен в WhatsApp на ${normalized}. Введите его ниже, чтобы войти.` })
        return
      }
      if (r.status === 404) { setErr('На этот номер ещё нет доступа. Нажмите «Зарегистрироваться».'); return }
      setErr(d.error || 'Не удалось выслать PIN. Попробуйте позже или напишите менеджеру.')
    } catch {
      setErr('Сеть недоступна, попробуйте ещё раз.')
    } finally { setBusy(false) }
  }

  if (done) return null
  return (
    <div style={cardWrap}>
      <div style={{ fontFamily: PLAYFAIR, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Вход по PIN</div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.4 }}>Введите телефон — вышлем PIN в WhatsApp, войдёте прямо здесь.</div>
      <input style={fieldStyle} placeholder="Телефон +7XXXXXXXXXX" value={phone}
        onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} inputMode="tel" />
      {err && <div style={{ fontSize: 11.5, color: '#C0392B' }}>{err}</div>}
      <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Высылаем PIN…' : 'Выслать PIN'}</button>
    </div>
  )
}

// Ввод PIN из WhatsApp → вход прямо в чате; pending-товар кладётся в корзину.
function PinEntry() {
  const { regPhone, pendingAdd, setPendingAdd, addMessage } = useWidget()
  const { add, update } = useCart()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const doLogin = async () => {
    setErr('')
    if (!/^\d{6}$/.test(pin)) { setErr('PIN — 6 цифр'); return }
    if (!regPhone) { setErr('Телефон не найден, начните заново'); return }
    setBusy(true)
    const { error } = await useAuthStore.getState().login(regPhone, pin)
    setBusy(false)
    if (error) { setErr(error); return }
    setDone(true)
    let note = 'Вы вошли 🌸 Корзина и заказы доступны.'
    if (pendingAdd) {
      add({ id: pendingAdd.id, name: pendingAdd.name, price: pendingAdd.price, available: pendingAdd.available, category: 'accessories', image_url: pendingAdd.image, unit: pendingAdd.unit, subcategory: null, color: null })
      update(pendingAdd.id, pendingAdd.pack && pendingAdd.pack > 1 ? pendingAdd.pack : 1, null)
      note = `Вы вошли 🌸 «${pendingAdd.name}» добавлен в корзину.`
      setPendingAdd(null)
    }
    addMessage({ role: 'system', text: note })
  }
  // Honest resend: Umnico подтверждает только ОТПРАВКУ, не доставку → сообщаем реальный
  // ответ роута, не врём «доставлено». На неуспех — зовём к менеджеру.
  const resend = async () => {
    if (!regPhone) return
    try {
      const r = await fetch('/api/whatsapp/send-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: regPhone }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.success) addMessage({ role: 'system', text: 'PIN выслан повторно в WhatsApp.' })
      else addMessage({ role: 'system', text: `Не удалось выслать PIN${d.error ? ` (${d.error})` : ''}. Напишите менеджеру в WhatsApp.` })
    } catch {
      addMessage({ role: 'system', text: 'Сеть недоступна. Напишите менеджеру в WhatsApp.' })
    }
  }

  // Ручной выход к живому человеку — на случай, когда PIN не дошёл (доставку Umnico
  // не гарантирует). Предзаполняем номер клиента в тексте.
  const managerHref = `${WA}?text=${encodeURIComponent(`Не пришёл PIN для входа, номер ${regPhone ?? ''}`)}`

  if (done) return null
  return (
    <div style={cardWrap}>
      <div style={{ fontFamily: PLAYFAIR, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Введите PIN из WhatsApp</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-mid)', lineHeight: 1.4 }}>
        PIN отправлен в WhatsApp{regPhone ? ` на ${regPhone}` : ''}. Не пришёл в течение минуты — нажмите «Выслать повторно» или напишите менеджеру.
      </div>
      <input style={{ ...fieldStyle, letterSpacing: '0.3em', textAlign: 'center', fontSize: 16 }} placeholder="••••••" value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => { if (e.key === 'Enter') doLogin() }} inputMode="numeric" />
      {err && <div style={{ fontSize: 11.5, color: '#C0392B' }}>{err}</div>}
      <button onClick={doLogin} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Входим…' : 'Войти'}</button>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={resend} style={{ ...ghostBtn, flex: 1, fontSize: 11.5 }}>Выслать повторно</button>
        <a href={managerHref} target="_blank" rel="noopener noreferrer"
          style={{ ...ghostBtn, flex: 1, fontSize: 11.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          PIN не пришёл? Менеджер
        </a>
      </div>
    </div>
  )
}

// Захват телефона ЗАСТРЯВШЕГО гостя (Версия B Такт 1.5): бот не смог помочь → оставьте
// номер, менеджер подберёт и свяжется. Это НЕ регистрация (без PIN) — просто контакт.
function PhoneCaptureForm() {
  const { addMessage } = useWidget()
  const [f, setF] = useState({ name: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    setErr('')
    const digits = f.phone.replace(/\D/g, '')
    if (!/^[78]\d{10}$/.test(digits)) { setErr('Телефон в формате +7XXXXXXXXXX'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/chat/leave-phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: f.phone, name: f.name, anon_id: getAnonId() }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) {
        setDone(true)
        addMessage({ role: 'system', text: 'Спасибо! Менеджер свяжется с вами в рабочие часы 🌸' })
        return
      }
      setErr(d.error || 'Не удалось отправить. Попробуйте позже или напишите менеджеру.')
    } catch {
      setErr('Сеть недоступна, попробуйте ещё раз.')
    } finally { setBusy(false) }
  }

  if (done) return null
  return (
    <div style={cardWrap}>
      <div style={{ fontFamily: PLAYFAIR, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Оставьте номер — менеджер подберёт</div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.4 }}>Не нашёл точного ответа. Оставьте телефон — менеджер подберёт нужное и свяжется с вами.</div>
      <input style={fieldStyle} placeholder="Имя" value={f.name} onChange={(e) => set('name', e.target.value)} />
      <input style={fieldStyle} placeholder="Телефон* +7XXXXXXXXXX" value={f.phone} onChange={(e) => set('phone', e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }} inputMode="tel" />
      {err && <div style={{ fontSize: 11.5, color: '#C0392B' }}>{err}</div>}
      <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Отправляем…' : 'Жду звонка менеджера'}</button>
    </div>
  )
}

function Bubble({ m, onAdded, onChip, onGuestAdd }: { m: ChatMessage; onAdded: () => void; onChip: (c: string) => void; onGuestAdd: (p: CardProduct) => void }) {
  // Интерактивные блоки регистрации.
  if (m.kind === 'register-form') return <div style={{ width: '100%' }}><RegisterForm /></div>
  if (m.kind === 'login-form') return <div style={{ width: '100%' }}><LoginForm /></div>
  if (m.kind === 'pin-entry') return <div style={{ width: '100%' }}><PinEntry /></div>
  if (m.kind === 'phone-capture') return <div style={{ width: '100%' }}><PhoneCaptureForm /></div>
  // Служебная подсказка в ленте — по центру, мелким серым.
  if (m.role === 'system') {
    return <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-mid)', padding: '2px 0' }}>{m.text}</div>
  }
  const isUser = m.role === 'user'
  const products = m.products ?? []
  const single = products.length === 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 7, maxWidth: '100%' }}>
      {!!m.text && (
        <div style={{
          maxWidth: '85%', padding: '9px 12px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.4,
          background: isUser ? 'var(--accent)' : 'var(--bg2)', color: isUser ? '#fff' : 'var(--text)',
          borderBottomRightRadius: isUser ? 3 : 12, borderBottomLeftRadius: isUser ? 12 : 3, whiteSpace: 'pre-wrap',
        }}>
          {renderText(m.text)}
        </div>
      )}
      {/* 1 товар → Full; несколько → Mini-карусель со scroll-snap */}
      {single ? (
        <div style={{ width: '100%', maxWidth: 320 }}>
          <ProductCard p={toCard(products[0])} density="full" onAdded={onAdded} onGuestAdd={onGuestAdd} />
        </div>
      ) : products.length > 1 ? (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 1px 4px', scrollSnapType: 'x mandatory', scrollbarWidth: 'thin' }}>
            {products.slice(0, 12).map((p) => <ProductCard key={p.id} p={toCard(p)} density="mini" onAdded={onAdded} onGuestAdd={onGuestAdd} />)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-mid)', marginTop: 2 }}>листайте →</div>
        </div>
      ) : null}
      {/* Чипы-уточнения — клик отправляет вариант как сообщение */}
      {!!m.chips?.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 1 }}>
          {m.chips.map((c) => <button key={c} onClick={() => onChip(c)} style={chipStyle}>{c}</button>)}
        </div>
      )}
      {/* Наджа гостю (цены/наличие под PIN) */}
      {m.nudge && <NudgeCard />}
    </div>
  )
}

function Typing() {
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 12, borderBottomLeftRadius: 3 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-mid)', animation: `aiwBlink 1s ${i * 0.2}s infinite` }} />
      ))}
      <style>{`@keyframes aiwBlink{0%,60%,100%{opacity:.3}30%{opacity:1}}`}</style>
    </div>
  )
}

export default function AiWidget() {
  const { open, messages, pending, greeted, setOpen, toggle, addMessage, setPending, markGreeted, setPendingAdd } = useWidget()
  const { isAuthed, phone } = useAuthStore()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const [input, setInput] = useState('')
  const [tip, setTip] = useState(false)   // подсказка-пузырь у FAB
  const scrollRef = useRef<HTMLDivElement>(null)

  // На оформлении не мешаем: панель не открываем, кнопку приглушаем.
  const subdued = pathname?.startsWith('/checkout') ?? false

  // Пузырь-подсказка у FAB — один раз за сессию, через короткую задержку, закрытие запоминаем.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (open || subdued) return
    if (sessionStorage.getItem('aiw_tip_dismissed')) return
    const t = setTimeout(() => setTip(true), 1500)
    return () => clearTimeout(t)
  }, [open, subdued])
  const dismissTip = () => { setTip(false); try { sessionStorage.setItem('aiw_tip_dismissed', '1') } catch {} }

  // Приветствие при первом открытии. Залогинен → по имени (имя тянем с /api/me, в
  // useAuthStore его нет) + строка про оптовые цены. Гость → без имени.
  useEffect(() => {
    if (!(open && !greeted && messages.length === 0)) return
    markGreeted()
    const guestText = 'Здравствуйте! Я ИИ-помощник «Цветы Уральска», на связи 24/7 🌸 Помогу с расходкой и сайтом. По цветам и заказам — менеджер в рабочие часы.'
    const authedDefault = 'Рады видеть снова! 🌸 Я ИИ-помощник «Цветы Уральска». Ваши оптовые цены и наличие уже доступны — подскажу по расходке и работе сайта.'
    if (!isAuthed || !phone) { addMessage({ role: 'bot', text: guestText }); return }
    let cancelled = false
    fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) })
      .then((r) => r.json()).then((d) => {
        if (cancelled) return
        const nm = typeof d?.name === 'string' ? d.name.trim() : ''
        addMessage({
          role: 'bot',
          text: nm
            ? `Рады видеть, ${nm}! 🌸 Я ИИ-помощник «Цветы Уральска». Ваши оптовые цены и наличие уже доступны — подскажу по расходке и работе сайта.`
            : authedDefault,
        })
      })
      .catch(() => { if (!cancelled) addMessage({ role: 'bot', text: authedDefault }) })
    return () => { cancelled = true }
  }, [open, greeted, messages.length, isAuthed, phone, addMessage, markGreeted])

  // Автоскролл вниз.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [open, messages, pending])

  // Отражение диалога в amoCRM при уходе со страницы (закрытие вкладки/навигация).
  useEffect(() => {
    const h = () => flushDialog(true)
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  async function send(text: string) {
    const t = text.trim()
    if (!t || pending) return
    setInput('')
    const prior = useWidget.getState().messages
      .filter((m) => m.role !== 'system')   // служебные подсказки не уходят в контекст бота
      .map((m) => ({ role: m.role === 'user' ? 'client' : 'bot', text: m.text }))
    addMessage({ role: 'user', text: t })
    setPending(true)
    const payload = JSON.stringify({ message: t, history: prior, anon_id: getAnonId(), phone: isAuthed ? (phone ?? '') : '' })
    const postChat = async () => {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      return r.json().catch(() => ({} as any))
    }
    try {
      // Одна повторная попытка на сетевой сбой (часто это редеплой/перезапуск в момент запроса).
      let d: any
      try { d = await postChat() }
      catch { await new Promise((res) => setTimeout(res, 700)); d = await postChat() }
      const products = d?.products as WidgetProduct[] | undefined
      const chips = Array.isArray(d?.chips) ? (d.chips as string[]) : undefined
      addMessage({ role: 'bot', text: (d?.text as string) || FALLBACK_MANAGER, products, chips })
      // Правило: явный вопрос про регистрацию/вход → открыть форму в чате (только гостю).
      if ((d?.action === 'register' || d?.action === 'login') && !isAuthed) {
        useWidget.getState().openForm(d.action === 'register' ? 'register-form' : 'login-form')
      }
      // Бот не смог помочь гостю (ask_phone) → предлагаем оставить телефон (1×/сессию).
      if (d?.ask_phone && !isAuthed && !useWidget.getState().phoneAsked) {
        useWidget.getState().markPhoneAsked()
        addMessage({ role: 'bot', kind: 'phone-capture', text: '' })
      }
    } catch {
      // Сетевой сбой даже после повтора — мягко, без «не получилось ответить».
      addMessage({ role: 'bot', text: 'Похоже, связь на секунду прервалась 🌸 Повторите вопрос, пожалуйста, или напишите менеджеру в WhatsApp.' })
    } finally {
      setPending(false)
    }
  }

  // «В корзину» из карточки → тост + служебная подсказка в ленте (счётчик корзины сайта
  // обновляется сам, cart-store общий).
  function onAdded() {
    const n = useCart.getState().items.length
    const w = n % 10 === 1 && n % 100 !== 11 ? 'товар'
      : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'товара' : 'товаров'
    toast.success('Добавлено в корзину')
    addMessage({ role: 'system', text: `Добавлено · в корзине ${n} ${w}` })
  }

  // Гость жмёт «В корзину» → запоминаем товар и показываем наджу-регистрацию.
  function onGuestAdd(p: CardProduct) {
    setPendingAdd({ id: p.id, name: p.name, price: p.price ?? 0, available: p.stock, pack: p.pack, image: p.image, unit: p.unit })
    addMessage({ role: 'bot', nudge: true, text: '' })
  }

  // ── Плавающая кнопка + пузырь-подсказка ──
  const fabBottom = isMobile ? 76 : 24   // на мобиле над таб-баром
  const fab = !open && (
    <div style={{ position: 'fixed', right: isMobile ? 16 : 24, bottom: fabBottom, zIndex: 2147483000, display: 'flex', alignItems: 'flex-end', gap: 10, opacity: subdued ? 0.45 : 1, transition: 'opacity .2s' }}>
      {/* Подсказка слева от FAB */}
      {tip && !isMobile && (
        <div style={{ position: 'relative', maxWidth: 220, background: '#fff', borderRadius: 14, boxShadow: '0 8px 26px rgba(28,18,22,.18)', border: '1px solid var(--border)', padding: '10px 30px 10px 12px', marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>Помогу подобрать товар и собрать заказ</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-mid)', marginTop: 2 }}>ИИ-помощник · отвечает 24/7</div>
          <button onClick={dismissTip} aria-label="Закрыть" style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, border: 'none', background: 'transparent', color: 'var(--text-mid)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
          {/* хвостик-стрелка */}
          <div style={{ position: 'absolute', right: -6, bottom: 14, width: 12, height: 12, background: '#fff', borderRight: '1px solid var(--border)', borderTop: '1px solid var(--border)', transform: 'rotate(45deg)' }} />
        </div>
      )}
      <button
        onClick={() => { dismissTip(); toggle() }}
        aria-label="Чат с ИИ-консультантом"
        style={{
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: '#fff', boxShadow: '0 8px 24px rgba(139,58,90,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    </div>
  )

  // На /checkout панель не показываем (приглушено).
  const showPanel = open && !subdued
  const panelW = 380
  const panel = showPanel && (
    <div
      style={{
        position: 'fixed', zIndex: 2147483000,
        ...(isMobile
          ? { inset: 0 }
          : { right: 24, bottom: 24, width: panelW, height: 'min(620px, 80vh)', borderRadius: 16 }),
        background: 'var(--bg)', boxShadow: '0 20px 60px rgba(28,18,22,0.28)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: isMobile ? 'none' : '1px solid var(--border)',
      }}
    >
      {/* Шапка */}
      <div style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep, #6E2A45))', color: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', background: '#fff', overflow: 'hidden', flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,.06)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-official.png" alt="Цветы Уральска" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* онлайн-точка */}
          <span style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', background: '#5ED39A', border: '2px solid var(--accent)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: PLAYFAIR, fontWeight: 600, fontSize: 16, lineHeight: 1.1 }}>ИИ-помощник</span>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', padding: '1px 5px', borderRadius: 5, background: 'rgba(255,255,255,.22)', color: '#fff' }}>AI</span>
          </div>
          <div style={{ fontSize: 10.5, opacity: .85 }}>Цветы Уральска · {isAuthed ? 'на связи 24/7' : 'гость'}</div>
        </div>
        <a href={WA} target="_blank" rel="noopener noreferrer" title="Продолжить в WhatsApp"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.46 14.27c-.24.65-1.39 1.25-1.93 1.33-.49.07-1.12.1-1.81-.11-.42-.13-.95-.31-1.64-.6-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.55-1.17-2.96s.74-2.1 1-2.39c.26-.29.57-.36.76-.36s.38 0 .55.01c.18 0 .41-.07.65.49.24.58.81 2 .88 2.15.07.14.12.31.02.5-.09.19-.14.3-.28.46-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.18 1.53 1.91 1.05.94 1.94 1.23 2.21 1.37.28.14.43.12.59-.07.16-.19.68-.79.86-1.07.18-.27.36-.23.61-.14.25.1 1.59.75 1.86.89.28.14.46.21.53.32.07.12.07.66-.18 1.3z" /></svg>
        </a>
        <button onClick={() => { flushDialog(false); setOpen(false) }} aria-label="Свернуть" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>

      {/* Гостю — постоянная аннотация: акцент на регистрации (разблокирует корзину/заказы) */}
      {!isAuthed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--accent-light)', borderBottom: '1px solid var(--accent-mid)' }}>
          <span style={{ flex: 1, fontSize: 11.5, lineHeight: 1.35, color: 'var(--accent-deep, #6E2A45)' }}>
            🔓 Пройдите регистрацию, чтобы разблокировать корзину и заказы — займёт минуту.
          </span>
          <button onClick={() => openFormOnce('register-form')} style={{ ...primaryBtn, height: 28, fontSize: 11, padding: '0 11px', flexShrink: 0 }}>Регистрация</button>
        </div>
      )}

      {/* Сообщения */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg)' }}>
        {messages.map((m) => <Bubble key={m.id} m={m} onAdded={onAdded} onChip={send} onGuestAdd={onGuestAdd} />)}
        {pending && <Typing />}
      </div>

      {/* Стартовые чипы: гостю — регистрация/вход (акцент); клиенту — категории товаров */}
      {messages.length <= 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '0 12px 8px', flexWrap: 'wrap' }}>
          {isAuthed ? (
            STARTERS.map((c, i) => (
              <button key={c} onClick={() => send(c)} disabled={pending} style={chipStyle}>
                {i === 0 ? '✨ ' : ''}{c}
              </button>
            ))
          ) : (
            <>
              <button onClick={() => openFormOnce('register-form')} style={chipStyle}>✨ Зарегистрироваться</button>
              <button onClick={() => openFormOnce('login-form')} style={chipStyle}>Войти по PIN</button>
              <button onClick={() => send('Условия доставки')} disabled={pending} style={chipStyle}>Условия доставки</button>
            </>
          )}
        </div>
      )}

      {/* Ввод + микрокопия */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 10px 8px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
            placeholder="Спросите про товар или сайт…"
            style={{ flex: 1, height: 40, border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', padding: '0 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', color: 'var(--text)' }}
          />
          <button onClick={() => send(input)} disabled={pending || !input.trim()} aria-label="Отправить"
            style={{ width: 40, height: 40, borderRadius: 'var(--radius-btn)', border: 'none', cursor: pending || !input.trim() ? 'default' : 'pointer', background: 'var(--accent)', color: '#fff', opacity: pending || !input.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </button>
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--text-tertiary, #9CA3AF)', textAlign: 'center', marginTop: 6 }}>
          ИИ может ошибаться · наличие подтверждается в корзине
        </div>
      </div>
    </div>
  )

  return (<>{fab}{panel}</>)
}
