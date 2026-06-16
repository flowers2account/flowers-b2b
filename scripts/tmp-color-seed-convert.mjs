import sharp from 'sharp'
import { mkdirSync } from 'fs'
const DL = 'C:/Users/Владелец/Downloads'
const OUT = 'C:/Users/Владелец/flowers-b2b/tmp-color-seed'
mkdirSync(OUT, { recursive: true })
const map = [
  ['6559_base.webp', '6559.jpg'],
  ['6559_fioletovyy.webp', '6559_fioletovyy.jpg'],
  ['6559_zolotoy.webp', '6559_zolotoy.jpg'],
  ['6559_rozovyy.webp', '6559_rozovyy.jpg'],
  ['6559_zelenyy.webp', '6559_zelenyy.jpg'],
  ['6560_festival_hd.webp', '6560.jpg'],
  ['6560_rozovyy.webp', '6560_rozovyy.jpg'],
  ['6560_svetlo-rozovyy.webp', '6560_svetlo-rozovyy.jpg'],
  ['6560_fioletovyy.webp', '6560_fioletovyy.jpg'],
  ['6560_krasnyy.webp', '6560_krasnyy.jpg'],
  ['6560_zelenyy.webp', '6560_zelenyy.jpg'],
  ['6561_zhasmin_hd.webp', '6561.jpg'],
  ['6561_krasnyy.webp', '6561_krasnyy.jpg'],
  ['6561_zelenyy.webp', '6561_zelenyy.jpg'],
  ['6561_rozovyy.webp', '6561_rozovyy.jpg'],
  ['6562_moshka_hd.webp', '6562.jpg'],
  ['6562_rozovyy.webp', '6562_rozovyy.jpg'],
]
for (const [src, dst] of map) {
  const m = await sharp(`${DL}/${src}`)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toFile(`${OUT}/${dst}`)
  console.log(`OK ${dst}  ${m.width}x${m.height} ${(m.size / 1024) | 0}KB`)
}
console.log('\nDONE', map.length, 'files')
