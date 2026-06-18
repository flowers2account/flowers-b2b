'use client'

// Блок оплаты «для юр. лиц»: QR Halyk OnlineBank по заказу.
// Если БИН организации не заполнен/не 12 цифр — QR не генерим, просим заполнить БИН.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { buildHalykQrLink, isValidBin, HALYK_QR_ENV, type QrOrder, type QrClient } from '@/lib/halyk-qr'

export default function HalykQrBlock({ order, client }: { order: QrOrder; client: QrClient }) {
  const link = buildHalykQrLink(order, client)
  const [img, setImg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (!link) { setImg(null); return }
    QRCode.toDataURL(link, { width: 220, margin: 1 })
      .then(d => { if (alive) setImg(d) })
      .catch(() => { if (alive) setImg(null) })
    return () => { alive = false }
  }, [link])

  const wrap: React.CSSProperties = {
    border: '1px solid #E6DFD9', borderRadius: 12, padding: 16, background: '#fff',
  }
  const h: React.CSSProperties = { fontSize: 14, fontWeight: 700, margin: '0 0 8px', color: '#1A1A1F' }

  // БИН не заполнен → подсказка, без QR
  if (!isValidBin(client?.bin)) {
    return (
      <div style={wrap}>
        <h3 style={h}>Оплата по QR (для юр. лиц)</h3>
        <p style={{ fontSize: 13, color: '#7A7780', margin: '0 0 10px', lineHeight: 1.5 }}>
          Заполните БИН/ИИН организации (12 цифр), чтобы оплатить через Halyk OnlineBank по QR-коду.
        </p>
        <Link href="/cabinet" style={{ fontSize: 13, fontWeight: 600, color: '#8B3A5A' }}>
          Заполнить БИН организации →
        </Link>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <h3 style={h}>Оплата по QR (для юр. лиц){HALYK_QR_ENV === 'test' && ' · тест'}</h3>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="QR оплаты Halyk" width={220} height={220}
            style={{ border: '1px solid #EFEAE5', borderRadius: 8 }} />
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: 13, color: '#494950', margin: '0 0 10px', lineHeight: 1.5 }}>
            Отсканируйте QR камерой в приложении <b>Halyk / OnlineBank</b> и подтвердите оплату.
            Авторизация не нужна — вы платите своим входом в банк.
          </p>
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12.5, fontWeight: 600, color: '#8B3A5A', wordBreak: 'break-all' }}>
              Открыть ссылку оплаты →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
