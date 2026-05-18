// src/lib/naming/parse-invoice.ts
import * as XLSX from 'xlsx';
import { normalizeWithAI } from './ai-normalizer';
import type { ParsedInvoice, InvoiceType, InvoiceTranslation } from './types';

/**
 * Парсит накладную и извлекает переводы названий товаров
 * @param file - загруженный файл (.xls или .xlsx)
 * @returns ParsedInvoice с массивом переводов
 */
export async function parseInvoiceFile(file: File): Promise<ParsedInvoice> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!firstSheet) {
      throw new Error('Файл не содержит листов');
    }

    // Определяем тип накладной
    const type = detectInvoiceType(firstSheet);

    if (type === 'unknown') {
      throw new Error('Неизвестный формат накладной');
    }

    // Парсим в зависимости от типа
    let translations: InvoiceTranslation[] = [];

    if (type === 'astrafund') {
      translations = await parseAstrafund(firstSheet);
    } else if (type === 'horti_fair') {
      translations = await parseHortiFair(firstSheet);
    }

    return {
      type,
      translations,
      fileName: file.name,
      totalItems: translations.length
    };
  } catch (error) {
    console.error('Ошибка парсинга накладной:', error);
    throw error;
  }
}

/**
 * Определяет тип накладной по структуре
 */
function detectInvoiceType(sheet: XLSX.WorkSheet): InvoiceType {
  // Проверяем Astrafund: строка 19, колонки 3-4 = "Quantity" и "Product"
  const cell_19_3 = XLSX.utils.encode_cell({ r: 19, c: 3 });
  const cell_19_4 = XLSX.utils.encode_cell({ r: 19, c: 4 });

  const val_19_3 = sheet[cell_19_3]?.v;
  const val_19_4 = sheet[cell_19_4]?.v;

  if (val_19_3 === 'Quantity' && val_19_4 === 'Product') {
    return 'astrafund';
  }

  // Проверяем Horti Fair: строка 1, колонка 10 = "Product description"
  const cell_1_10 = XLSX.utils.encode_cell({ r: 1, c: 10 });

  if (sheet[cell_1_10]?.v === 'Product description') {
    return 'horti_fair';
  }

  return 'unknown';
}

/**
 * Парсит накладную Astrafund (Invoice*.xls)
 * Формат:
 * - Строка 19: заголовки (Quantity, Product, ...)
 * - Строка 20: код клиента (CVURIN)
 * - Строка 21+: данные товаров
 * - Колонка 4 (индекс 4): Product description
 */
async function parseAstrafund(sheet: XLSX.WorkSheet): Promise<InvoiceTranslation[]> {
  const translations: InvoiceTranslation[] = [];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  for (let row = 20; row <= range.e.r; row++) {
    const cellProduct = XLSX.utils.encode_cell({ r: row, c: 4 });
    const original = sheet[cellProduct]?.v;

    if (!original || typeof original !== 'string') continue;
    if (original === 'Product' || original === 'CVURIN') continue;
    if (original.trim().length === 0) continue;

    const result = await normalizeWithAI(original, 'cut');

    translations.push({
      original: original.trim(),
      translated: result.normalized,
      confidence: result.confidence,
      matchedBy: result.matchedBy,
      category: inferCategory(result.normalized)
    });
  }

  return translations;
}

/**
 * Парсит накладную Horti Fair (sp Factuur*.xlsx)
 * Формат:
 * - Строка 1: заголовки (H2, OrderDate, ..., Product description)
 * - Строка 2+: данные товаров
 * - Колонка "Product description": названия товаров
 */
async function parseHortiFair(sheet: XLSX.WorkSheet): Promise<InvoiceTranslation[]> {
  const translations: InvoiceTranslation[] = [];

  const data: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false
  });

  if (data.length < 2) return translations;

  const headers = data[1] as string[];
  const productIdx = headers.indexOf('Product description');

  if (productIdx === -1) {
    console.warn('Колонка "Product description" не найдена');
    return translations;
  }

  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    const original = row[productIdx];

    if (!original || typeof original !== 'string') continue;
    if (original.trim().length === 0) continue;

    const result = await normalizeWithAI(original, 'cut');

    translations.push({
      original: original.trim(),
      translated: result.normalized,
      confidence: result.confidence,
      matchedBy: result.matchedBy,
      category: inferCategory(result.normalized)
    });
  }

  return translations;
}

/**
 * Определяет категорию товара по переводу
 */
function inferCategory(translated: string): string {
  if (translated.includes('роза')) return 'roses';
  if (translated.includes('хризантема')) return 'chrysanthemum';
  if (translated.includes('лилия')) return 'lilies';
  if (translated.includes('гербера') || translated.includes('гермини')) return 'gerbera';
  if (translated.includes('антуриум')) return 'anthurium';
  if (translated.includes('цимбидиум')) return 'orchids';
  if (translated.includes('фисташка')) return 'foliage';
  if (translated.includes('эвкалипт') || translated.includes('рускус')) return 'foliage';
  return 'other';
}
