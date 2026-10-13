// Charts that list categories rank largest first; answer scales keep their own
// order (THE-386, the rule promised to the client on 28 and 29 Sep). Ishwar's
// answers on THE-386 (8 Oct): single-answer lists and multi-selects drawn as bars
// or horizontal bars rank; Don't know, Other and None of these always go last;
// a split by waves ranks by the latest wave; Explore follows the same rule. A
// split by men and women ranks by everyone's figure, so it keeps the unsplit
// chart's order (review of #27).
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

const TRAILING = /^(don'?t know|dk\b|other\b|none of (these|the above)|all other answers)/i;

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
// Everyone's figure for every answer of a theme-page chart, not only the ten it
// draws, from the model's own everyoneOf: what a split by men and women ranks by.
const everyone = (slug, slide) => page.evaluate(async ({ slug, slide }) => {
  const { theme } = await import('/src/content.ts');
  const { everyoneOf, DEFAULT_FILTERS } = await import('/src/model.ts');
  const t = theme(slug);
  const m = everyoneOf(t.charts.find((c) => c.slide === slide), t, DEFAULT_FILTERS);
  return Object.fromEntries(m.categories.map((c, i) => [c, m.series[0].values[i]]));
}, { slug, slide });
// Split by men and women: every bar but Don't know, Other and None of these has
// an everyone figure, and the bars run in descending order of it, with those
// three last (second review of #27). An answer outside everyone's top ten was
// still asked, so it has a figure and ranks by it.
function byEveryone(drawn, figures) {
  const body = drawn.filter((l) => !TRAILING.test(l));
  const values = body.map((l) => figures[l]);
  return body.length > 1 && values.every((v) => typeof v === 'number')
    && values.every((v, i) => i === 0 || values[i - 1] >= v)
    && drawn.slice(body.length).every((l) => TRAILING.test(l));
}
const withEveryone = (c, figures) => (c ? c.labels.map((l) => `${l.slice(0, 14)} ${figures[l] ?? 'none'}`).join(' | ') : 'no chart');

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
check('slide 5 split by men and women keeps the unsplit chart\'s order', Boolean(g5) && Boolean(s5) && g5.sets.length === 2
  && JSON.stringify(g5.labels) === JSON.stringify(s5.labels),
  `${g5?.labels.map((l) => l.slice(0, 18)).join(' | ')} || unsplit ${s5?.labels.map((l) => l.slice(0, 18)).join(' | ')}`);
const s37 = await theme('news-trust-and-the-fake-news-crisis', 37);
check('slide 37 (T09_Q1) puts Don\'t know last and ranks the rest', Boolean(s37) && s37.labels.some((l) => TRAILING.test(l))
  && ranked(s37.labels, s37.sets[0].data), show(s37));
// Every multi-select on the theme pages, split by men and women, against
// everyone's figure for each bar it draws.
for (const [slug, slide] of [['news-trust-and-the-fake-news-crisis', 37], ['afro-optimism', 6], ['the-multilateral-order', 14],
  ['democracy-and-governance', 18], ['identity-and-emigration', 27], ['climate-change', 47]]) {
  const g = await theme(slug, slide, 'gender');
  const figures = await everyone(slug, slide);
  check(`slide ${slide} split by men and women ranks every bar by everyone's figure`, Boolean(g) && g.sets.length === 2
    && byEveryone(g.labels, figures), withEveryone(g, figures));
}
const e37 = await explore('q=T09_Q1&chart=hbar');
check('Explore T09_Q1 on Horizontal bars puts Don\'t know last and ranks the rest', Boolean(e37) && ranked(e37.labels, e37.sets[0].data), show(e37));
// "Over time" on a multi-select draws bars, because its categories are answers,
// not waves (render.ts), so it is a ranked list like any other (review of #27).
const l37 = await explore('q=T09_Q1&chart=line');
check('Explore T09_Q1 Over time, drawn as bars, puts Don\'t know last and ranks the rest', Boolean(l37) && l37.type === 'bar'
  && l37.labels.some((l) => TRAILING.test(l)) && ranked(l37.labels, l37.sets[0].data), show(l37));

// A list over time draws its largest answers in the latest wave, largest first
// (Ishwar's third answer on THE-386; review of #27). Cut by sex, it draws
// everyone's, so a split's Men and Women lines are the same answer.
//
// T01_Q3 is the one list over time, and from THE-406 Explore draws it as a
// sentence: slide 5 says it isn't tracked (tools/verify-the-406.mjs). The rule is
// still the model's, so these read the model on the spec Explore drew before
// THE-406, without the deck's note: the lines a list over time draws.
const datasets = (c) => (c ? c.sets.map((s) => `${s.label.slice(0, 18)} ${s.data[s.data.length - 1]}`).join(' | ') : 'no chart');
const listOverTime = (filters) => page.evaluate(async (filters) => {
  const { question, themeOf } = await import('/src/content.ts');
  const { buildViewModel, DEFAULT_FILTERS } = await import('/src/model.ts');
  const q = question('T01_Q3');
  const spec = { theme: q.theme, order: 1, title: q.label, type: 'line', questions: [q.code],
    comparison: 'tracked', slide: null, caveat: null, showing: null };
  const m = buildViewModel(spec, themeOf(q), { ...DEFAULT_FILTERS, ...filters });
  return m.series.length ? { sets: m.series.map((s) => ({ label: s.label, data: s.values })) } : null;
}, filters);
const t3 = await listOverTime({});
check('T01_Q3 over time draws its lines ranked by the latest wave', Boolean(t3) && t3.sets.length === 3
  && ranked(t3.sets.map((s) => s.label), t3.sets.map((s) => s.data[s.data.length - 1])), datasets(t3));
// The three lines are the three largest, not only in order: the check above
// passed with the three smallest (review of #28). Every answer's latest share
// comes from the model's everyoneOf, on the same spec; each line drawn must be at
// least as large as every answer left out, Don't know, Other and None of these
// aside.
const t3every = await page.evaluate(async () => {
  const { question, themeOf } = await import('/src/content.ts');
  const { everyoneOf, DEFAULT_FILTERS } = await import('/src/model.ts');
  const q = question('T01_Q3');
  const spec = { theme: q.theme, order: 1, title: q.label, type: 'line', questions: [q.code],
    comparison: 'tracked', slide: null, caveat: null, showing: null };
  return everyoneOf(spec, themeOf(q), DEFAULT_FILTERS).series
    .map((s) => ({ label: s.label, latest: s.values[s.values.length - 1] }));
});
const t3answers = await original('T01_Q3');
const t3drawn = t3 ? t3.sets.map((s) => ({ label: s.label, latest: s.data[s.data.length - 1] })) : [];
const t3figure = new Map(t3every.map((a) => [a.label, a.latest]));
const t3left = t3every.filter((a) => !TRAILING.test(a.label) && !t3drawn.some((d) => d.label === a.label));
const t3smallest = Math.min(...t3drawn.map((d) => d.latest));
check('T01_Q3 over time draws its three largest answers in the latest wave', t3drawn.length === 3
  // Every answer has a figure, so none escapes the comparison...
  && t3every.length === t3answers.length && t3answers.every((l) => t3figure.has(l))
  // ...and they are the figures the lines carry.
  && t3drawn.every((d) => Math.abs((t3figure.get(d.label) ?? NaN) - d.latest) < 1e-9)
  && t3left.length > 0 && t3left.every((a) => a.latest <= t3smallest),
  `drawn ${t3drawn.map((d) => `${d.label.slice(0, 18)} ${d.latest}`).join(' | ')}`
  + ` || left out ${t3left.map((a) => `${a.label.slice(0, 18)} ${a.latest}`).join(' | ')}`);
const t3w = await listOverTime({ gender: 'female' });
check('T01_Q3 over time for women draws everyone\'s lines, in everyone\'s order', Boolean(t3w) && Boolean(t3)
  && JSON.stringify(t3w.sets.map((s) => s.label)) === JSON.stringify(t3.sets.map((s) => s.label)), `${datasets(t3w)} || everyone ${datasets(t3)}`);
const t3m = await listOverTime({ gender: 'male' });
const t3s = await listOverTime({ compare: 'gender' });
check('T01_Q3 over time split by sex draws one answer for both: the men-only and women-only first lines',
  Boolean(t3s && t3m && t3w && t3) && t3s.sets.length === 2
  && t3m.sets[0].label === t3.sets[0].label && t3w.sets[0].label === t3.sets[0].label
  && JSON.stringify(t3s.sets[0].data) === JSON.stringify(t3m.sets[0].data)
  && JSON.stringify(t3s.sets[1].data) === JSON.stringify(t3w.sets[0].data),
  `Men ${JSON.stringify(t3s?.sets[0]?.data)} vs ${t3m?.sets[0]?.label.slice(0, 18)} ${JSON.stringify(t3m?.sets[0]?.data)}; `
  + `Women ${JSON.stringify(t3s?.sets[1]?.data)} vs ${JSON.stringify(t3w?.sets[0]?.data)}`);
const t4 = await explore('q=T04_Q1&chart=line');
const t4want = await original('T04_Q1');
check('control: Explore T04_Q1 Over time, a scale, keeps its answers\' order', Boolean(t4) && t4.sets.length > 1
  && JSON.stringify(t4.sets.map((s) => s.label)) === JSON.stringify(t4want.slice(0, t4.sets.length)),
  `${t4?.sets.map((s) => s.label).join(' / ')} | original ${t4want.join(' / ')}`);

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
