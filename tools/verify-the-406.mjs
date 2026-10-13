// Explore's "Over time" for a question whose deck slide says it isn't tracked draws a
// sentence in the deck's words, not a trend (THE-406). Slide 5 says T01_Q3 is "Not
// showing tracked data due to change in answer choices asked", and Explore drew it
// over all four waves anyway: 2020's answer list was redesigned, and 2026 added "The
// rising cost of living", which then led a line through three waves nobody was
// asked it. Slide 39's six statements carry the same note in other words (review
// of #32).
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-406.mjs [--url http://localhost:5173]
// Reads what Chart.js paints and what the figure says. Exits 1 on any failure.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = (urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173')).replace(/\/$/, '');

const DECK = 'Not showing tracked data due to change in answer choices asked';
const WAVE = /^20(20|22|24|26)\*?$/;

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

// What a figure shows: its painted chart, if any, a table, and the sentence drawn in
// place of a chart.
async function figure(page, scope) {
  return page.evaluate(async (scope) => {
    const { Chart } = await import('/src/charts/setup.ts');
    const host = scope.slide
      ? [...document.querySelectorAll('.chart-cell')].find((c) => (c.querySelector('.slide-ref')?.textContent ?? '').match(/slide (\d+)/)?.[1] === String(scope.slide))
      : document.querySelector('.explorer-figure');
    const canvas = host?.querySelector('canvas');
    const chart = canvas ? Chart.getChart(canvas) : null;
    return {
      found: Boolean(host),
      labels: chart ? (chart.data.labels ?? []).map((l) => [].concat(l).join(' ')) : null,
      sets: chart ? chart.data.datasets.map((d) => d.label) : null,
      table: Boolean(host?.querySelector('table')),
      sentence: host?.querySelector('.not-asked')?.textContent?.trim() ?? null,
    };
  }, scope);
}

const results = [];
async function check(name, width, path, scope, test) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let pass = false;
  let detail = '';
  try {
    await page.goto(`${BASE}/${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const got = await figure(page, scope);
    pass = got.found && test(got) && errors.length === 0;
    detail = got.sentence ? `sentence "${got.sentence}"` : `chart ${JSON.stringify(got.labels)} sets ${JSON.stringify(got.sets)} table ${got.table}`;
  } catch (e) {
    detail = e.message.split('\n')[0];
  } finally {
    await context.close();
  }
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}${errors.length ? ` | page errors: ${[...new Set(errors)].join(' | ')}` : ''}`);
}

// No trend: no chart, no table, and the deck's own words in their place.
const saying = (note) => (got) => got.labels === null && !got.table && (got.sentence ?? '').includes(note);
const sentence = saying(DECK);

// Every question on every chart whose deck note mentions tracking at all, read
// more widely than the code reads it, so a note worded another way or a question
// that isn't a chart's first can't slip past (review of #32): slide 39 says
// "Tracked data not shown due to changes in statements in 2026" of all six of its
// statements. Each one asked in more than one wave must draw that note over time,
// not a trend. One asked in a single wave has no trend to hide, and draws that wave,
// as every other question new in 2026 does (second review of #32).
const untracked = await (async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  const found = await page.evaluate(async () => {
    const { themes, question, waves } = await import('/src/content.ts');
    return themes.flatMap((t) => t.charts).flatMap((c) => {
      const note = (c.caveat ?? '').split('|').map((n) => n.trim()).find((n) => /tracked/i.test(n));
      return note ? c.questions.map((code) => ({
        code, slide: c.slide, note: note.replace(/\.$/, ''),
        waves: (question(code)?.waves ?? waves.map((w) => w.year)).map(String),
      })) : [];
    });
  });
  await page.close();
  return found;
})();
{
  // T01_Q3 is the ticket's case, and a statement on slide 39 asked in several waves
  // is the review's; without both the sweep below proves less than it says.
  const pass = untracked.some((u) => u.code === 'T01_Q3')
    && untracked.some((u) => u.slide !== 5 && u.waves.length > 1);
  results.push({ name: 'guard', pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  guard: the deck's notes on tracking name T01_Q3 and slide 39's statements: `
    + untracked.map((u) => `${u.code} (slide ${u.slide}, ${u.waves.join('/')})`).join(', '));
}
for (const u of untracked) {
  if (u.waves.length > 1) {
    await check(`Explore ${u.code} (slide ${u.slide}) Over time says "${u.note}", not a trend`, 1280,
      `#/explore?q=${u.code}&chart=line`, {}, saying(u.note));
  } else {
    await check(`Explore ${u.code} (slide ${u.slide}), asked in ${u.waves[0]} only, still draws that one wave over time`, 1280,
      `#/explore?q=${u.code}&chart=line`, {}, (got) => JSON.stringify(got.labels) === JSON.stringify(u.waves) && got.sentence === null);
  }
}
await check('Explore T09_Q3_PROBLEM Over time split by sex draws no trend either', 1280,
  '#/explore?q=T09_Q3_PROBLEM&chart=line&cmp=gender', {}, saying('Tracked data not shown due to changes in statements in 2026'));

for (const width of [1280, 390]) {
  await check(`at ${width}px, Explore T01_Q3 Over time draws no trend and says why in the deck's words`, width,
    '#/explore?q=T01_Q3&chart=line', {}, sentence);
}
for (const [what, extra] of [['for women', '&gender=female'], ['split by sex', '&cmp=gender'], ['compared by wave', '&cmp=wave']]) {
  await check(`Explore T01_Q3 Over time ${what} draws no trend either`, 1280, `#/explore?q=T01_Q3&chart=line${extra}`, {}, sentence);
}

// Controls: what the ticket leaves alone.
await check('control: Explore T01_Q3 on Horizontal bars still draws its eight answers', 1280,
  '#/explore?q=T01_Q3&chart=hbar', {}, (got) => (got.labels ?? []).length === 8 && got.sentence === null);
await check('control: Explore T01_Q1, a tracked question, still draws all four waves over time', 1280,
  '#/explore?q=T01_Q1&chart=line', {}, (got) => (got.labels ?? []).length === 4 && got.labels.every((l) => WAVE.test(l)) && got.sentence === null);
await check('control: Explore T12_Q2, not tracked but with no such note on its slide, still draws four waves', 1280,
  '#/explore?q=T12_Q2&chart=line', {}, (got) => (got.labels ?? []).length === 4 && got.labels.every((l) => WAVE.test(l)) && got.sentence === null);
await check('control: slide 5 on its theme page still draws its eight answers', 1280,
  '#/theme/afro-optimism', { slide: 5 }, (got) => (got.labels ?? []).length === 8 && got.sentence === null);

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
