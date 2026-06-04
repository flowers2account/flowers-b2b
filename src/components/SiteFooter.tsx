import Link from 'next/link'
import { company } from '@/config/company'

const ArrowIcon = () => (
  <svg className="ft-ar" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M5 12h14M13 6l6 6-6 6"/>
  </svg>
)

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

export default function SiteFooter() {
  return (
    <footer style={{
      background: '#211A1E',
      color: '#B7ADB2',
      fontFamily: 'var(--font-golos, system-ui, sans-serif)',
      position: 'relative',
    }}>
      <style>{`
        .ft-root::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg,#6E2A45,#8B3A5A 30%,#C97A92 60%,#3D6B50 100%);
          opacity: .85;
        }
        .ft-col-link {
          display: inline-flex; align-items: center; gap: 8px;
          color: #CDC3C8; text-decoration: none;
          font-size: 13.5px; transition: color .15s;
        }
        .ft-col-link .ft-ar {
          opacity: 0; transform: translateX(-4px);
          transition: opacity .15s, transform .15s;
          color: #C97A92;
        }
        .ft-col-link:hover { color: #E8B4C0; }
        .ft-col-link:hover .ft-ar { opacity: 1; transform: translateX(0); }
        .ft-req-link { color: #B7ADB2; text-decoration: none; transition: color .15s; }
        .ft-req-link:hover { color: #E8B4C0; }
        @media (max-width: 900px) {
          .ft-main-grid { grid-template-columns: 1fr 1fr !important; padding: 32px 20px 24px !important; }
          .ft-bar-inner { padding: 14px 20px !important; }
        }
        @media (max-width: 560px) {
          .ft-main-grid { grid-template-columns: 1fr !important; padding: 24px 16px 20px !important; }
          .ft-bar-inner { flex-direction: column !important; align-items: flex-start !important; padding: 12px 16px !important; }
        }
      `}</style>

      <div className="ft-root" style={{ position: 'relative' }}>

        {/* ── main grid ── */}
        <div className="ft-main-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr',
          gap: '40px',
          padding: '48px 48px 40px',
        }}>

          {/* brand */}
          <div style={{ maxWidth: 300 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                background: 'linear-gradient(155deg,#8B3A5A,#6E2A45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontFamily: 'var(--font-playfair, serif)',
                fontStyle: 'italic', fontWeight: 500, fontSize: 20,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
              }}>
                ц
              </span>
              <span>
                <div style={{
                  fontFamily: 'var(--font-playfair, serif)',
                  fontSize: 20, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.1,
                }}>
                  {company.name}
                </div>
                <div style={{
                  fontFamily: 'var(--font-jetbrains, monospace)',
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: '#8A8088', marginTop: 4,
                }}>
                  оптовая база · b2b
                </div>
              </span>
            </div>
            <div style={{
              fontFamily: 'var(--font-playfair, serif)',
              fontStyle: 'italic', fontSize: 15,
              color: '#EDE3E7', lineHeight: 1.5, marginTop: 20,
            }}>
              Оптовая поставка цветов, горшков и расходников для флористов и магазинов <strong style={{ fontStyle: 'normal', fontWeight: 500, color: '#fff' }}>с 2008 года</strong>.
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 18,
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 12, color: '#8A8088', letterSpacing: '0.02em',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C97A92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              Уральск · Западный Казахстан
            </div>
          </div>

          {/* buyers */}
          <div>
            <h4 style={{
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: '#8A8088', fontWeight: 500, margin: '0 0 16px',
            }}>Покупателям</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {BUYERS.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="ft-col-link">
                    <ArrowIcon />{l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* documents */}
          <div>
            <h4 style={{
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: '#8A8088', fontWeight: 500, margin: '0 0 16px',
            }}>Документы</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {DOCS.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="ft-col-link">
                    <ArrowIcon />{l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* requisites */}
          <div>
            <h4 style={{
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: '#8A8088', fontWeight: 500, margin: '0 0 16px',
            }}>Реквизиты</h4>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              {company.legalName}
            </div>
            <div style={{
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 12, color: '#8A8088', marginBottom: 16, letterSpacing: '0.02em',
            }}>
              ИИН {company.iin}
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 13, color: '#B7ADB2', marginBottom: 12, lineHeight: 1.5 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C97A92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span>{company.address}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 13, color: '#B7ADB2', marginBottom: 12, lineHeight: 1.5 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C97A92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>
              </svg>
              <a href={`tel:${company.phone.replace(/\s/g,'')}`} className="ft-req-link">{company.phone}</a>
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 13, color: '#B7ADB2', marginBottom: 14, lineHeight: 1.5 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C97A92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>
              </svg>
              <a href={`mailto:${company.email}`} className="ft-req-link">{company.email}</a>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              fontSize: 12, color: '#B7ADB2',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#3D6B50',
                boxShadow: '0 0 0 3px rgba(61,107,80,0.25)',
                flexShrink: 0,
              }} />
              {company.hours}
            </span>
          </div>
        </div>

        {/* ── payment + copyright ── */}
        <div className="ft-bar-inner" style={{
          borderTop: '1px solid rgba(255,255,255,0.09)',
          background: '#2A2126',
          padding: '18px 48px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8A8088',
            }}>
              Принимаем к оплате
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ height: 30, minWidth: 48, padding: '0 12px', borderRadius: 6, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, letterSpacing: '0.04em', color: '#1A1F71', fontStyle: 'italic' }}>VISA</span>
              <span style={{ height: 30, padding: '0 10px', borderRadius: 6, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#EB001B', display: 'inline-block' }} />
                <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#F79E1B', display: 'inline-block', marginLeft: -7, mixBlendMode: 'multiply' as const }} />
              </span>
              <span style={{ height: 30, minWidth: 48, padding: '0 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(90deg,#E21836 0 33%,#00798C 33% 66%,#007B5F 66%)', color: '#fff', fontSize: 9, fontWeight: 700 }}>UnionPay</span>
              <span style={{ height: 30, minWidth: 48, padding: '0 12px', borderRadius: 6, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#0F754E' }}>МИР</span>
              <a href="https://epayment.kz" target="_blank" rel="noopener noreferrer" style={{ height: 30, minWidth: 48, padding: '0 12px', borderRadius: 6, background: '#16B364', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff', textDecoration: 'none' }}>ePay</a>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8A8088' }}>
            <span>© {new Date().getFullYear()} {company.legalName}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Все права защищены</span>
          </div>
        </div>

      </div>
    </footer>
  )
}
