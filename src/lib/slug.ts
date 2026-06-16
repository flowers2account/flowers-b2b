// Транслитерация кириллицы → латиница для имён файлов на VPS.
// Единая точка (тот же TRANSLIT, что в scripts/*) — используется и в роутах фото.
// ё нормализуем в е, чтобы имена были «чистыми» (зелёный → zelenyy, а не zelyonyy).
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** «Фиолетовый» → "fioletovyy", «светло-розовый» → "svetlo-rozovyy». */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').split('')
    .map(c => (c in TRANSLIT ? TRANSLIT[c] : c)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
