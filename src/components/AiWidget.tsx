'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { useWidget, type ChatMessage } from '@/lib/widget-store'
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

function Bubble({ m, onAdded }: { m: ChatMessage; onAdded: () => void }) {
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
          <ProductCard p={toCard(products[0])} density="full" onAdded={onAdded} />
        </div>
      ) : products.length > 1 ? (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 1px 4px', scrollSnapType: 'x mandatory', scrollbarWidth: 'thin' }}>
            {products.slice(0, 12).map((p) => <ProductCard key={p.id} p={toCard(p)} density="mini" onAdded={onAdded} />)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-mid)', marginTop: 2 }}>листайте →</div>
        </div>
      ) : null}
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
  const { open, messages, pending, greeted, setOpen, toggle, addMessage, setPending, markGreeted } = useWidget()
  const { isAuthed } = useAuthStore()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // На оформлении не мешаем: панель не открываем, кнопку приглушаем.
  const subdued = pathname?.startsWith('/checkout') ?? false

  // Приветствие при первом открытии.
  useEffect(() => {
    if (open && !greeted && messages.length === 0) {
      markGreeted()
      addMessage({
        role: 'bot',
        text: isAuthed
          ? 'Здравствуйте! Рады видеть снова 🌸 Я ИИ-помощник «Цветы Уральска». Подскажу по расходке — упаковка, горшки, удобрения, и по работе сайта.'
          : 'Здравствуйте! Я ИИ-помощник «Цветы Уральска», на связи 24/7 🌸 Помогу с расходкой и сайтом. По цветам и заказам — менеджер в рабочие часы.',
      })
    }
  }, [open, greeted, messages.length, isAuthed, addMessage, markGreeted])

  // Автоскролл вниз.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [open, messages, pending])

  async function send(text: string) {
    const t = text.trim()
    if (!t || pending) return
    setInput('')
    const prior = useWidget.getState().messages
      .filter((m) => m.role !== 'system')   // служебные подсказки не уходят в контекст бота
      .map((m) => ({ role: m.role === 'user' ? 'client' : 'bot', text: m.text }))
    addMessage({ role: 'user', text: t })
    setPending(true)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: t, history: prior }),
      })
      const d = await r.json().catch(() => ({}))
      addMessage({ role: 'bot', text: (d?.text as string) || FALLBACK_MANAGER, products: d?.products })
    } catch {
      addMessage({ role: 'bot', text: 'Не получилось ответить, попробуйте ещё раз или напишите менеджеру.' })
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

  // ── Плавающая кнопка ──
  const fabBottom = isMobile ? 76 : 24   // на мобиле над таб-баром
  const fab = (
    <button
      onClick={toggle}
      aria-label="Чат с ИИ-консультантом"
      style={{
        position: 'fixed', right: isMobile ? 16 : 24, bottom: fabBottom, zIndex: 2147483000,
        width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: 'var(--accent)', color: '#fff', boxShadow: '0 8px 24px rgba(139,58,90,0.4)',
        display: open ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: subdued ? 0.45 : 1, transition: 'opacity .2s',
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    </button>
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
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🌸</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: PLAYFAIR, fontWeight: 600, fontSize: 16, lineHeight: 1.1 }}>ИИ-помощник</div>
          <div style={{ fontSize: 10.5, opacity: .85 }}>Цветы Уральска · на связи 24/7</div>
        </div>
        <a href={WA} target="_blank" rel="noopener noreferrer" title="Продолжить в WhatsApp"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.46 14.27c-.24.65-1.39 1.25-1.93 1.33-.49.07-1.12.1-1.81-.11-.42-.13-.95-.31-1.64-.6-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.55-1.17-2.96s.74-2.1 1-2.39c.26-.29.57-.36.76-.36s.38 0 .55.01c.18 0 .41-.07.65.49.24.58.81 2 .88 2.15.07.14.12.31.02.5-.09.19-.14.3-.28.46-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.18 1.53 1.91 1.05.94 1.94 1.23 2.21 1.37.28.14.43.12.59-.07.16-.19.68-.79.86-1.07.18-.27.36-.23.61-.14.25.1 1.59.75 1.86.89.28.14.46.21.53.32.07.12.07.66-.18 1.3z" /></svg>
        </a>
        <button onClick={() => setOpen(false)} aria-label="Свернуть" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>

      {/* Сообщения */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg)' }}>
        {messages.map((m) => <Bubble key={m.id} m={m} onAdded={onAdded} />)}
        {pending && <Typing />}
        {!isAuthed && messages.length <= 1 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-mid)', background: 'var(--bg2)', borderRadius: 10, padding: '8px 10px' }}>
            Цены и оформление — после входа по телефону и PIN. Спрашивайте про товары — подскажу и без входа 🌸
          </div>
        )}
      </div>

      {/* Чипы-подсказки (стартовые) */}
      {messages.length <= 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '0 12px 8px', flexWrap: 'wrap' }}>
          {STARTERS.map((c) => (
            <button key={c} onClick={() => send(c)} disabled={pending}
              style={{ fontSize: 11.5, padding: '6px 11px', borderRadius: 999, border: '1px solid var(--accent-mid)', background: 'var(--accent-light)', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Ввод */}
      <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
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
    </div>
  )

  return (<>{fab}{panel}</>)
}
