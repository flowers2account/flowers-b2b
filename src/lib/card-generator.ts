export interface CardData {
  name: string;
  price: number;
  origin: string | null;
  colors: string[] | null;
  color: string | null;
  availableQty: number;
  packSize: number;
  stemsPerPack: number | null;
  imageUrl: string;
}

const ORIGIN_MAP: Record<string, string> = {
  china: 'Китай',
  holland: 'Голландия',
  kenya: 'Кения',
  ecuador: 'Эквадор',
  colombia: 'Колумбия',
  russia: 'Россия',
};

// Canvas doesn't support CSS variables — use actual family names from next/font/google
const FONT_BODY = '"Golos Text", sans-serif';
const FONT_HEADING = '"Playfair Display", serif';

const BRAND = '#7a1c2e';
const BRAND_LIGHT = '#F7EEF2';
const STONE = '#6B7570';
const INK = '#1C1C1C';
const GREEN = '#3D6B50';

function colorEmoji(key: string): string {
  const normalized = key.toLowerCase().trim();
  const map: Record<string, string> = {
    // English keys (from DB)
    white: '⚪', cream: '🟡', pink: '🩷', peach: '🟠',
    red: '🔴', bordeaux: '🔴', orange: '🟠', yellow: '🟡',
    lavender: '🟣', purple: '🟣', green: '🟢',
    mix: '🎨', mix_pink: '🩷', mix_red_white: '🔴',
    violet: '🟣', blue: '🔵', coral: '🩷', lilac: '🟣',
    lime: '🟢', cyan: '🔵', mint: '🟢', beige: '🟤',
    brown: '🟤', black: '⚫', grey: '⚪', gray: '⚪',
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
  const H = 800;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── Header ──────────────────────────────────────────────────────
  const HEADER_H = 58;
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, HEADER_H);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🌸  Цветы Уральска', W / 2, HEADER_H / 2);

  // ── Photo ────────────────────────────────────────────────────────
  const PHOTO_Y = HEADER_H;
  const PHOTO_H = 430;

  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, PHOTO_Y, W, PHOTO_H);

  try {
    const img = await loadImage(data.imageUrl);
    drawImageCover(ctx, img, 0, PHOTO_Y, W, PHOTO_H);
  } catch {
    // Placeholder
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
  const INFO_H = H - INFO_Y - 52; // 52 = footer height
  const PAD = 20;
  let cy = INFO_Y + 18;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, INFO_Y, W, INFO_H);

  // Product name — wrap up to 2 lines
  const nameText = data.name.toUpperCase();
  ctx.font = `500 22px ${FONT_HEADING}`;
  ctx.fillStyle = BRAND;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const nameLines = wrapText(ctx, nameText, W - PAD * 2).slice(0, 2);
  for (const line of nameLines) {
    ctx.fillText(line, PAD, cy);
    cy += 28;
  }
  cy += 4;

  // Origin + color circles (no color text labels)
  const colorList = data.colors?.length ? data.colors : (data.color ? [data.color] : []);
  const originStr = data.origin ? (ORIGIN_MAP[data.origin.toLowerCase()] ?? data.origin) : null;
  const metaParts: string[] = [];
  if (originStr) metaParts.push(originStr);
  if (colorList.length > 0) metaParts.push(colorList.map(c => colorEmoji(c)).join(' '));

  if (metaParts.length > 0) {
    ctx.font = `400 14px ${FONT_BODY}`;
    ctx.fillStyle = STONE;
    ctx.fillText(metaParts.join('  •  '), PAD, cy);
    cy += 22;
  }

  cy += 6;

  // Price
  ctx.font = `700 34px ${FONT_BODY}`;
  ctx.fillStyle = BRAND;
  ctx.fillText(`${data.price.toLocaleString('ru-RU')} ₸`, PAD, cy);
  cy += 44;

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
    ctx.fillText(`🌸  В упаковке: ${data.stemsPerPack} стеблей`, PAD, cy);
  }

  // ── Footer ───────────────────────────────────────────────────────
  const FOOTER_Y = H - 52;
  ctx.fillStyle = BRAND_LIGHT;
  ctx.fillRect(0, FOOTER_Y, W, 52);

  ctx.fillStyle = INK;
  ctx.font = `500 15px ${FONT_BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📱  +7 700 757 52 43', W / 2, FOOTER_Y + 26);

  // ── Export ───────────────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/jpeg', 0.92);
  });
}
