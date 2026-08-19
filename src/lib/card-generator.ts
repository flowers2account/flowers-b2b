import QRCode from 'qrcode';
import { COUNTRY_LABELS } from '@/lib/countries';

export interface CardData {
  id: number;
  name: string;
  category?: string | null;
  subcategory?: string | null;
  length_cm: number | null;
  price: number;
  country_iso: string | null;
  colors: string[] | null;
  availableQty: number | null;
  packSize: number;
  stemsPerPack: number | null;
  unit?: string | null;
  imageUrl: string;
}


// Canvas doesn't support CSS variables — use actual family names from next/font/google
const FONT_BODY = '"Golos Text", sans-serif';
const FONT_HEADING = '"Lora", Georgia, serif';

const BRAND = '#7a1c2e';
const BRAND_LIGHT = '#F7EEF2';
const STONE = '#6B7570';
const INK = '#1C1C1C';
const GREEN = '#3D6B50';

function colorEmoji(key: string): string {
  const normalized = key.toLowerCase().trim();
  const map: Record<string, string> = {
    // English keys (from DB)
    white: '⚪', cream: '🟡', yellow: '🟡', orange: '🟠', peach: '🟠', coral: '🩷',
    red: '🔴', burgundy: '🔴',
    pink: '🩷', hot_pink: '🩷',
    lilac: '🟣', lavender: '🟣', purple: '🟣',
    blue: '🔵', navy: '🔵',
    green: '🟢', lime: '🟢', silver: '⚪',
    brown: '🟤', terracotta: '🟤',
    black: '⚫',
    bicolor: '🎨', multicolor: '🎨',
    // legacy keys
    bordeaux: '🔴', mix: '🎨', mix_pink: '🩷', mix_red_white: '🔴',
    violet: '🟣', cyan: '🔵', mint: '🟢', beige: '🟤', grey: '⚪', gray: '⚪',
    // Russian names (fallback)
    'белый': '⚪', 'красный': '🔴', 'розовый': '🩷', 'желтый': '🟡',
    'оранжевый': '🟠', 'фиолетовый': '🟣', 'синий': '🔵', 'зеленый': '🟢',
    'бордовый': '🔴', 'персиковый': '🟠', 'кремовый': '🟡', 'микс': '🎨',
    'голубой': '🔵', 'сиреневый': '🟣', 'лиловый': '🟣', 'салатовый': '🟢',
    'коралловый': '🩷', 'бежевый': '🟤', 'коричневый': '🟤',
    'черный': '⚫', 'серый': '⚪',
  };
  return map[normalized] ?? '⚪';
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = w / h;
  let dw = w;
  let dh = h;

  if (imgRatio > boxRatio) {
    dh = w / imgRatio;
  } else {
    dw = h * imgRatio;
  }

  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Некоторые хосты фото товаров (напр. Waterdrinker/Azure Blob — все горшечные)
// не отдают Access-Control-Allow-Origin: с img.crossOrigin='anonymous' такая
// картинка вообще не грузится (onerror), и карточка остаётся без фото. /_next/image
// раздаёт с того же origin (хост уже в next.config.ts remotePatterns), CORS не нужен —
// пробуем прямую загрузку, при неудаче уходим через него.
async function loadImage(url: string): Promise<HTMLImageElement> {
  try {
    return await loadImageEl(url);
  } catch {
    const proxied = `/_next/image?url=${encodeURIComponent(url)}&w=1200&q=75`;
    return loadImageEl(proxied);
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function waitFonts(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    return document.fonts.ready.then(() => undefined);
  }
  return Promise.resolve();
}

export async function generateProductCard(data: CardData): Promise<Blob> {
  await waitFonts();

  const W = 600;
  const H = 850;
  const HEADER_H = 60;
  const PHOTO_H = 450;
  const INFO_H = 280;
  const FOOTER_H = 60;
  const PAD = 20;
  const isAccessories = data.category === 'accessories';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── Header ──────────────────────────────────────────────────────
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🌸  Цветы Уральска', W / 2, HEADER_H / 2);

  // ── Photo ────────────────────────────────────────────────────────
  const PHOTO_Y = HEADER_H;
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, PHOTO_Y, W, PHOTO_H);
  try {
    const img = await loadImage(data.imageUrl);
    const photoSize = Math.min(W, PHOTO_H);
    const photoX = (W - photoSize) / 2;
    drawImageContain(ctx, img, photoX, PHOTO_Y, photoSize, photoSize);
  } catch {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, PHOTO_Y, W, PHOTO_H);
    ctx.fillStyle = '#9ca3af';
    ctx.font = `14px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Фото недоступно', W / 2, PHOTO_Y + PHOTO_H / 2);
  }

  // ── Info block ───────────────────────────────────────────────────
  const INFO_Y = PHOTO_Y + PHOTO_H;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, INFO_Y, W, INFO_H);

  // Clean name once — used for both QR URL and rendered text
  const cleanName = data.name
    .replace(/\(?\d{2,3}\s?см\)?/gi, '')
    .replace(/\(?\d{2,3}\)?(\s|$)/g, (_m, trail: string) => trail)
    .replace(/\s+/g, ' ')
    .trim();

  // QR code (generate first, draw after text)
  const QR_SIZE = 120;
  const qrX = W - PAD - QR_SIZE;
  const qrY = INFO_Y + PAD;
  let qrImg: HTMLImageElement | null = null;
  try {
    const qrUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://uralskflowers.kz'}/product/${data.id}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 360,
      margin: 1,
      color: { dark: '#1C1C1C', light: '#FFFFFF' },
    });
    qrImg = await loadImage(qrDataUrl);
  } catch {
    // silently skip
  }

  // Text area width leaves room for QR + gap
  const textW = qrX - PAD - 15;
  let cy = INFO_Y + PAD;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Product name
  ctx.font = `500 22px ${FONT_HEADING}`;
  ctx.fillStyle = BRAND;
  const displayName = isAccessories ? data.name.replace(/\s+/g, ' ').trim() : cleanName;
  const nameLines = wrapText(ctx, displayName.toUpperCase(), textW).slice(0, 2);
  for (const line of nameLines) {
    ctx.fillText(line, PAD, cy);
    cy += 26;
  }
  cy += 8;

  // Country · color circles · length
  const colorList = data.colors ?? [];
  const countryStr = data.country_iso ? (COUNTRY_LABELS[data.country_iso] ?? data.country_iso) : null;
  const metaParts: string[] = [];
  if (!isAccessories && countryStr) metaParts.push(countryStr);
  if (colorList.length > 0) metaParts.push(colorList.map(c => colorEmoji(c)).join(' '));
  if (data.length_cm && data.length_cm > 0) metaParts.push(`${data.length_cm} см`);

  if (isAccessories) {
    metaParts.length = 0;
    if (colorList.length > 0) metaParts.push(colorList.map(c => colorEmoji(c)).join(' '));
  }

  if (metaParts.length > 0) {
    ctx.font = `400 14px ${FONT_BODY}`;
    ctx.fillStyle = STONE;
    ctx.fillText(metaParts.join('  •  '), PAD, cy);
    cy += 26;
  }

  cy += 8;

  // Price
  ctx.font = `700 32px ${FONT_BODY}`;
  ctx.fillStyle = BRAND;
  const unit = data.unit || '\u0448\u0442';
  if (isAccessories) {
    ctx.fillText(`${data.price.toLocaleString('ru-RU')} \u20b8 / ${unit}`, PAD, cy);
  } else {
    ctx.fillText(`${data.price.toLocaleString('ru-RU')} ₸`, PAD, cy);
  }
  cy += 42;

  // Stock
  ctx.font = `400 13px ${FONT_BODY}`;
  if (data.availableQty != null) {
    ctx.fillStyle = GREEN;
    if (isAccessories) {
      ctx.fillText(`\u2713  \u0412 \u043d\u0430\u043b\u0438\u0447\u0438\u0438: ${data.availableQty} ${unit}`, PAD, cy);
    } else {
      ctx.fillText(`✓  В наличии: ${data.availableQty} шт`, PAD, cy);
    }
    cy += 20;
  }

  // Pack size
  if (data.packSize > 1) {
    ctx.fillStyle = STONE;
    if (isAccessories) {
      ctx.fillText(`\u{1F4E6}  \u041a\u0440\u0430\u0442\u043d\u043e\u0441\u0442\u044c: ${data.packSize} ${unit}`, PAD, cy);
    } else {
      ctx.fillText(`📦  Кратность: ${data.packSize} шт`, PAD, cy);
    }
    cy += 20;
  }

  // Stems per pack
  if (!isAccessories && data.stemsPerPack && data.stemsPerPack > 0) {
    ctx.fillStyle = STONE;
    ctx.fillText(`🌸  В упаковке: ${data.stemsPerPack} стебл.`, PAD, cy);
    cy += 20;
  }

  const FOOTER_Y = H - FOOTER_H;

  // Delivery CTA: use only the free white space between product info and footer.
  const deliveryBlockX = PAD;
  const deliveryBlockWidth = qrX - deliveryBlockX - 24;
  const deliveryBlockBottom = FOOTER_Y - 18;
  const deliveryTopLimit = cy + 14;
  const deliveryVariants = [
    { height: 92, padX: 16, iconW: 120, iconH: 50, iconY: 21 },
    { height: 84, padX: 14, iconW: 112, iconH: 46, iconY: 19 },
    { height: 76, padX: 12, iconW: 96, iconH: 40, iconY: 18 },
  ];
  const deliveryLayout = deliveryVariants
    .map(variant => ({
      ...variant,
      y: deliveryBlockBottom - variant.height,
    }))
    .find(variant => variant.y >= deliveryTopLimit && deliveryBlockWidth >= 300);

  if (deliveryLayout) {
    const deliveryBlockY = deliveryLayout.y;
    const iconX = deliveryBlockX + deliveryLayout.padX;
    const iconY = deliveryBlockY + deliveryLayout.iconY;
    const iconRight = iconX + deliveryLayout.iconW;
    const textX = iconRight + 16;
    const centerY = deliveryBlockY + deliveryLayout.height / 2;

    ctx.fillStyle = 'rgba(122, 28, 46, 0.035)';
    roundedRect(ctx, deliveryBlockX, deliveryBlockY, deliveryBlockWidth, deliveryLayout.height, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(122, 28, 46, 0.22)';
    ctx.lineWidth = 1;
    roundedRect(ctx, deliveryBlockX, deliveryBlockY, deliveryBlockWidth, deliveryLayout.height, 14);
    ctx.stroke();

    try {
      const truckRoute = await loadImage('/icons/truck-route.svg');
      drawImageContain(ctx, truckRoute, iconX, iconY, deliveryLayout.iconW, deliveryLayout.iconH);
    } catch {
      // CTA text is still useful if the route icon cannot be loaded.
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#7A2138';
    ctx.font = `700 18px ${FONT_BODY}`;
    ctx.fillText('ДОСТАВКА КАЖДУЮ НЕДЕЛЮ', textX, centerY - 19);
    ctx.fillStyle = INK;
    ctx.font = `500 17px ${FONT_BODY}`;
    ctx.fillText('Атырау • Актобе', textX, centerY + 4);
    ctx.fillStyle = STONE;
    ctx.font = `400 14px ${FONT_BODY}`;
    ctx.fillText('Смотрите ассортимент на сайте', textX, centerY + 25);
  }

  // Draw QR + caption
  if (qrImg) {
    ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE);
    ctx.fillStyle = STONE;
    ctx.font = `400 10px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('Сканируйте', qrX + QR_SIZE / 2, qrY + QR_SIZE + 12);
    ctx.fillText('для заказа', qrX + QR_SIZE / 2, qrY + QR_SIZE + 23);
  }

  // ── Footer ───────────────────────────────────────────────────────
  ctx.fillStyle = BRAND_LIGHT;
  ctx.fillRect(0, FOOTER_Y, W, FOOTER_H);
  ctx.fillStyle = INK;
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📱  +7 778 007 96 30', W / 2, FOOTER_Y + FOOTER_H / 2);

  // ── Export ───────────────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/jpeg', 0.92);
  });
}
