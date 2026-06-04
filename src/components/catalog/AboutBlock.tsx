'use client'
import { useState } from 'react'

const ADVANTAGES = [
  { title: '1000+ позиций в одном месте', text: 'Плёнка, бумага, ленты, коробки, оазис, инструмент, удобрения и грунты: один заказ — и магазин укомплектован.' },
  { title: 'Проверенные марки', text: 'Oasis, Floralife, Fertika, Osmocote и фабрики упаковки, которыми флористы работают каждый день.' },
  { title: 'Реальные остатки', text: 'В каталоге живой склад в Уральске: видите остаток — товар есть здесь и сейчас.' },
  { title: 'Выгодные цены', text: 'Работаем напрямую с производителями и фабриками, без посредников.' },
  { title: 'Быстрая логистика', text: 'Доставка по Уральску и в регионы (ЗКО, Актобе, Атырау), отгрузка день в день.' },
  { title: 'Берём документы на себя', text: 'Счета и закрывающие для ИП и юрлиц без головной боли.' },
]

export default function AboutBlock() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      background: '#fff',
      borderBottom: '1px solid var(--border)',
      padding: '20px 24px',
    }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        {/* Заголовок */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{
            margin: 0,
            fontFamily: 'var(--font-golos)',
            fontSize: 'clamp(15px, 2vw, 18px)',
            fontWeight: 500,
            color: 'var(--text)',
            lineHeight: 1.3,
          }}>
            «Цветы Уральска» — всё для флориста и магазина
          </h2>
          {/* Кнопка раскрытия на мобильном */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="md:hidden"
            aria-expanded={expanded}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 10px',
              fontSize: 11, cursor: 'pointer', color: 'var(--text-mid)',
              flexShrink: 0, fontFamily: 'inherit',
            }}
          >
            {expanded ? 'Свернуть' : 'Подробнее'}
          </button>
        </div>

        {/* Вводный абзац */}
        <p style={{
          margin: '10px 0 0',
          fontSize: 13,
          color: 'var(--text-mid)',
          lineHeight: 1.6,
          display: expanded ? 'block' : 'none',
        }}
          className="md:block"
        >
          Более 15 лет работаем на рынке цветочной фурнитуры и сопутствующих товаров: упаковка для букетов и подарков, флористические материалы и инструмент, горшки и кашпо, грунты, удобрения и средства защиты растений, товары для сада. Находим и привозим лучшую продукцию по привлекательным ценам — а владельцам цветочных магазинов открываем доступ к полному оптовому складу с реальными остатками после регистрации.
        </p>

        {/* Сетка преимуществ */}
        <div
          style={{
            marginTop: 14,
            display: expanded ? 'grid' : 'none',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '10px 16px',
          }}
          className="md:grid"
        >
          {ADVANTAGES.map(a => (
            <div key={a.title} style={{
              background: 'var(--bg2)',
              borderRadius: 8,
              padding: '10px 14px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
                {a.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5 }}>
                {a.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
