import QRCode from 'qrcode';
import { COUNTRY_LABELS } from '@/lib/countries';

export interface CardData {
  id: number;
  name: string;
  length_cm: number | null;
  price: number;
  country_iso: string | null;
  colors: string[] | null;
  availableQty: number;
  packSize: number;
  stemsPerPack: number | null;
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

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;

  if (imgRatio > boxRatio) {
    // Clip sides
    sw = img.naturalHeight * boxRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    // Clip top/bottom
    sh = img.naturalWidth / boxRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
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
    drawImageCover(ctx, img, 0, PHOTO_Y, W, PHOTO_H);
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
    const qrUrl = `https://flowers-b2b-phi.vercel.app/product/${data.id}`;
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
  const nameLines = wrapText(ctx, cleanName.toUpperCase(), textW).slice(0, 2);
  for (const line of nameLines) {
    ctx.fillText(line, PAD, cy);
    cy += 26;
  }
  cy += 8;

  // Country · color circles · length
  const colorList = data.colors ?? [];
  const countryStr = data.country_iso ? (COUNTRY_LABELS[data.country_iso] ?? data.country_iso) : null;
  const metaParts: string[] = [];
  if (countryStr) metaParts.push(countryStr);
  if (colorList.length > 0) metaParts.push(colorList.map(c => colorEmoji(c)).join(' '));
  if (data.length_cm && data.length_cm > 0) metaParts.push(`${data.length_cm} см`);

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
  ctx.fillText(`${data.price.toLocaleString('ru-RU')} ₸`, PAD, cy);
  cy += 42;

  // Stock
  ctx.font = `400 13px ${FONT_BODY}`;
  ctx.fillStyle = GREEN;
  ctx.fillText(`✓  В наличии: ${data.availableQty} шт`, PAD, cy);
  cy += 20;

  // Pack size
  if (data.packSize > 1) {
    ctx.fillStyle = STONE;
    ctx.fillText(`📦  Кратность: ${data.packSize} шт`, PAD, cy);
    cy += 20;
  }

  // Stems per pack
  if (data.stemsPerPack && data.stemsPerPack > 0) {
    ctx.fillStyle = STONE;
    ctx.fillText(`🌸  В упаковке: ${data.stemsPerPack} стебл.`, PAD, cy);
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
  const FOOTER_Y = H - FOOTER_H;
  ctx.fillStyle = BRAND_LIGHT;
  ctx.fillRect(0, FOOTER_Y, W, FOOTER_H);
  ctx.fillStyle = INK;
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📱  +7 700 757 52 43', W / 2, FOOTER_Y + FOOTER_H / 2);

  // ── Export ───────────────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/jpeg', 0.92);
  });
}
