// Charts that list categories rank largest first; answer scales keep their own
// order (THE-386, the rule promised to the client on 28 and 29 Sep). Ishwar's
// answers on THE-386 (8 Oct): single-answer lists and multi-selects drawn as bars
// or horizontal bars rank; Don't know, Other and None of these always go last;
// a split by waves ranks by the latest wave; Explore follows the same rule. A
// split by men and women ranks by the two together.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-386.mjs [--url http://localhost:5173]
// Reads what Chart.js paints and the table under the chart. Exits 1 on any failure.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = (urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173')).replace(/\/$/, '');

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const TRAILING = /^(don'?t know|dk|other\b|none of (these|the above))/i;

// One chart as drawn: its categories, each dataset's label, values and colours,
// and the first column of the table under it.
async function chart(scope) {
  return page.evaluate(async (scope) => {
    const { Chart } = await import('/src/charts/setup.ts');
    const host = scope.slide
      ? [...document.querySelectorAll('.chart-cell')].find((c) => (c.querySelector('.slide-ref')?.textContent ?? '').match(/slide (\d+)/)?.[1] === String(scope.slide))
      : document.querySelector('.explorer-figure');
    const canvas = host?.querySelector('canvas');
    const c = canvas ? Chart.getChart(canvas) : null;
    if (!c) return null;
    const rows = [...(host.querySelectorAll('table tbody tr') ?? [])].map((r) => r.children[0]?.textContent?.trim() ?? '');
    return {
      type: c.config.type,
      labels: (c.data.labels ?? []).map((l) => [].concat(l).join(' ')),
      sets: c.data.datasets.map((d) => ({ label: d.label, data: d.data.map((v) => (typeof v === 'number' ? v : null)),
        colours: [].concat(d.backgroundColor ?? []).map(String) })),
      rows,
    };
  }, scope);
}
async function theme(slug, slide, compare) {
  await page.goto(`${BASE}/#/theme/${slug}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  if (compare) {
    await page.evaluate((value) => {
      const field = [...document.querySelectorAll('label.field')].find((l) => l.querySelector('span')?.textContent === 'Compare by');
      const select = field?.querySelector('select');
      if (select) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }
    }, compare);
    await page.waitForTimeout(1200);
  }
  return chart({ slide });
}
async function explore(query) {
  await page.goto(`${BASE}/#/explore?${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  return chart({});
}
// The answers' original order, from the page's own option lists.
const original = (code) => page.evaluate(async (code) => {
  const { question } = await import('/src/content.ts');
  const { optionsFor } = await import('/src/illustrative.ts');
  const q = question(code);
  return optionsFor(code, q?.text ?? code, null).labels;
}, code);

// Ranked: figures largest first; answers with no figure next; trailing answers last.
function ranked(labels, values) {
  const kinds = labels.map((l, i) => (TRAILING.test(l) ? 2 : values[i] === null ? 1 : 0));
  const kindOrder = kinds.every((k, i) => i === 0 || kinds[i - 1] <= k);
  const nums = values.filter((v, i) => kinds[i] === 0);
  const desc = nums.every((v, i) => i === 0 || nums[i - 1] >= v);
  return kindOrder && desc;
}
const sumAt = (sets, i) => sets.reduce((t, s) => t + (s.data[i] ?? 0), 0);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
};
const show = (c) => (c ? c.labels.map((l, i) => `${l.slice(0, 22)} ${c.sets[0]?.data[i] ?? '-'}`).join(' | ') : 'no chart');

// Ranked lists.
const s5 = await theme('afro-optimism', 5);
check('slide 5 (T01_Q3) ranks its events largest first', Boolean(s5) && ranked(s5.labels, s5.sets[0].data), show(s5));
check('slide 5\'s table lists the events in the chart\'s order', Boolean(s5) && JSON.stringify(s5.rows) === JSON.stringify(s5.labels),
  JSON.stringify(s5?.rows.slice(0, 3)));
check('slide 5\'s bars keep one colour', Boolean(s5) && new Set(s5.sets[0].colours).size <= 1, JSON.stringify([...new Set(s5?.sets[0].colours ?? [])]));
const e5 = await explore('q=T01_Q3&chart=hbar');
check('Explore T01_Q3 on Horizontal bars ranks its events largest first', Boolean(e5) && ranked(e5.labels, e5.sets[0].data), show(e5));
const w5 = await theme('afro-optimism', 5, 'wave');
const latest = w5?.sets[w5.sets.length - 1];
check('slide 5 compared by wave ranks by the latest wave', Boolean(w5) && w5.sets.length > 1 && ranked(w5.labels, latest.data),
  `${latest?.label}: ${w5?.labels.map((l, i) => `${l.slice(0, 18)} ${latest.data[i]}`).join(' | ')}`);
const g5 = await theme('afro-optimism', 5, 'gender');
check('slide 5 compared by men and women ranks by the two together', Boolean(g5) && g5.sets.length === 2
  && ranked(g5.labels, g5.labels.map((_, i) => sumAt(g5.sets, i))), g5?.labels.map((l, i) => `${l.slice(0, 18)} ${Math.round(sumAt(g5.sets, i) * 10) / 10}`).join(' | '));
const s37 = await theme('news-trust-and-the-fake-news-crisis', 37);
check('slide 37 (T09_Q1) puts Don\'t know last and ranks the rest', Boolean(s37) && s37.labels.some((l) => TRAILING.test(l))
  && ranked(s37.labels, s37.sets[0].data), show(s37));
const e37 = await explore('q=T09_Q1&chart=hbar');
check('Explore T09_Q1 on Horizontal bars puts Don\'t know last and ranks the rest', Boolean(e37) && ranked(e37.labels, e37.sets[0].data), show(e37));

// Multi-selects already ranked: still ranked.
for (const [slug, slide] of [['afro-optimism', 6], ['the-multilateral-order', 14], ['democracy-and-governance', 18],
  ['identity-and-emigration', 27], ['climate-change', 47]]) {
  const c = await theme(slug, slide);
  check(`control: slide ${slide} (multi-select) is ranked`, Boolean(c) && ranked(c.labels, c.sets[0].data), show(c));
}

// Answer scales and the six non-lists keep their order, on theme pages and in Explore.
for (const code of ['T05_Q1', 'T04_Q1', 'T06_Q3', 'T11_Q2']) {
  const want = await original(code);
  const c = await explore(`q=${code}&chart=hbar`);
  const drawn = c?.labels ?? [];
  const sameOrder = drawn.length > 1 && JSON.stringify(drawn) === JSON.stringify(want.filter((l) => drawn.includes(l)));
  check(`control: Explore ${code} on Horizontal bars keeps its answers' order`, sameOrder, `${drawn.join(' / ')} | original ${want.join(' / ')}`);
}
for (const [slug, slide, code] of [['democracy-and-governance', 16, 'T04_Q1'], ['safety-security-and-extremism', 20, 'T05_Q1'],
  ['identity-and-emigration', 26, 'T06_Q3'], ['climate-change', 46, 'T11_Q2']]) {
  const want = await original(code);
  const c = await theme(slug, slide);
  // A chart over waves draws its answers as datasets; a pie as its labels.
  const drawn = c ? (c.labels.every((l) => /^20\d\d/.test(l)) ? c.sets.map((s) => s.label) : c.labels) : [];
  const sameOrder = drawn.length > 1 && JSON.stringify(drawn) === JSON.stringify(want.filter((l) => drawn.includes(l)));
  check(`control: slide ${slide} (${code}) keeps its answers' order`, sameOrder, `${drawn.join(' / ')} | original ${want.join(' / ')}`);
}

await browser.close();
const failed = results.filter((r) => !r.pass).length;
if (errors.length) console.log(`page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
console.log(`${results.length - failed}/${results.length} passed, ${errors.length} page error(s)`);
process.exit(failed || errors.length ? 1 : 0);
