// Генератор PDF: спецификация корзины и накладная к заказу (pdfkit).
// Кириллица — тот же встроенный PT Sans (base64), что и в счёте.
// Осознанно МИНИМАЛЬНЫЙ документ: только проверенные данные (позиции, цены,
// суммы; для заказа — № и итог из БД). Без QR, «суммы прописью», банковских
// реквизитов и платёжных условий — это не счёт на оплату.
import PDFDocument from 'pdfkit'
import { company } from '@/config/company'
import { PT_SANS_REGULAR_B64, PT_SANS_BOLD_B64 } from './fonts-data'

const FONT_REGULAR = Buffer.from(PT_SANS_REGULAR_B64, 'base64')
const FONT_BOLD = Buffer.from(PT_SANS_BOLD_B64, 'base64')

const MM = 2.834645669
const mm = (v: number) => v * MM

const money = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0)

function formatDate(d?: Date | string): string {
  const date = d ? new Date(d) : new Date()
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Oral', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date)
}

export type SpecLine = {
  name: string
  qty: number
  price: number
  unit?: string | null
  color?: string | null
}

export type SpecData = {
  /** Есть номер → это накладная к заказу; нет → предварительная спецификация корзины. */
  orderNumber?: number | string | null
  date?: Date | string
  buyer?: { name?: string | null; companyName?: string | null; bin?: string | null } | null
  lines: SpecLine[]
  /** Только для заказа и только если реально применена (₸). */
  discount?: number | null
  /** Только для заказа и только если > 0 (₸). */
  delivery?: number | null
  /** orders.total — источник истины для итога заказа (₸). */
  total?: number | null
}

/** PDF спецификации/накладной. Возвращает Buffer. */
export async function generateSpecPdf(data: SpecData): Promise<Buffer> {
  const isOrder = data.orderNumber != null && String(data.orderNumber).trim() !== ''
  const lines = (data.lines ?? []).filter((l) => l && l.name && Number(l.qty) > 0)
  const goodsSum = lines.reduce((s, l) => s + Number(l.qty) * Number(l.price), 0)
  const discount = isOrder ? Math.max(0, Number(data.discount) || 0) : 0
  const delivery = isOrder ? Math.max(0, Number(data.delivery) || 0) : 0
  const total = isOrder && data.total != null ? Number(data.total) : goodsSum
  const hasColor = lines.some((l) => (l.color ?? '').trim() !== '')

  const doc = new PDFDocument({ size: 'A4', margin: mm(15) })
  doc.registerFont('reg', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)
  doc.font('reg')

  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const width = right - left

  // ── Заголовок ──
  const title = isOrder
    ? `Накладная к заказу № ${data.orderNumber} от ${formatDate(data.date)}`
    : `Спецификация от ${formatDate(data.date)}`
  doc.font('bold').fontSize(15).text(title, left, doc.y, { width })
  doc.moveDown(0.7)

  // ── Поставщик (минимум для идентификации) ──
  doc.font('bold').fontSize(10).text('Поставщик:')
  doc.font('reg').fontSize(9.5)
  ;[company.legalName, `ИИН ${company.iin}`, company.address, `тел. ${company.phone}`]
    .forEach((t) => doc.text(t, { width }))

  // ── Покупатель (только если известен) ──
  const buyerName = (data.buyer?.companyName || data.buyer?.name || '').trim()
  if (buyerName) {
    doc.moveDown(0.5)
    doc.font('bold').fontSize(10).text('Покупатель:')
    doc.font('reg').fontSize(9.5).text(buyerName, { width })
    if ((data.buyer?.bin ?? '').trim()) doc.text(`БИН ${data.buyer!.bin!.trim()}`, { width })
  }
  doc.moveDown(0.8)

  // ── Таблица ──
  const wNum = mm(9)
  const wQty = mm(18)
  const wUnit = mm(14)
  const wPrice = mm(26)
  const wSum = mm(28)
  const wColor = hasColor ? mm(26) : 0
  const wName = width - wNum - wColor - wQty - wUnit - wPrice - wSum

  const cols = [
    { title: '№', w: wNum, align: 'left' as const },
    { title: 'Наименование', w: wName, align: 'left' as const },
    ...(hasColor ? [{ title: 'Цвет', w: wColor, align: 'left' as const }] : []),
    { title: 'Кол-во', w: wQty, align: 'right' as const },
    { title: 'Ед.', w: wUnit, align: 'left' as const },
    { title: 'Цена', w: wPrice, align: 'right' as const },
    { title: 'Сумма', w: wSum, align: 'right' as const },
  ]
  const xAt = (i: number) => left + cols.slice(0, i).reduce((s, c) => s + c.w, 0)
  const pad = mm(1.5)

  const drawRow = (vals: string[], header = false) => {
    doc.font(header ? 'bold' : 'reg').fontSize(9)
    const heights = cols.map((c, i) => doc.heightOfString(vals[i] ?? '', { width: c.w - pad * 2, align: c.align }))
    const rowH = Math.max(...heights) + pad * 2
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - mm(30)) doc.addPage()
    const y = doc.y
    cols.forEach((c, i) => doc.text(vals[i] ?? '', xAt(i) + pad, y + pad, { width: c.w - pad * 2, align: c.align }))
    doc.lineWidth(0.5).strokeColor('#999')
    doc.moveTo(left, y).lineTo(right, y).stroke()
    doc.moveTo(left, y + rowH).lineTo(right, y + rowH).stroke()
    cols.forEach((_, i) => doc.moveTo(xAt(i), y).lineTo(xAt(i), y + rowH).stroke())
    doc.moveTo(right, y).lineTo(right, y + rowH).stroke()
    doc.y = y + rowH
    doc.strokeColor('#000')
  }

  drawRow(cols.map((c) => c.title), true)
  lines.forEach((l, idx) => {
    const row = [String(idx + 1), l.name]
    if (hasColor) row.push((l.color ?? '').trim() || '—')
    row.push(money(l.qty), (l.unit || 'шт').trim(), money(l.price), money(Number(l.qty) * Number(l.price)))
    drawRow(row)
  })

  // ── Итоги ──
  doc.moveDown(0.6)
  // Шрифт PT Sans без символа ₸ — как и в счёте, пишем «тг».
  doc.font('reg').fontSize(10).text(`Сумма товаров: ${money(goodsSum)} тг`, left, doc.y, { width, align: 'right' })
  if (isOrder) {
    if (discount > 0) doc.font('reg').fontSize(10).text(`Скидка: −${money(discount)} тг`, { width, align: 'right' })
    if (delivery > 0) doc.font('reg').fontSize(10).text(`Доставка: ${money(delivery)} тг`, { width, align: 'right' })
    doc.font('bold').fontSize(11.5).text(`ИТОГО: ${money(total)} тг`, { width, align: 'right' })
  }

  // ── Сноска ──
  doc.moveDown(1)
  doc.font('reg').fontSize(8.5).fillColor('#7A7780')
  if (isOrder) {
    doc.text('Документ сформирован автоматически на сайте ' + company.domain + '. Не является счётом на оплату.', { width })
  } else {
    doc.text(
      'Предварительный список. Скидка и стоимость доставки определяются при оформлении заказа. ' +
      'Наличие товаров уточняйте перед заказом. ' + company.domain,
      { width },
    )
  }
  doc.fillColor('#000')

  doc.end()
  return done
}
