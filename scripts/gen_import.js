const XLSX = require('xlsx');
const wb = XLSX.readFile('c:/Users/Владелец/Downloads/Книга1.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const chinaIdx = rows.findIndex((r, i) => i > 0 && String(r[1]).trim().toUpperCase() === 'КИТАЙ');

const ROSE_NAMES = new Set([
  'фулл монти','канделайт','магик таймс','маджик таймс','эксплоуер','микс','микс пинк',
  'лола','квинскроун','квинкроун','амстердам','палома','мандала','тибет',
  'пинк флойд','пинк флоид','кантри блюз','мондиаль','пинк мондиаль','мамма мия',
  'прауд','карусель','ред пантера','мелон экспрешен','вайт охара','хермоса',
  'плея бланка','эсперанс','айша',
]);

function parseLen(name) {
  const m = name.match(/\s(\d{2,3}(?:[\/\-]\d{2,3})?)\s*$/);
  if (m) {
    const fl = parseInt(m[1]);
    if (fl >= 30 && fl <= 130) {
      return { ls: m[1] + ' см', lc: fl, v: name.slice(0, name.lastIndexOf(m[0])).trim() };
    }
  }
  return { ls: null, lc: null, v: name.trim() };
}

function cleanN(n) {
  return n
    .replace(/\bLINFLOWERS\b/gi, '').replace(/\bzento\b/gi, '')
    .replace(/\bофий\b/gi, '').replace(/\bоф\b/gi, '').replace(/\b2кор\b/gi, '')
    .replace(/аквабокс\s*/gi, '').replace(/\s+на воде\b/gi, '')
    .replace(/\s+\d{3,5}(?:\s*[,.]\d{1,2})?\s*$/, '')
    .replace(/\s+/g, ' ').trim();
}

function cat(n) {
  const l = n.toLowerCase();
  if (l.includes('хризантем')) {
    if (l.includes('сантини')) return ['chrysanthemums', 'spray', 10];
    if (l.includes('ветков')) return ['chrysanthemums', 'spray', 10];
    if (l.includes('помпон')) return ['chrysanthemums', 'pompom', 10];
    if (l.includes('одно')) return ['chrysanthemums', 'single', 10];
    return ['chrysanthemums', null, 10];
  }
  if (l.includes('альстромери')) return ['alstroemeria', null, 10];
  if (l.includes('гортензи')) return ['hydrangeas', null, 5];
  if (l.includes('гербер')) return ['gerberas', null, 5];
  if (l.startsWith('лилия') || l.includes(' лилия')) return ['lilies', null, 5];
  if (l.includes('гипсофил')) return ['fillers', null, 5];
  if (l.includes('солидаго')) return ['fillers', null, 5];
  if (l.includes('рускус') || l.includes('аспараг') || l.includes('паникум') ||
      l.includes('фисташк') || l.includes('эвкалипт') || l.includes('хамелациум') ||
      l.includes('ледер') || l.includes('финик')) return ['greens', null, 5];
  if (l.includes('ирис')) return ['irises', null, 5];
  if (l.includes('лизиантус')) return ['lisianthus', null, 5];
  if (l.includes('гвоздик')) return ['carnations', null, 5];
  if (l.includes('роза спрей') || l.includes('роза ветков')) return ['roses', 'spray', 25];
  if (l.includes('роза')) return ['roses', 'single', 25];
  if (l.includes('пион') || l.includes('пиона')) return ['seasonal', null, 5];
  if (l.includes('антуриум')) return ['accents', null, 5];
  if (l.includes('ванда') || l.includes('цимбиди')) return ['exotic', null, 5];
  if (l.includes('аллиум') || l.includes('матиол') || l.includes('фрезия') ||
      l.includes('ранункулюс') || l.includes('ромашк') || l.includes('танацетум') ||
      l.includes('антиринум') || l.includes('молюцелл') || l.includes('гиппеаструм') ||
      l.includes('геликони') || l.includes('целозия') || l.includes('протея') ||
      l.includes('гладиол') || l.includes('подсолнух') || l.includes('статиц') ||
      l.includes('дельфини') || l.includes('чико')) return ['accents', null, 5];
  // Short variety names → roses
  const firstWord = l.split(' ')[0];
  if (ROSE_NAMES.has(firstWord) || ROSE_NAMES.has(l)) return ['roses', 'single', 25];
  return ['accents', null, 5];
}

const existing = new Set([
  'альстромерия белая||china','альстромерия вайт||china','альстромерия микс||china',
  'гвоздика||china','гвоздика барб уилл вайт|60|china','гвоздика белая||china',
  'гвоздика вет лайт пинк||china','гвоздика ветковая микс||china',
  'гвоздика грин||china','гвоздика красная||china',
  'гипсофила пинк||china','гортензия микс||china','дельфиниум пурпл|80|china',
  'диана роза|70|china','канделайт|40|china','кантри блюз|40|china',
  'квинс кроун|40|china','ледер ларж вакум|55|china','лилия диана||china',
  'мондиаль|50|china','нина|50|china','оксипиалум блу||china',
  'пинк мондиаль|50|china','пинк флоид|40|china','пинк флойд|50|china',
  'пинк флойд|60|china','пинк флойд|75|china','пион корал сансет||china',
  'подсолнечник||china','прауд|50|china','прауд|60|china','ред пантера|90|china',
  'роза ветковая крем твистер|70|china','роза ветковая салинеро|60|china',
  'роза ветковая файерворкс|60|china','роза джумилия|70|china',
  'роза мандала|70|china','роза прауд|60|china','рускус|50|china',
  'солидаго голден глори|80|china','тибет|40|china','тласпи грин||china',
  'хризантема ветковая летсгоу пинк||china','хризантема пинг понг вайт||china',
  'хризантема пинг понг ред||china','хризантема пион вайт||china',
  'хризантема пион пинк||china','хризантема пионовидная вайт||china',
  'эксплоуер|40|china','эксплоуер|50|china','эксплоуер|60|china',
  'эксплоуер|90|china','эсперанс|40|china','эустома вайт||china','микс|40|china',
]);

const sq = s => s != null ? "'" + String(s).replace(/'/g, "''") + "'" : 'NULL';

const products = [];
const seen = new Set();

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const rawName = String(row[1] || '').trim();
  const rawPrice = row[6];
  if (!rawName || rawName === '0') continue;
  if (/^[А-ЯЁA-Z\s\/\-]+$/.test(rawName) && rawName === rawName.toUpperCase() && rawName.length > 2) continue;

  const origin = i < chinaIdx ? 'holland' : 'china';
  const { ls, lc, v } = parseLen(rawName);
  let cn = cleanN(v);
  if (!cn) continue;

  const price = typeof rawPrice === 'number' ? Math.round(rawPrice) : 0;
  const lcKey = cn.toLowerCase() + '|' + (lc || '') + '|' + origin;
  if (seen.has(lcKey) || existing.has(lcKey)) { seen.add(lcKey); continue; }
  seen.add(lcKey);

  const [subcategory, vtype, packSize] = cat(cn);
  const dn = cn.charAt(0).toUpperCase() + cn.slice(1);
  const fn = dn + (ls ? ' ' + ls : '');
  products.push({ fn, dn, ls, lc, origin, price, subcategory, vtype, packSize });
}

const pv = products.map(p =>
  '  (' + [sq(p.fn), sq(p.dn), "'cut'", sq(p.subcategory), sq(p.vtype),
           sq(p.origin), p.lc || 'NULL', sq(p.ls), p.packSize, 'false'].join(',') + ')'
).join(',\n');

const prv = products.map(p =>
  '  (' + [sq(p.fn), sq(p.origin), p.price].join(',') + ')'
).join(',\n');

const sql = `-- ${products.length} new products (qty=0, is_active=false)
WITH inserted AS (
  INSERT INTO products (name, variety_name, category, subcategory, variety_type, origin, length_cm, length_str, pack_size, is_active)
  VALUES
${pv}
  RETURNING id, name, origin
),
prices(product_name, product_origin, price) AS (
  VALUES
${prv}
)
INSERT INTO stock (product_id, price, qty, qty_reserved, is_available)
SELECT i.id, p.price::numeric, 0, 0, false
FROM inserted i
JOIN prices p ON p.product_name = i.name AND p.product_origin = i.origin;`;

process.stdout.write(sql + '\n');
