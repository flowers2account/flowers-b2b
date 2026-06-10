// Генерирует docs/CLIENT_FAQ.md из единого источника src/lib/bot/site-faq.ts.
// Запуск: node --env-file=.env.local scripts/gen-client-faq.ts
//   (или просто: node scripts/gen-client-faq.ts)
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CLIENT_FAQ } from '../src/lib/bot/site-faq.ts'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'docs', 'CLIENT_FAQ.md')

const header =
  '<!-- Сгенерировано из src/lib/bot/site-faq.ts (CLIENT_FAQ). ' +
  'Правьте текст ТАМ и запускайте: node scripts/gen-client-faq.ts -->\n\n'

writeFileSync(out, header + CLIENT_FAQ.trim() + '\n')
console.log('✅ docs/CLIENT_FAQ.md обновлён из site-faq.ts')
