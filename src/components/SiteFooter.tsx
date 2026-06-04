import Link from 'next/link'
import Image from 'next/image'
import { company } from '@/config/company'

const BUYERS = [
  { href: '/payment',  label: 'Оплата' },
  { href: '/delivery', label: 'Доставка и самовывоз' },
  { href: '/returns',  label: 'Возврат и обмен' },
  { href: '/contacts', label: 'Контакты' },
]

const DOCS = [
  { href: '/legal/oferta',        label: 'Договор публичной оферты' },
  { href: '/legal/privacy',       label: 'Политика конфиденциальности' },
  { href: '/legal/personal-data', label: 'Обработка персональных данных' },
]

const PAYMENT_LOGOS = [
  { src: '/payment-logos/visa.svg',        alt: 'Visa',               w: 58, h: 36 },
  { src: '/payment-logos/mastercard.svg',  alt: 'Mastercard',         w: 58, h: 36 },
  { src: '/payment-logos/unionpay.svg',    alt: 'UnionPay',           w: 58, h: 36 },
  { src: '/payment-logos/visa-secure.svg', alt: 'Visa Secure',        w: 58, h: 36 },
  { src: '/payment-logos/mc-id-check.svg', alt: 'Mastercard ID Check',w: 58, h: 36 },
]

export default function SiteFooter() {
  return (
    <footer style={{
      background: '#1a1a1f',
      color: '#c8c0c4',
      fontFamily: 'var(--font-golos, system-ui, sans-serif)',
      fontSize: 13,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '40px 24px 24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '32px 40px',
      }}>

        {/* Покупателям */}
        <div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, opacity: 0.6 }}>
            Покупателям
          </div>
          {BUYERS.map(l => (
            <Link key={l.href} href={l.href} style={{
              display: 'block', color: '#c8c0c4', textDecoration: 'none',
              marginBottom: 10, lineHeight: 1.4,
            }}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Документы */}
        <div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, opacity: 0.6 }}>
            Документы
          </div>
          {DOCS.map(l => (
            <Link key={l.href} href={l.href} style={{
              display: 'block', color: '#c8c0c4', textDecoration: 'none',
              marginBottom: 10, lineHeight: 1.4,
            }}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Реквизиты */}
        <div style={{ gridColumn: 'span 1' }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, opacity: 0.6 }}>
            Реквизиты
          </div>
          <div style={{ lineHeight: 1.8, color: '#a09aa4' }}>
            <div style={{ color: '#ddd', fontWeight: 500, marginBottom: 4 }}>{company.legalName}</div>
            <div>ИИН: {company.iin}</div>
            <div style={{ marginTop: 6 }}>{company.address}</div>
            <div style={{ marginTop: 6 }}>
              <a href={`tel:${company.phone.replace(/\s/g,'')}`} style={{ color: '#c8c0c4', textDecoration: 'none' }}>
                {company.phone}
              </a>
            </div>
            <div>
              <a href={`mailto:${company.email}`} style={{ color: '#c8c0c4', textDecoration: 'none' }}>
                {company.email}
              </a>
            </div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>{company.hours}</div>
          </div>
        </div>
      </div>

      {/* Платёжные логотипы */}
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '16px 24px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
      }}>
        <span style={{ fontSize: 11, color: '#666', marginRight: 4 }}>Принимаем к оплате:</span>
        {PAYMENT_LOGOS.map(logo => (
          <div key={logo.alt} style={{
            background: '#fff', borderRadius: 6, padding: '3px 5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: logo.w, height: logo.h, flexShrink: 0,
          }}>
            <Image src={logo.src} alt={logo.alt} width={logo.w - 10} height={logo.h - 6} style={{ objectFit: 'contain' }} unoptimized />
          </div>
        ))}
        <a
          href="https://epayment.kz"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: '#00a651', borderRadius: 6, padding: '3px 5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 58, height: 36, flexShrink: 0, textDecoration: 'none',
          }}
        >
          <Image src="/payment-logos/epay.svg" alt="epay" width={48} height={30} unoptimized />
        </a>
      </div>

      {/* Copyright */}
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '12px 24px 20px',
        fontSize: 11, color: '#555', borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        © {new Date().getFullYear()} {company.legalName}. Все права защищены.
      </div>
    </footer>
  )
}
