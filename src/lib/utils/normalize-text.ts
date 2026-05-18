/**
 * Нормализует текст для поиска дублей
 * Убирает лишние пробелы, приводит к lowercase
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
