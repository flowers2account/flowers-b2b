// Генератор PDF-счёта на оплату (pdfkit). Кириллица — встроенный PT Sans (OFL).
// QR Halyk встраивается картинкой из ссылки (см. buildInvoiceQrLink, halyk-qr.ts).
import path from 'node:path'
import { promises as fs } from 'node:fs'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { company } from '@/config/company'
import { amountInWords } from './amount-in-words'

const FONT_DIR = path.join(process.cwd(), 'src', 'lib', 'invoice', 'fonts')
const FONT_REGULAR = path.join(FONT_DIR, 'PTSans-Regular.ttf')
const FONT_BOLD = path.join(FONT_DIR, 'PTSans-Bold.ttf')

const MM = 2.834645669 // 1 мм в пунктах PDF
const mm = (v: number) => v * MM

export type InvoiceLine = { name: string; qty: number; price: number }

export type InvoiceData = {
  invoiceNumber: number | string
  date?: Date | string                  // дата счёта; по умолчанию — сейчас
  buyer: { companyName?: string | null; bin?: string | null }
  lines: InvoiceLine[]
  qrLink: string                        // готовая ссылка OnlineDuken
  amount?: number                       // итог к оплате (orders.total со скидкой); по умолчанию — сумма позиций
}

const money = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

function formatDate(d?: Date | string): string {
  const date = d ? new Date(d) : new Date()
  // Дата в таймзоне Asia/Oral (как примечания amo)
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Oral', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date)
  return parts // dd.mm.yyyy
}

/** Сгенерировать PDF-счёт. Возвращает Buffer. */
export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const lines = data.lines ?? []
  const linesSum = lines.reduce((s, l) => s + Number(l.qty) * Number(l.price), 0)
  const total = data.amount != null ? Number(data.amount) : linesSum
  const discount = Math.max(0, linesSum - total)
  const qrPng = await QRCode.toBuffer(data.qrLink, { errorCorrectionLevel: 'M', margin: 1, width: 420 })

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
  doc.font('bold').fontSize(15)
    .text(`Счёт на оплату № ${data.invoiceNumber} от ${formatDate(data.date)}`, left, doc.y, { width })
  doc.moveDown(0.8)

  // ── Поставщик ──
  doc.font('bold').fontSize(10).text('Поставщик:', { continued: false })
  doc.font('reg').fontSize(9.5)
  const supplier = [
    company.legalName,
    `ИИН ${company.iin}`,
    `ИИК ${company.iik}`,
    `БИК ${company.bik}, КБе ${company.kbe}`,
    company.bank,
    'г. Уральск, ул. Амангельды Каримуллина, 11',
  ]
  supplier.forEach((s) => doc.text(s, { width }))
  doc.moveDown(0.5)

  // ── Покупатель ──
  doc.font('bold').fontSize(10).text('Покупатель:')
  doc.font('reg').fontSize(9.5)
  doc.text(data.buyer.companyName?.trim() || '—', { width })
  doc.text(`БИН ${data.buyer.bin?.trim() || '—'}`, { width })
  doc.moveDown(0.8)

  // ── Таблица позиций ──
  const cols = [
    { key: 'n', title: '№', w: mm(10), align: 'left' as const },
    { key: 'name', title: 'Наименование', w: width - mm(10) - mm(22) - mm(28) - mm(30), align: 'left' as const },
    { key: 'qty', title: 'Кол-во', w: mm(22), align: 'right' as const },
    { key: 'price', title: 'Цена', w: mm(28), align: 'right' as const },
    { key: 'sum', title: 'Сумма', w: mm(30), align: 'right' as const },
  ]
  const xAt = (i: number) => left + cols.slice(0, i).reduce((s, c) => s + c.w, 0)
  const pad = mm(1.5)

  const drawRow = (vals: string[], opts: { header?: boolean }) => {
    const font = opts.header ? 'bold' : 'reg'
    doc.font(font).fontSize(9)
    // высота строки по самой высокой ячейке
    const heights = cols.map((c, i) =>
      doc.heightOfString(vals[i], { width: c.w - pad * 2, align: c.align }))
    const rowH = Math.max(...heights) + pad * 2
    const y0 = doc.y
    // перенос страницы
    if (y0 + rowH > doc.page.height - doc.page.margins.bottom - mm(60)) {
      doc.addPage()
    }
    const y = doc.y
    cols.forEach((c, i) => {
      doc.text(vals[i], xAt(i) + pad, y + pad, { width: c.w - pad * 2, align: c.align })
    })
    // линии сетки
    doc.lineWidth(0.5).strokeColor('#999')
    doc.moveTo(left, y).lineTo(right, y).stroke()
    doc.moveTo(left, y + rowH).lineTo(right, y + rowH).stroke()
    cols.forEach((_, i) => doc.moveTo(xAt(i), y).lineTo(xAt(i), y + rowH).stroke())
    doc.moveTo(right, y).lineTo(right, y + rowH).stroke()
    doc.y = y + rowH
    doc.strokeColor('#000')
  }

  drawRow(cols.map((c) => c.title), { header: true })
  lines.forEach((l, idx) => {
    const sum = Number(l.qty) * Number(l.price)
    drawRow([String(idx + 1), l.name, money(l.qty), money(l.price), money(sum)], {})
  })

  doc.moveDown(0.6)
  // ── Итого ──
  if (discount > 0) {
    doc.font('reg').fontSize(10).text(`Сумма позиций: ${money(linesSum)} тг`, left, doc.y, { width, align: 'right' })
    doc.font('reg').fontSize(10).text(`Скидка: −${money(discount)} тг`, { width, align: 'right' })
  }
  doc.font('bold').fontSize(11).text(`Итого: ${money(total)} тг`, left, doc.y, { width, align: 'right' })
  doc.font('reg').fontSize(9.5).text(`Всего к оплате: ${amountInWords(total)}`, { width })
  doc.moveDown(1)

  // ── QR + подпись ──
  const qrSize = mm(40)
  const qrY = doc.y
  doc.image(qrPng, left, qrY, { width: qrSize, height: qrSize })
  // рамка-блок вокруг QR (≥17×22мм; здесь с запасом)
  doc.lineWidth(0.5).strokeColor('#000')
    .rect(left - mm(1.5), qrY - mm(1.5), qrSize + mm(3), qrSize + mm(3)).stroke()

  const capX = left + qrSize + mm(6)
  doc.font('reg').fontSize(9).text(
    `Оплатите сканированием QR в приложении Onlinebank, либо переводом по указанным ` +
    `реквизитам с обязательным указанием номера счёта ${data.invoiceNumber} в назначении платежа.`,
    capX, qrY, { width: right - capX },
  )

  doc.end()
  return done
}

/**
 * Сохранить PDF на диск VPS (по умолчанию /srv/media/invoices, отдаётся как фото товаров).
 * Каталог настраивается через INVOICE_PDF_DIR. Возвращает абсолютный путь к файлу.
 */
export async function saveInvoicePdf(invoiceNumber: number | string, pdf: Buffer): Promise<string> {
  const dir = process.env.INVOICE_PDF_DIR || '/srv/media/invoices'
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${invoiceNumber}.pdf`)
  await fs.writeFile(file, pdf)
  return file
}
