import type { Metadata } from 'next'
import Link from 'next/link'
import { company } from '@/config/company'
import CategorySearch from '@/components/catalog/CategorySearch'
import s from './categories.module.css'

export const metadata: Metadata = {
  title: 'Категории каталога',
  description: 'Упаковка и флористика, горшки и кашпо, вазы, декор, товары для сада и газоны — оптом в Уральске.',
}

type Tile = {
  num: string
  name: string
  c: string
  img: string
  group: string
  leaves: string[]
  subs: string[]
  icon: React.ReactNode
}

// Направления = группы category-tree.ts; leaves = их листья (ссылки в каталог).
const TILES: Tile[] = [
  {
    num: '01', name: 'Упаковка и флористика', c: '#D26AA0', img: 'packaging.jpg', group: 'packaging',
    leaves: ['film', 'paper', 'film_bags', 'gift_boxes', 'paints'],
    subs: ['Плёнка', 'Бумага', 'Пакеты', 'Подарочные коробки', 'Краски и спреи'],
    icon: <path d="m2 8 10-5 10 5-10 5z M2 8v8l10 5 10-5V8 M12 13v8" />,
  },
  {
    num: '02', name: 'Горшки и кашпо', c: '#C45A38', img: 'pots.jpg', group: 'pots',
    leaves: ['pots', 'kashpo'],
    subs: ['Горшки', 'Кашпо'],
    icon: <path d="M5 9h14l-1.5 11h-11z M7 9V7a5 5 0 0 1 10 0v2" />,
  },
  {
    num: '03', name: 'Вазы и корзины', c: '#B0822E', img: 'vases.jpg', group: 'vases',
    leaves: ['vases', 'baskets'],
    subs: ['Вазы', 'Корзины'],
    icon: <path d="M8 2h8 M9 2c0 3-2 4-2 8a5 5 0 0 0 10 0c0-4-2-5-2-8" />,
  },
  {
    num: '04', name: 'Декор и подарки', c: '#8A57B8', img: 'decor.jpg', group: 'decor',
    leaves: ['decor', 'toys', 'artificial', 'fountains'],
    subs: ['Декор и сувениры', 'Игрушки', 'Искусственные растения', 'Фонтаны'],
    icon: <path d="M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />,
  },
  {
    num: '05', name: 'Сад и огород', c: '#5A9E3A', img: 'garden.jpg', group: 'garden',
    leaves: ['soil', 'fertilizers', 'plant_protection', 'garden_care'],
    subs: ['Грунты', 'Удобрения', 'Защита растений', 'Садовый уход'],
    icon: <path d="M12 22V12 M12 12c0-3 2-5 5-5 0 3-2 5-5 5Z M12 12c0-3-2-5-5-5 0 3 2 5 5 5Z M7 17c0-2 2-3 5-3 M17 17c0-2-2-3-5-3" />,
  },
  {
    num: '06', name: 'Газоны и укрытие', c: '#2E9E8F', img: 'lawn.jpg', group: 'lawn',
    leaves: ['artificial_grass', 'cover_fabric', 'cover_film'],
    subs: ['Искусственный газон', 'Укрывной материал', 'Плёнка полиэтиленовая'],
    icon: <path d="M3 20h18 M6 20v-5 M10 20v-7 M14 20v-5 M18 20v-8 M4 14c2-3 5-3 7 0 M13 13c2-2 5-2 7 0" />,
  },
]

const tel = '+' + company.phone.replace(/\D/g, '')
const waText = encodeURIComponent('Здравствуйте! Пришлите, пожалуйста, актуальный прайс-лист.')

export default function CategoriesPage() {
  return (
    <main className={s.page}>
      <div className={s.shell}>
        {/* HERO */}
        <section className={s.hero}>
          <div className={s.eyebrow}>Каталог · 6 направлений</div>
          <h1 className={s.title}>Всё вокруг цветка — <span className={s.hl}>упаковка, декор, сад</span></h1>
          <p className={s.lede}>
            Флористическая упаковка, горшки и кашпо, вазы, декор, товары для сада и газоны.
            Всё, что нужно флористу, магазину и дому — оптом, с доставкой по Западному Казахстану.
          </p>
          <div className={s.heroRow}>
            <CategorySearch />
            <div className={s.stats}>
              <div className={s.stat}><div className={s.n}>6</div><div className={s.l}>направлений каталога</div></div>
              <div className={s.stat}><div className={s.n}>17</div><div className={s.l}>лет на рынке</div></div>
              <div className={s.stat}><div className={s.n}><span>ЗКО</span></div><div className={s.l}>доставка по области</div></div>
            </div>
          </div>
        </section>

        {/* GRID */}
        <section className={s.catWrap}>
          <div className={s.catHead}>
            <h2>Категории каталога</h2>
            <div className={s.sub}>Выберите направление — внутри подкатегории и фильтры по типу, размеру и наличию</div>
          </div>
          <div className={s.grid}>
            {TILES.map(t => (
              <Link
                key={t.num}
                href={`/?category=accessories&group=${t.group}`}
                className={s.tile}
                style={{ '--c': t.c } as React.CSSProperties}
              >
                <span className={s.ph} style={{ backgroundImage: `url(/category-photos/${t.img})` }} />
                <span className={s.wash} />
                <span className={s.topbar} />
                <span className={s.num}>{t.num}</span>
                <span className={s.ic}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                </span>
                <span className={s.meta}>
                  <span className={s.nm}>{t.name}</span>
                  <span className={s.subs}>{t.subs.map(x => <span key={x}>{x}</span>)}</span>
                </span>
                <span className={s.go}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className={s.cta}>
          <div className={s.t}>
            <h3>Не нашли нужное? Запросите полный прайс</h3>
            <p>Отправим актуальный прайс-лист с остатками и оптовыми ценами в WhatsApp или на почту в течение рабочего дня.</p>
          </div>
          <div className={s.acts}>
            <a href={`https://wa.me/${company.phone.replace(/\D/g, '')}?text=${waText}`} target="_blank" rel="noopener noreferrer" className={`${s.ctaBtn} ${s.solid}`}>
              Получить прайс в WhatsApp
            </a>
            <a href={`tel:${tel}`} className={`${s.ctaBtn} ${s.ghost}`}>{company.phone}</a>
          </div>
        </div>
      </div>
    </main>
  )
}
