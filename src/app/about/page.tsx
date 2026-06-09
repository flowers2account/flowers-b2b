import type { Metadata } from 'next'
import Link from 'next/link'
import { company } from '@/config/company'
import AccessRequestForm from '@/components/catalog/AccessRequestForm'
import s from './about.module.css'

export const metadata: Metadata = {
  title: 'О нас',
  description: 'Оптовая база «Цветы Уральска»: упаковка, горшки, вазы, декор, товары для сада. Прямые поставки, доставка по Западному Казахстану.',
}

const tel = '+' + company.phone.replace(/\D/g, '')

const SUPPLY: { c: string; t: string; d: string; group: string }[] = [
  { c: '#D26AA0', t: 'Упаковка и флористика', d: 'Плёнка, бумага, пакеты, коробки, краски', group: 'packaging' },
  { c: '#C45A38', t: 'Горшки и кашпо', d: 'Керамика, пластик, разные размеры', group: 'pots' },
  { c: '#B0822E', t: 'Вазы и корзины', d: 'Стекло, плетёные корзины', group: 'vases' },
  { c: '#8A57B8', t: 'Декор и подарки', d: 'Сувениры, игрушки, искусств. растения, фонтаны', group: 'decor' },
  { c: '#5A9E3A', t: 'Сад и огород', d: 'Грунты, удобрения, защита, садовый уход', group: 'garden' },
  { c: '#2E9E8F', t: 'Газоны и укрытие', d: 'Искусственный газон, укрывной материал, плёнка', group: 'lawn' },
]

const STEPS = [
  { n: '1', t: 'Регистрация', d: 'Оставьте номер телефона — откроем доступ к магазину и пришлём PIN-код для входа. Сменить его можно в личном кабинете.' },
  { n: '2', t: 'Выбор товаров', d: 'Выбираете товары в каталоге с реальными остатками склада и добавляете в корзину.' },
  { n: '3', t: 'Оплата', d: 'Оплачиваете заказ онлайн картой Visa, Mastercard или UnionPay. Оплата проходит на защищённой странице банка (3-D Secure) — данные карты мы не видим и не храним. Комиссии для покупателя нет.' },
  { n: '4', t: 'Получение', d: 'После оплаты подтверждаем заказ и в тот же день сообщаем о готовности. Самовывоз со склада в Уральске или доставка — по городу, в Актобе и Атырау.' },
]

const WHY = [
  { t: 'Всё в одном месте', d: 'Шесть направлений от упаковки до садовых товаров — закрываете потребности магазина без поиска по разным поставщикам.' },
  { t: 'Прямые поставки', d: 'Возим напрямую из Китая, России и десятков стран — без лишних посредников и наценок.' },
  { t: 'Честные оптовые цены', d: 'Прозрачный прайс и гибкие условия для постоянных клиентов, флористов и магазинов.' },
  { t: 'Доставка по всей области', d: 'Самовывоз с базы или доставка по Уральску и ЗКО. Поможем с логистикой крупных заказов.' },
]

const catHref = (group: string) => `/?category=accessories&group=${group}`

export default function AboutPage() {
  return (
    <main className={s.page}>
      <div className={s.shell}>

        {/* HERO */}
        <section className={s.hero}>
          <div>
            <div className={s.eyebrow}>О компании · Цветы Уральска</div>
            <h1 className={s.title}>Всё для флористики, дома и сада — <span className={s.hl}>оптом</span></h1>
            <p className={s.lede}>
              Снабжаем флористов, магазины и садоводов Западного Казахстана: упаковка, горшки и кашпо, вазы,
              декор и товары для сада. Срез и горшечные растения возим под заказ — дважды в неделю.
              Оптовые цены и доставка по области.
            </p>
            <div className={s.acts}>
              <Link href="/categories" className={`${s.btn} ${s.solid}`}>Смотреть каталог</Link>
              <a href={`https://wa.me/${company.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className={`${s.btn} ${s.line}`}>Получить прайс-лист</a>
            </div>
          </div>
          <div className={s.heroMedia}>
            <span className={s.leaf} />
            <div className={s.main} />
            <div className={s.badge}>
              <span className={s.badgeIc}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <div><div className={s.badgeN}>150+</div><div className={s.badgeL}>постоянных клиентов</div></div>
            </div>
          </div>
        </section>

        {/* STATS — цифры подтвердить у клиента */}
        <section className={s.stats}>
          <div className={s.stat}><div className={s.statN}>17<span> лет</span></div><div className={s.statL}>на рынке Западного Казахстана</div></div>
          <div className={s.stat}><div className={s.statN}>6</div><div className={s.statL}>направлений в каталоге</div></div>
          <div className={s.stat}><div className={s.statN}>2<span>×</span></div><div className={s.statL}>поставки срезки каждую неделю</div></div>
          <div className={s.stat}><div className={s.statN}>150<span>+</span></div><div className={s.statL}>постоянных клиентов и магазинов</div></div>
        </section>

        {/* WHAT WE SUPPLY */}
        <section className={s.sec}>
          <div className={s.secHead}>
            <div className={s.secEyebrow}>Что мы поставляем</div>
            <h2 className={s.secH2}>Шесть направлений — один поставщик</h2>
            <p className={s.intro}>Всё, что нужно вокруг цветка: флористическая упаковка, горшки и кашпо, вазы, декор, товары для сада и газоны. Не нужно искать по разным базам.</p>
          </div>
          <div className={s.supply}>
            {SUPPLY.map(it => (
              <Link key={it.t} href={catHref(it.group)} className={s.supplyItem}
                style={{ '--c': it.c, backgroundImage: `url(/category-photos/${it.group}.jpg)` } as React.CSSProperties}>
                <span className={s.supplyTopbar} />
                <span className={s.supplyAr}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
                <span className={s.supplyText}>
                  <span className={s.supplyT}>{it.t}</span>
                  <span className={s.supplyD}>{it.d}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* DELIVERIES */}
        <section className={`${s.sec} ${s.secAlt}`}>
          <div className={s.secHead}>
            <div className={s.secEyebrow}>Поставки</div>
            <h2 className={s.secH2}>Откуда мы возим</h2>
            <p className={s.intro}>Возим напрямую — поэтому держим ассортимент и оптимальные цены. Расходные материалы есть на складе постоянно, срез и горшечные растения приходят дважды в неделю.</p>
          </div>
          <div className={s.deliv}>
            <div className={`${s.delivCard} ${s.delivA}`}>
              <span className={s.globe} />
              <span className={s.route}>Россия · Китай</span>
              <div className={s.delivT}>Расходные материалы</div>
              <div className={s.delivD}>Упаковка, горшки и кашпо, вазы, декор и садовый ассортимент. В основном из России и Китая, держим на складе.</div>
              <span className={s.freq}><span className={s.dot} />На складе · заказ по наличию</span>
            </div>
            <div className={`${s.delivCard} ${s.delivB}`}>
              <span className={s.globe} />
              <span className={s.route}>Китай · и другие страны</span>
              <div className={s.delivT}>Срез и горшечные растения</div>
              <div className={s.delivD}>Срезка и горшечные с плантаций Китая, Африки, Южной Америки, Голландии и других стран. Под предзаказ и по наличию.</div>
              <span className={s.freq}><span className={s.dot} />Дважды в неделю · предзаказ и наличие</span>
            </div>
          </div>
        </section>

        {/* HOW TO ORDER + ACCESS FORM */}
        <section className={s.sec}>
          <div className={s.secHead}>
            <div className={s.secEyebrow}>Как заказать</div>
            <h2 className={s.secH2}>Четыре шага — от регистрации до получения</h2>
          </div>
          <div className={s.steps}>
            {STEPS.map(st => (
              <div key={st.n} className={s.step}>
                <div className={s.stepNum}>{st.n}</div>
                <div className={s.stepT}>{st.t}</div>
                <div className={s.stepD}>{st.d}</div>
              </div>
            ))}
          </div>

          <div className={s.access}>
            <div className={s.info}>
              <div className={s.accessT}>Получите доступ к магазину</div>
              <p>Оставьте имя и номер — откроем доступ и пришлём PIN-код для входа. Это займёт пару минут.</p>
            </div>
            <AccessRequestForm />
          </div>

          <div className={s.orderExtra}>
            <div className={s.timing}>
              <span className={s.timingIc}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              </span>
              <div>
                <div className={s.timingT}>Сроки</div>
                <p>Самовывоз — в день заказа после подтверждения менеджером, со склада в Уральске ({company.address.replace('Западно-Казахстанская область, ', '')}; {company.hours}).</p>
                <p>Доставка по Уральску — в день заказа или на следующий день. В Актобе и Атырау — по согласованию.</p>
              </div>
            </div>

            <div className={s.paySec}>
              <div className={s.payHead}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--fern-deep)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                Безопасные платежи
              </div>
              <p>Оплата картой проходит на защищённой странице {company.bank} по технологии 3-D Secure. Данные карты вводятся только на стороне банка и передаются по шифрованному каналу — магазин их не получает и не хранит.</p>
              <div className={s.payRow}>
                <span className={s.pay}>VISA</span>
                <span className={s.pay}>Mastercard</span>
                <span className={s.pay}>UnionPay</span>
                <span className={s.pay}>Visa Secure</span>
                <span className={s.pay}>Mastercard ID Check</span>
              </div>
            </div>

            <p className={s.legalLine}>
              Оформляя заказ, вы принимаете условия <Link href="/legal/oferta">публичной оферты</Link>. См. также <Link href="/payment">Оплата</Link>, <Link href="/delivery">Доставка и самовывоз</Link>, <Link href="/returns">Возврат и обмен</Link>.
            </p>
          </div>
        </section>

        {/* PROMOS */}
        <section className={`${s.sec} ${s.secAlt}`}>
          <div className={s.secHead}>
            <div className={s.secEyebrow}>Акции</div>
            <h2 className={s.secH2}>Выгода при заказе через сайт</h2>
            <p className={s.intro}>Действующие предложения для клиентов из Уральска и соседних городов.</p>
          </div>
          <div className={s.promos}>
            <div className={`${s.promo} ${s.promoOne}`}>
              <span className={s.ribbon} />
              <span className={s.pf}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM15 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" /><path d="M3 6h11v9H3zM14 9h4l3 3v3h-3" /></svg>
              </span>
              <div>
                <span className={s.tag}>Актобе · Атырау</span>
                <div className={s.promoT}>Бесплатная доставка</div>
                <div className={s.promoD}>При заказе через сайт от 50 000 ₸ — доставка раз в неделю за наш счёт.</div>
              </div>
            </div>
            <div className={`${s.promo} ${s.promoTwo}`}>
              <span className={s.ribbon} />
              <span className={s.big}>−1%</span>
              <div>
                <span className={s.tag}>Уральск</span>
                <div className={s.promoT}>Скидка на заказ</div>
                <div className={s.promoD}>Клиентам из Уральска — скидка 1% при заказе через сайт.</div>
              </div>
            </div>
          </div>
        </section>

        {/* WHY US */}
        <section className={s.sec}>
          <div className={s.secHead}>
            <div className={s.secEyebrow}>Почему выбирают нас</div>
            <h2 className={s.secH2}>Ассортимент, цена и стабильное наличие</h2>
          </div>
          <div className={s.why}>
            {WHY.map(w => (
              <div key={w.t} className={s.whyCard}>
                <span className={s.whyIc}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></svg>
                </span>
                <div><div className={s.whyT}>{w.t}</div><div className={s.whyD}>{w.d}</div></div>
              </div>
            ))}
          </div>
        </section>

        {/* GALLERY (плейсхолдеры — заменить реальными фото) */}
        <section className={`${s.sec} ${s.secAlt}`}>
          <div className={s.secHead}>
            <div className={s.secEyebrow}>Наша база</div>
            <h2 className={s.secH2}>Загляните к нам</h2>
            <p className={s.intro}>Витрина, склад, ассортимент, команда — реальные снимки убеждают лучше любых слов.</p>
          </div>
          <div className={s.gallery}>
            <div className={`${s.galPh} ${s.g1}`} />
            <div className={s.galPh} />
            <div className={s.galPh} />
            <div className={`${s.galPh} ${s.g4}`} />
          </div>
        </section>

        {/* QUOTE */}
        <section className={s.sec}>
          <div className={s.quote}>
            <div className={s.por}><div className={s.porPh} /></div>
            <div className={s.qtx}>
              <div className={s.mk}>“</div>
              <blockquote>Мы начинали с небольшой точки, а выросли в базу, которой доверяют флористы всего региона. Для нас каждый заказ — это чей-то праздник, поэтому ассортимент, цены и честность для нас не просто слова.</blockquote>
              <div className={s.who}>Валерий Тропин</div>
              <div className={s.role}>основатель · «Цветы Уральска»</div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className={s.secPadCta}>
          <div className={s.cta}>
            <div>
              <h3 className={s.ctaH3}>Готовы начать работать с нами?</h3>
              <p>Запросите прайс или откройте каталог — подберём ассортимент под ваш магазин и объёмы.</p>
            </div>
            <div className={s.acts}>
              <Link href="/categories" className={`${s.btn} ${s.solid}`}>Открыть каталог</Link>
              <a href={`tel:${tel}`} className={`${s.btn} ${s.line}`}>{company.phone}</a>
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
