/**
 * Builds src/data/ciqual.json from the official ANSES Ciqual spreadsheet (IMPLEMENTATION_NOTES J-02).
 *
 * Usage: node tools/build-ciqual.mjs "<path to Table Ciqual 2025_FR_2025_11_03.xlsx>"
 *
 * Source: Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025.
 * https://doi.org/10.57745/RDMHWY (licence Etalab 2.0). The raw file is not committed.
 *
 * Only the constituents shown by the app are kept: energy (kcal, Regulation EU 1169/2011),
 * proteins (N x Jones factor), carbohydrates and fat, per 100 g. No dependency: the xlsx
 * container is read with node:zlib and the two XML parts with regular expressions.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const TABLE_VERSION = 'Ciqual 2025 (2025-11-03)';
const TABLE_DOI = '10.57745/RDMHWY';
const OUTPUT = 'src/data/ciqual.json';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node tools/build-ciqual.mjs <Table Ciqual xlsx>');
  process.exit(1);
}
const zip = readFileSync(input);

/** Minimal zip reader: central directory, stored or deflated entries. */
function readZipEntry(buf, name) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLength);
    if (entryName === name) {
      const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(dataStart, dataStart + compressedSize);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`missing ${name}`);
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

const shared = [...readZipEntry(zip, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
);

const sheet = readZipEntry(zip, 'xl/worksheets/sheet1.xml');
const rows = [];
for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const cells = {};
  for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = c[2];
    const body = c[3] ?? '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];
    let value = null;
    if (/t="s"/.test(attrs) && v !== undefined) value = shared[Number(v)];
    else if (inline !== undefined) value = decodeXml(inline);
    else if (v !== undefined) value = decodeXml(v);
    cells[c[1]] = value;
  }
  rows.push(cells);
}

const header = rows[0];
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const column = (predicate, label) => {
  const entry = Object.entries(header).find(([, name]) => predicate(flat(name)));
  if (!entry) throw new Error(`column not found: ${label}`);
  return entry[0];
};
const COL = {
  group: column((n) => n === 'alim_grp_nom_fr', 'group'),
  code: column((n) => n === 'alim_code', 'code'),
  name: column((n) => n === 'alim_nom_fr', 'name'),
  kcal: column((n) => n.startsWith('Energie, Règlement UE N° 1169 2011 (kcal'), 'kcal'),
  protein: column((n) => n.startsWith('Protéines, N x facteur de Jones'), 'protein'),
  carbs: column((n) => n.startsWith('Glucides'), 'carbs'),
  fat: column((n) => n.startsWith('Lipides'), 'fat'),
};

const stats = { rows: 0, kept: 0, noEnergy: 0, traces: 0, belowLimit: 0, missingMacro: 0 };
/**
 * Ciqual cell values: "12,5", "< 0,5" (below the quantification limit), "traces", "-" (no data).
 * "traces" and "< x" become 0 (negligible amounts, below 1 g or 1 kcal per 100 g for the kept
 * constituents), "-" becomes null (unknown).
 */
function value(raw) {
  const s = flat(raw);
  if (s === '' || s === '-') return null;
  if (/^traces$/i.test(s)) {
    stats.traces++;
    return 0;
  }
  if (s.startsWith('<')) {
    stats.belowLimit++;
    return 0;
  }
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`unexpected value "${s}"`);
  return Math.round(n * 100) / 100;
}

const groups = [];
const foods = [];
for (const r of rows.slice(1)) {
  if (!r[COL.code]) continue;
  stats.rows++;
  const kcal = value(r[COL.kcal]);
  if (kcal === null) {
    stats.noEnergy++;
    continue;
  }
  const group = flat(r[COL.group]) || 'Autres';
  let gi = groups.indexOf(group);
  if (gi < 0) gi = groups.push(group) - 1;
  const macros = [value(r[COL.protein]), value(r[COL.carbs]), value(r[COL.fat])];
  if (macros.includes(null)) stats.missingMacro++;
  foods.push([Number(r[COL.code]), flat(r[COL.name]), gi, kcal, ...macros]);
  stats.kept++;
}
foods.sort((a, b) => a[0] - b[0]);

const out = {
  table: TABLE_VERSION,
  doi: TABLE_DOI,
  license: 'Etalab 2.0',
  sourceSha256: createHash('sha256').update(zip).digest('hex'),
  columns: ['code', 'name', 'group', 'kcal', 'proteinG', 'carbsG', 'fatG'],
  groups,
  foods,
};
mkdirSync('src/data', { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(out)}\n`);
console.log(JSON.stringify({ output: OUTPUT, ...stats, groups: groups.length }, null, 2));
