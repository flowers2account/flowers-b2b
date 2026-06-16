import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'fs'
const OUT = 'C:/Users/Владелец/flowers-b2b/tmp-color-seed'
mkdirSync(OUT, { recursive: true })
const H = 'https://erikapack.ru/public/catalog/source'

// id | цвет (точный токен из products.colors) | slug | имя файла-источника на Erika
// Маппинг colorNN→цвет — из сид-таблицы пользователя (Фаза 2), не угадан.
const MAP = [
  // 6559 Сердечки
  [6559, 'фиолетовый', 'fioletovyy', '329_plenka_dlya_upakovki_cvetnoj_serdechki_color03.jpg'],
  [6559, 'золотой', 'zolotoy', '330_plenka_dlya_upakovki_cvetnoj_serdechki_color04.jpg'],
  [6559, 'розовый', 'rozovyy', '331_plenka_dlya_upakovki_cvetnoj_serdechki_color05.jpg'],
  [6559, 'зелёный', 'zelenyy', '333_plenka_dlya_upakovki_cvetnoj_serdechki_color07.jpg'],
  // 6560 Фестиваль
  [6560, 'розовый', 'rozovyy', '308_plenka_dlya_upakovki_cvetnoj_festival06.jpg'],
  [6560, 'светло-розовый', 'svetlo-rozovyy', '312_plenka_dlya_upakovki_cvetnoj_festival07.jpg'],
  [6560, 'фиолетовый', 'fioletovyy', '310_plenka_dlya_upakovki_cvetnoj_festival05.jpg'],
  [6560, 'красный', 'krasnyy', '307_plenka_dlya_upakovki_cvetnoj_festival03.jpg'],
  [6560, 'зелёный', 'zelenyy', '311_plenka_dlya_upakovki_cvetnoj_festival02.jpg'],
  // 6561 Жасмин
  [6561, 'красный', 'krasnyy', '7671_plenka_dlya_upakovki_cvetnoj_jasmin05.jpg'],
  [6561, 'зелёный', 'zelenyy', '7662_plenka_dlya_upakovki_cvetnoj_jasmin02.jpg'],
  [6561, 'розовый', 'rozovyy', '7666_plenka_dlya_upakovki_cvetnoj_jasmin07.jpg'],
  // 6562 Мошка (зелёного на Erika нет — не задаём)
  [6562, 'розовый', 'rozovyy', '275_plenka_dlya_upakovki_cvetnoj_moshka05.jpg'],
]

const results = []
for (const [id, color, slug, fname] of MAP) {
  const url = `${H}/${fname}`
  const res = await fetch(url)
  if (!res.ok) { console.log(`FAIL ${id} ${color}: HTTP ${res.status}`); continue }
  const buf = Buffer.from(await res.arrayBuffer())
  // guard: это картинка, а не HTML?
  const sig = buf.subarray(0, 4).toString('hex')
  const isImg = sig.startsWith('ffd8') || sig === '89504e47' || buf.subarray(0, 4).toString() === 'RIFF'
  if (!isImg) { console.log(`SKIP ${id} ${color}: не картинка (${buf.subarray(0, 12).toString().replace(/\n/g, '')})`); continue }
  const dst = `${id}_${slug}.jpg`
  const m = await sharp(buf).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toFile(`${OUT}/${dst}`)
  results.push({ id, color, dst })
  console.log(`OK ${dst}  ${m.width}x${m.height} ${(m.size / 1024) | 0}KB  (${color})`)
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(results, null, 2))
console.log(`\nDONE ${results.length}/${MAP.length}`)
