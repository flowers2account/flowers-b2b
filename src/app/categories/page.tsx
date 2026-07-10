import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { company } from '@/config/company'
import { CATEGORY_TREE, leafForSubcat } from '@/lib/category-tree'
import SearchBox from '@/components/catalog/SearchBox'
import s from './categories.module.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Каталог — категории',
  description: 'Упаковка и флористика, горшки и кашпо, вазы, декор, товары для сада и газоны — все подкатегории оптовой базы в Уральске.',
}

// Цвет/номер групп (id из category-tree)
const GROUP_META: Record<string, { num: string; c: string }> = {
  packaging: { num: '01', c: '#D26AA0' },
  pots:      { num: '02', c: '#C45A38' },
  vases:     { num: '03', c: '#B0822E' },
  decor:     { num: '04', c: '#8A57B8' },
  garden:    { num: '05', c: '#5A9E3A' },
  lawn:      { num: '06', c: '#2E9E8F' },
}

// Подкатегории, для которых есть реальное фото (остальные — градиент-плейсхолдер)
const SUB_PHOTOS = new Set([
  'film', 'paper', 'film_bags', 'gift_boxes', 'baskets',
  'decor', 'toys', 'artificial', 'fountains', 'kashpo', 'paints',
  'soil', 'fertilizers', 'plant_protection', 'garden_care', 'artificial_grass', 'cover_fabric', 'cover_film',
  'pots', 'vases',
])

function plural(n: number) {
  const a = n % 10, b = n % 100
  if (a === 1 && b !== 11) return 'позиция'
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'позиции'
  return 'позиций'
}

function razdel(n: number) {
  const a = n % 10, b = n % 100
  if (a === 1 && b !== 11) return 'раздел'
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'раздела'
  return 'разделов'
}

async function leafCounts(): Promise<Record<string, number>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('subcategory')
    .eq('category', 'accessories')
    .eq('is_active', true)
    .gt('qty', 0)
    .in('source', ['uralsk_site', 'uralsk_1c'])
  const counts: Record<string, number> = {}
  for (const r of data ?? []) {
    const leaf = leafForSubcat((r as { subcategory: string | null }).subcategory)
    if (leaf) counts[leaf.slug] = (counts[leaf.slug] ?? 0) + 1
  }
  return counts
}

export default async function CategoriesPage() {
  const counts = await leafCounts()
  const grandTotal = Object.values(counts).reduce((a, b) => a + b, 0)
  const aboutTotal = Math.max(50, Math.floor(grandTotal / 50) * 50)

  return (
    <main className={s.page}>
      <div className={s.shell}>
        {/* HERO */}
        <section className={s.hero}>
          <div className={s.eyebrow}>Каталог · 6 направлений, 20 разделов</div>
          <h1 className={s.title}>Всё, что есть <span className={s.hl}>на складе</span></h1>
          <p className={s.lede}>
            Упаковка, горшки и кашпо, вазы, корзины, декор, товары для сада и укрывные материалы.
            Большинство позиций на складе в Уральске и доступно к заказу сразу.
          </p>
          <div className={s.heroRow}>
            <div style={{ flex: 1, minWidth: 320, maxWidth: 480, display: 'flex' }}>
              <SearchBox mode="navigate" />
            </div>
            <div className={s.stats}>
              <div className={s.stat}><div className={s.n}>6</div><div className={s.l}>товарных групп</div></div>
              <div className={s.stat}><div className={s.n}>2008</div><div className={s.l}>год основания</div></div>
              <div className={s.stat}><div className={s.n}><span>ЗКО</span></div><div className={s.l}>доставка по области</div></div>
            </div>
          </div>
        </section>

        <div className={s.crumb}>Главная <span>›</span> <b>Каталог</b></div>

        {/* SECTION HEAD */}
        <div className={s.catHead}>
          <div>
            <h2 className={s.catHeadH2}>Разделы каталога</h2>
            <div className={s.catHeadSub}>Более {aboutTotal} товаров для флористики, дома и сада. Выберите категорию или воспользуйтесь поиском</div>
          </div>
          <div className={s.legend}><span className={s.legendSw} />6 направлений</div>
        </div>

        {/* GROUPS */}
        <div className={s.wrap}>
          {CATEGORY_TREE.map(group => {
            const meta = GROUP_META[group.id]
            const c = meta?.c ?? '#8B3A5A'
            // На лендинге показываем только листья с готовой обложкой; карточки без
            // фото (градиентные «розовые» заглушки) скрываем. Полный набор подкатегорий
            // доступен по кнопке «Смотреть всё» (ведёт в каталог группы).
            const leaves = group.leaves.filter(l => !l.hidden && SUB_PHOTOS.has(l.slug))
            if (leaves.length === 0) return null
            const total = leaves.reduce((sum, l) => sum + (counts[l.slug] ?? 0), 0)
            return (
              <section key={group.id} className={s.group} style={{ ['--c' as string]: c } as React.CSSProperties}>
                <div className={s.groupHead}>
                  <span className={s.gnum}>{meta?.num}</span>
                  <div>
                    <div className={s.gname}>{group.label}</div>
                    <div className={s.gmeta}>{leaves.length} {razdel(leaves.length)} · {total} {plural(total)}</div>
                  </div>
                  <Link className={s.gall} href={`/catalog?category=accessories&group=${group.id}`}>
                    Смотреть всё
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </Link>
                </div>

                <div className={s.subGrid}>
                  {leaves.map(leaf => {
                    const n = counts[leaf.slug] ?? 0
                    const hasPhoto = SUB_PHOTOS.has(leaf.slug)
                    return (
                      <Link
                        key={leaf.slug}
                        href={`/catalog?category=accessories&group=${group.id}&leaves=${leaf.slug}`}
                        className={s.subCard}
                      >
                        <div
                          className={s.subPh}
                          style={hasPhoto ? { backgroundImage: `url(/subcat-photos/${leaf.slug}.jpg)` } : undefined}
                        />
                        <div className={s.subBody}>
                          <div className={s.subName}>{leaf.label}</div>
                          {n > 0
                            ? <div className={s.subCount}>{n} {plural(n)}</div>
                            : <div className={s.subSoon}>скоро в наличии</div>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {/* CTA */}
        <div className={s.cta}>
          <div className={s.t}>
            <h3>Не нашли нужный товар?</h3>
            <p>Если нужной позиции нет в каталоге, запросите полный прайс-лист. Отправим актуальные остатки и цены в WhatsApp или на почту.</p>
          </div>
          <div className={s.acts}>
            <a href={`https://wa.me/${company.phone.replace(/\D/g, '')}?text=${encodeURIComponent('Здравствуйте! Пришлите, пожалуйста, актуальный прайс-лист.')}`} target="_blank" rel="noopener noreferrer" className={`${s.ctaBtn} ${s.solid}`}>
              Получить прайс в WhatsApp
            </a>
            <a href={`tel:+${company.phone.replace(/\D/g, '')}`} className={`${s.ctaBtn} ${s.ghost}`}>{company.phone}</a>
          </div>
        </div>
      </div>
    </main>
  )
}
