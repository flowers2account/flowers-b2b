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

const SUPPLY: { c: string; t: string; d: string; group: string; ic: React.ReactNode }[] = [
  { c: '#D26AA0', t: 'Упаковка и флористика', d: 'Плёнка, бумага, пакеты, коробки, краски', group: 'packaging',
    ic: <><path d="m2 8 10-5 10 5-10 5z" /><path d="M2 8v8l10 5 10-5V8" /></> },
  { c: '#C45A38', t: 'Горшки и кашпо', d: 'Керамика, пластик, разные размеры', group: 'pots',
    ic: <path d="M5 9h14l-1.5 11h-11zM7 9V7a5 5 0 0 1 10 0v2" /> },
  { c: '#B0822E', t: 'Вазы и корзины', d: 'Стекло, плетёные корзины', group: 'vases',
    ic: <path d="M8 2h8M9 2c0 3-2 4-2 8a5 5 0 0 0 10 0c0-4-2-5-2-8" /> },
  { c: '#8A57B8', t: 'Декор и подарки', d: 'Сувениры, игрушки, искусств. растения, фонтаны', group: 'decor',
    ic: <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /> },
  { c: '#5A9E3A', t: 'Сад и огород', d: 'Грунты, удобрения, защита, садовый уход', group: 'garden',
    ic: <path d="M12 22V12M12 12c0-3 2-5 5-5 0 3-2 5-5 5ZM12 12c0-3-2-5-5-5 0 3 2 5 5 5Z" /> },
  { c: '#2E9E8F', t: 'Газоны и укрытие', d: 'Искусственный газон, укрывной материал, плёнка', group: 'lawn',
    ic: <path d="M3 20h18M6 20v-5M10 20v-7M14 20v-5M18 20v-8M4 14c2-3 5-3 7 0M13 13c2-2 5-2 7 0" /> },
]

const STEPS = [
  { n: '1', t: 'Регистрация', d: 'Оставьте номер телефона, откроем доступ к магазину и пришлём PIN-код для входа. Сменить его можно в личном кабинете.' },
  { n: '2', t: 'Выбор товаров', d: 'Выбираете товары в каталоге с реальными остатками склада и добавляете в корзину.' },
  { n: '3', t: 'Оплата', d: 'Оплачиваете заказ онлайн картой Visa, Mastercard или UnionPay. Оплата проходит на защищённой странице банка (3-D Secure), данные карты мы не видим и не храним. Комиссии для покупателя нет. Для юр. лиц предоставляем полный пакет документов.' },
  { n: '4', t: 'Получение', d: 'После оплаты подтверждаем заказ и в тот же день сообщаем о готовности. Забираете самовывозом со склада в Уральске или оформляем доставку по городу, а также в Актобе и Атырау.' },
]

const WHY: { t: string; d: string; ic: React.ReactNode }[] = [
  { t: 'Свой склад в Уральске', d: 'Большинство товаров можно посмотреть и забрать сразу, без ожидания поставки.',
    ic: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></> },
  { t: 'Регулярные поставки цветов', d: 'Свежая срезка и горшечные растения поступают несколько раз в неделю.',
    ic: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></> },
  { t: 'Ассортимент для цветочного магазина', d: 'От упаковки и ваз до удобрений и искусственного газона.',
    ic: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /> },
  { t: 'Работаем с любыми заказами', d: 'Закупаются как начинающие флористы, так и магазины с постоянным оборотом.',
    ic: <><path d="M5 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM15 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" /><path d="M3 6h11v9H3zM14 9h4l3 3v3h-3" /></> },
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
            <h1 className={s.title}>Всё для цветочного магазина <span className={s.hl}>в одном месте</span></h1>
            <p className={s.lede}>
              Работаем в Уральске с 2008 года. На складе постоянно держим упаковку, горшки, кашпо, вазы,
              декор, грунты, удобрения и садовые товары. Срезанные цветы и горшечные растения привозим
              два раза в неделю.
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
              <div><div className={s.badgeN}>150+</div><div className={s.badgeL}>магазинов и флористов закупаются регулярно</div></div>
            </div>
          </div>
        </section>

        {/* STATS — цифры подтвердить у клиента */}
        <section className={s.stats}>
          <div className={s.stat}><div className={s.statN}>2008</div><div className={s.statL}>год основания, Уральск</div></div>
          <div className={s.stat}><div className={s.statN}>6</div><div className={s.statL}>основных товарных групп</div></div>
          <div className={s.stat}><div className={s.statN}>2<span>×</span></div><div className={s.statL}>поставки цветов каждую неделю</div></div>
          <div className={s.stat}><div className={s.statN}>150<span>+</span></div><div className={s.statL}>магазинов и флористов закупаются регулярно</div></div>
        </section>

        {/* WHAT WE SUPPLY */}
        <section className={s.sec}>
          <div className={s.secHead}>
            <div className={s.secEyebrow}>Что мы поставляем</div>
            <h2 className={s.secH2}>Основные товарные группы на складе</h2>
            <p className={s.intro}>Собрали ассортимент, который чаще всего нужен цветочным магазинам, флористам и садовым отделам. Большинство позиций постоянно есть на складе.</p>
          </div>
          <div className={s.supply}>
            {SUPPLY.map(it => (
              <Link key={it.t} href={catHref(it.group)} className={s.supplyItem} style={{ '--c': it.c } as React.CSSProperties}>
                <span className={s.supplyPh} style={{ backgroundImage: `url(/category-photos/${it.group}.jpg)` }} />
                <span className={s.supplyIc}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{it.ic}</svg>
                </span>
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
            <p className={s.intro}>Работаем с производителями и поставщиками напрямую. Поэтому можем поддерживать широкий ассортимент и регулярно пополнять склад. Расходные материалы есть на складе постоянно, срезанные и горшечные растения приходят дважды в неделю.</p>
          </div>
          <div className={s.deliv}>
            <div className={`${s.delivCard} ${s.delivA}`}>
              <span className={s.route}>Россия · Китай</span>
              <div className={s.delivBody}>
                <div className={s.delivT}>Расходные материалы</div>
                <div className={s.delivD}>Упаковка, горшки и кашпо, вазы, декор и садовый ассортимент. В основном из России и Китая, держим на складе.</div>
                <span className={s.freq}><span className={s.dot} />На складе · заказ по наличию</span>
              </div>
            </div>
            <div className={`${s.delivCard} ${s.delivB}`}>
              <span className={s.route}>Китай · и другие страны</span>
              <div className={s.delivBody}>
                <div className={s.delivT}>Срез и горшечные растения</div>
                <div className={s.delivD}>Срезка и горшечные с плантаций Китая, Африки, Южной Америки, Голландии и других стран. Под предзаказ и по наличию.</div>
                <span className={s.freq}><span className={s.dot} />Дважды в неделю · предзаказ и наличие</span>
              </div>
            </div>
          </div>
        </section>

        {/* HOW TO ORDER + ACCESS FORM */}
        <section className={s.sec}>
          <div className={s.secHead}>
            <div className={s.secEyebrow}>Как заказать</div>
            <h2 className={s.secH2}>Как оформить заказ</h2>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={s.payLogo} src="/payment-logos/visa.svg" alt="Visa" width={49} height={30} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={s.payLogo} src="/payment-logos/mastercard.svg" alt="Mastercard" width={49} height={30} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={s.payLogo} src="/payment-logos/unionpay.svg" alt="UnionPay" width={49} height={30} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={s.payLogo} src="/payment-logos/visa-secure.svg" alt="Visa Secure" width={49} height={30} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={s.payLogo} src="/payment-logos/mc-id-check.svg" alt="Mastercard ID Check" width={49} height={30} />
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
            <div className={s.secEyebrow}>Почему с нами работают</div>
            <h2 className={s.secH2}>Свой склад, поставки и ассортимент</h2>
          </div>
          <div className={s.why}>
            {WHY.map(w => (
              <div key={w.t} className={s.whyCard}>
                <span className={s.whyIc}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{w.ic}</svg>
                </span>
                <div><div className={s.whyT}>{w.t}</div><div className={s.whyD}>{w.d}</div></div>
              </div>
            ))}
          </div>
        </section>

        {/* GALLERY и QUOTE свёрнуты по хендофу — вернём, когда будут реальные фото базы. */}

        {/* CTA */}
        <div className={s.secPadCta}>
          <div className={s.cta}>
            <div>
              <h3 className={s.ctaH3}>Готовы начать работать с нами?</h3>
              <p>Запросите прайс или откройте каталог, подберём ассортимент под ваш магазин и объёмы.</p>
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
