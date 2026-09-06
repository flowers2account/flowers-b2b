'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode, ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { Landmark, CheckCircle2, Circle, AlertTriangle, XOctagon } from 'lucide-react'
import { useSmartKtru } from '@/lib/smart-ktru/store'

/* ────────────────────────────────────────────────────────────────────────────
   Smart KTRU — Modernist primitive layer.
   Визуальный source of truth: design_handoff_smart_ktru/styles.css (см. modernist.css).
   Один акцент #ec3013, монохром, радиус 0, шрифт Archivo. Никакой shadcn-визуальности.
   Экспорты сохранены совместимыми со существующими экранами (C / Panel / Chip / …).
   ──────────────────────────────────────────────────────────────────────────── */

/** Токены как JS-строки — для inline-стилей в существующих экранах (переходно).
 *  Значения перенесены из Modernist styles.css; палитра монохромная + один акцент. */
export const C = {
  wine: '#ec3013', // акцент (бывшее «вино»)
  accent: '#ec3013',
  ink: '#201e1d',
  stone: '#605d5d', // neutral-700, приглушённый текст
  line: 'rgba(32,30,29,0.35)', // divider
  bg: '#f3f2f2',
  panel: '#eae9e9', // surface
  surface: '#eae9e9',
  // бывшая цветовая семантика → приведена к монохрому + акценту
  green: '#201e1d',
  greenBg: '#f8f4f4',
  amber: '#ae1800',
  amberBg: '#fff2ef',
  red: '#ae1800',
  redBg: '#fff2ef',
  blue: '#605d5d',
  neutral100: '#f8f4f4',
  neutral200: '#eae7e7',
  neutral700: '#605d5d',
  accent100: '#fff2ef',
  accent700: '#ae1800',
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('ru-RU') + ' ₸'
}
export function fmtPct(r: number | null | undefined): string {
  if (r == null) return '—'
  return (r * 100).toFixed(1).replace('.0', '') + '%'
}
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return s.slice(0, 16).replace('T', ' ')
}

/* ── Verdict — 4 состояния, МОНОХРОМ (fill / outline / neutral + иконка) ── */

export type VerdictKey = 'recommend' | 'consider' | 'unlikely' | 'unsuitable'

export const VERDICT_STYLE: Record<
  string,
  { label: string; fg: string; bg: string; tagClass: string }
> = {
  recommend: { label: 'Рекомендуем', fg: '#f3f2f2', bg: '#ec3013', tagClass: 'tag-accent' },
  consider: { label: 'Рассмотреть', fg: '#ec3013', bg: '#fff2ef', tagClass: 'tag-outline' },
  unlikely: { label: 'Скорее нет', fg: '#201e1d', bg: '#f8f4f4', tagClass: 'tag-neutral' },
  unsuitable: { label: 'Не подходит', fg: '#201e1d', bg: '#f8f4f4', tagClass: 'tag-neutral' },
}

const VERDICT_ICON: Record<string, typeof Circle> = {
  recommend: CheckCircle2,
  consider: Circle,
  unlikely: AlertTriangle,
  unsuitable: XOctagon,
}

export function VerdictTag({ verdict, size = 13 }: { verdict: string; size?: number }) {
  const v = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.consider
  const Icon = VERDICT_ICON[verdict] ?? Circle
  return (
    <span className={`tag ${v.tagClass}`} style={{ fontSize: 12, padding: '4px 10px' }}>
      <Icon size={size} />
      {v.label}
    </span>
  )
}

/* ── Tag / Chip ── */

export function Tag({
  children,
  variant = 'neutral',
}: {
  children: ReactNode
  variant?: 'neutral' | 'accent' | 'outline'
}) {
  return <span className={`tag tag-${variant}`}>{children}</span>
}

/** Совместимость: старый Chip(tone) → монохромные теги. */
export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue'
}) {
  const variant: 'neutral' | 'outline' = tone === 'amber' || tone === 'red' ? 'outline' : 'neutral'
  return <span className={`tag tag-${variant}`}>{children}</span>
}

export function deadlineTone(
  daysLeft: number | null,
  passed: boolean,
): 'red' | 'amber' | 'green' | 'neutral' {
  if (passed) return 'red'
  if (daysLeft == null) return 'neutral'
  if (daysLeft <= 2) return 'red'
  if (daysLeft <= 6) return 'amber'
  return 'green'
}

/* ── Button ── */

type BtnVariant = 'primary' | 'secondary' | 'ghost'
export function Btn({
  variant = 'secondary',
  block,
  icon,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant
  block?: boolean
  icon?: boolean
}) {
  return (
    <button
      className={`btn btn-${variant}${block ? ' btn-block' : ''}${icon ? ' btn-icon' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ── Field / Divider ── */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Divider() {
  return <hr className="hr" />
}

/* ── Dialog (inline, без портала — рендерится внутри .smart-ktru) ── */

export function Dialog({
  title,
  onClose,
  children,
  actions,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>
  )
}

/* ── Nav (структура handoff: brand+landmark слева, ссылки справа) ── */

const NAV = [
  { href: '/smart-ktru/products', label: 'Мои товары' },
  { href: '/smart-ktru/procurements', label: 'Закупки' },
  { href: '/smart-ktru/work', label: 'В работе' },
  { href: '/smart-ktru/digest', label: 'Дайджест' },
]

export function SmartKtruNav() {
  const path = usePathname()
  const workCount = useSmartKtru((s) =>
    s.working.filter((w) => w.status === 'work' || w.status === 'submitted').length,
  )
  return (
    <nav className="nav">
      <Link href="/smart-ktru/products" className="nav-brand">
        <Landmark size={18} />
        Smart KTRU
      </Link>
      {NAV.map((n) => {
        const active = path.startsWith(n.href)
        const label =
          n.href === '/smart-ktru/work' && workCount > 0 ? `${n.label} (${workCount})` : n.label
        return (
          <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/* ── Card (Modernist плоская карточка) ── */

export function Card({
  kicker,
  className = '',
  elev = true,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { kicker?: string; elev?: boolean }) {
  return (
    <div className={`card${elev ? ' elev-sm' : ''} ${className}`} {...rest}>
      {kicker && <div className="card-kicker">{kicker}</div>}
      {children}
    </div>
  )
}

/* ── Tabs (кнопки-табы handoff: активный = primary, остальные = secondary) ── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`btn btn-${value === t.id ? 'primary' : 'secondary'}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ── Bar (простой горизонтальный breakdown из handoff — plain divs) ── */

export function BreakdownBar({
  segments,
}: {
  segments: { label: string; pct: number; profit?: boolean }[]
}) {
  const NEUTRAL = ['#bab6b6', '#9b9797', '#7d7979', '#605d5d']
  let ni = 0
  return (
    <div>
      <div style={{ display: 'flex', height: 14, border: '1px solid rgba(32,30,29,0.35)' }}>
        {segments.map((s, i) => (
          <div
            key={i}
            style={{
              width: `${Math.max(0, s.pct)}%`,
              background: s.profit ? '#201e1d' : NEUTRAL[ni++ % NEUTRAL.length],
            }}
            title={`${s.label}: ${s.pct.toFixed(0)}%`}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12 }}>
        {segments.map((s, i) => (
          <span key={i} className="text-muted">
            {s.label} — {s.pct.toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Panel — совместимость со старыми экранами (плоская карточка Modernist) ── */

export function Panel({
  children,
  title,
  right,
}: {
  children: ReactNode
  title?: string
  right?: ReactNode
}) {
  return (
    <section className="skt-panel">
      {title && (
        <div className="skt-panel-head">
          <h5 style={{ margin: 0 }}>{title}</h5>
          {right}
        </div>
      )}
      <div className="skt-panel-body">{children}</div>
    </section>
  )
}
