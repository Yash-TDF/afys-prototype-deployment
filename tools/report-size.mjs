// What the page actually costs to load.
//
// The brief's tie-breaker for the charting library is bundle size, and nobody had
// measured it. This prints the real gzipped bytes of the built output, split by
// what it is, so the answer is a number rather than an argument.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const rows = walk(dist).map((path) => {
  const body = readFileSync(path);
  return {
    file: path.slice(dist.length + 1).replaceAll('\\', '/'),
    ext: extname(path),
    raw: body.length,
    gz: gzipSync(body).length,
  };
}).sort((a, b) => b.gz - a.gz);

const width = Math.max(...rows.map((r) => r.file.length));
console.log('file'.padEnd(width), 'raw'.padStart(10), 'gzipped'.padStart(10));
for (const r of rows) console.log(r.file.padEnd(width), kb(r.raw).padStart(10), kb(r.gz).padStart(10));

const entryName = (readFileSync(join(dist, 'index.html'), 'utf8').match(/assets\/[\w.-]+\.js/) ?? [''])[0];
const sum = (pred) => rows.filter(pred).reduce((a, r) => a + r.gz, 0);
const css = sum((r) => r.ext === '.css');
const html = sum((r) => r.ext === '.html');
const entry = sum((r) => r.file === entryName);
const geo = sum((r) => r.file.includes('africa'));
// Everything else is fetched only when a route that needs it is opened.
const lazy = rows.filter((r) => r.ext === '.js' && r.file !== entryName);
const geoChunk = lazy.find((r) => r.raw > 150 * 1024);

console.log('');
console.log(`Landing page  ${kb(entry + css + html)} gzipped — HTML, CSS, the app shell and the deck's structure.`);
console.log('              No charting library: the themes view draws no charts.');
console.log('');
console.log('Loaded on demand:');
for (const r of lazy.sort((a, b) => b.gz - a.gz)) {
  const what = r === geoChunk ? 'chartjs-chart-geo + d3-geo — only when a map is drawn'
    : r.gz > 20 * 1024 ? 'chart.js core — the first time any chart is drawn'
    : 'view code';
  console.log(`  ${r.file.padEnd(34)} ${kb(r.gz).padStart(9)}  ${what}`);
}
console.log(`  ${'africa.geo.json'.padEnd(34)} ${kb(geo).padStart(9)}  51 country outlines at 110m, Natural Earth`);
console.log('');
console.log(`Worst case (a map, cold cache): ${kb(entry + css + html + sum((r) => r.ext === '.js' && r.file !== entryName) + geo)} gzipped.`);
