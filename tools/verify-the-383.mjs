// Every tracked chart of a single-answer question, checked for answers that add
// up to more than everyone asked. In each wave the answers a chart draws may
// total 100% at most (THE-383). Each answer used to be a trend of its own, so
// slide 3's three answers came to 215% of the people asked in 2026.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-383.mjs [--url http://localhost:5173]
// Every theme page, and every question in Explore drawn over time, for all
// respondents and for women. Reads what Chart.js paints: for a line or a bar per
// wave, the answers in each wave; for a pie, its slices (the latest wave). Exits
// 1 on any total over 100, or when a chart it must reach was never checked.
//
// A question whose answer list stops short must also total under 100: slide 31
// (T07_Q3) holds only "Strongly agree" and "Somewhat agree", and two answers that
// make up the whole of every wave read as "nobody disagreed" (review of #24).
//
// Slides 22, 33, 41 and 45 chart several questions, and the prototype draws the
// first question's answers only. Their lines are marked "first question only":
// once those charts draw one line per question, lines from different questions
// may rightly total over 100, and this check must stop adding them up.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = (urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173')).replace(/\/$/, '');

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

// Each painted chart's answers per wave. `scope` is the selector the charts sit
// in, so a theme page's cards and Explore's one figure are read the same way.
async function painted(page, scope) {
  return page.evaluate(async (scope) => {
    const { Chart } = await import('/src/charts/setup.ts');
    const out = [];
    for (const canvas of document.querySelectorAll(`${scope} canvas`)) {
      const chart = Chart.getChart(canvas);
      if (!chart) continue;
      const slide = (canvas.closest('.chart-cell')?.querySelector('.slide-ref')?.textContent ?? '')
        .match(/slide (\d+)/)?.[1] ?? null;
      const labels = (chart.data.labels ?? []).map((l) => [].concat(l).join(' '));
      const sets = chart.data.datasets;
      const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      let waves;
      if (chart.config.type === 'pie' || chart.config.type === 'doughnut') {
        waves = [{ wave: sets[0]?.label ?? 'latest', total: sets[0]?.data.reduce((s, v) => s + num(v), 0) ?? 0,
          parts: sets[0]?.data.map(num) ?? [] }];
      } else if (labels.length > 0 && labels.every((l) => /^20\d\d\*?$/.test(l))) {
        waves = labels.map((wave, i) => ({ wave, total: sets.reduce((s, d) => s + num(d.data[i]), 0),
          parts: sets.map((d) => num(d.data[i])) }));
      } else {
        waves = null;   // categories are not waves: not an answer-per-line chart
      }
      out.push({ slide, type: chart.config.type, answers: sets.map((d) => d.label), waves });
    }
    return out;
  }, scope);
}

const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/#/`, { waitUntil: 'load' });

// The charts that must be checked, from the content the page is built from: every
// tracked chart whose question is single-answer and not a grid. A grid's rows are
// questions of their own, so their figures are not one distribution.
const { tracked, explore } = await page.evaluate(async () => {
  const c = await import('/src/content.ts');
  const single = (code) => {
    const q = c.question(code);
    return Boolean(q) && q.responseType !== 'multi';
  };
  const grid = (codes) => codes.length > 1 && codes.every((code) => Boolean(c.question(code)?.parent));
  const parents = new Set(c.questions.map((q) => q.parent).filter(Boolean));
  return {
    tracked: c.themes.flatMap((t) => t.charts
      .filter((s) => s.comparison === 'tracked' && !grid(s.questions) && single(s.questions[0] ?? ''))
      .map((s) => ({ theme: t.slug, slide: String(s.slide), several: s.questions.length > 1 }))),
    explore: c.questions.filter((q) => q.responseType !== 'multi' && !parents.has(q.code)).map((q) => q.code),
  };
});

const results = [];
const over = (r) => r.waves.filter((w) => w.total > 100 + 1e-9);

for (const theme of [...new Set(tracked.map((t) => t.theme))]) {
  await page.goto(`${BASE}/#/theme/${theme}`);
  await page.waitForTimeout(1500);
  const charts = await painted(page, '.chart-cell');
  for (const want of tracked.filter((t) => t.theme === theme)) {
    const found = charts.find((ch) => ch.slide === want.slide && ch.waves);
    results.push({ where: `theme/${theme} slide ${want.slide}`, several: want.several, found: Boolean(found), ...(found ?? {}) });
  }
}

for (const code of explore) {
  for (const extra of ['', '&gender=female']) {
    await page.goto(`${BASE}/#/explore?q=${code}&chart=line${extra}`);
    await page.waitForTimeout(400);
    const [found] = (await painted(page, '.explorer-figure')).filter((ch) => ch.waves);
    // A row asked in no wave draws a sentence, not a chart: nothing to add up.
    const sentence = await page.evaluate(() => Boolean(document.querySelector('.explorer-figure .not-asked')));
    results.push({ where: `explore ${code}${extra}`, found: Boolean(found), sentence, ...(found ?? {}) });
  }
}
await browser.close();

let failed = 0;
for (const r of results) {
  if (!r.found) {
    if (r.sentence) { console.log(`SKIP  ${r.where}: not asked in any wave, so no chart`); continue; }
    failed += 1;
    console.log(`FAIL  ${r.where}: no chart with a wave per category was drawn`);
    continue;
  }
  const bad = over(r);
  if (bad.length) failed += 1;
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${r.where} (${r.type}${r.several ? ', first question only' : ''}): `
    + r.waves.map((w) => `${w.wave} ${Math.round(w.total * 10) / 10}`).join(', ')
    + (bad.length ? ` | over 100 in ${bad.map((w) => `${w.wave} (${w.parts.join(' + ')})`).join('; ')}` : ''));
}

// The two cases the ticket names must have been reached: a sweep that quietly
// checked nothing would otherwise pass.
const reached = (where) => results.some((r) => r.found && r.where.startsWith(where));
const guards = [
  ['slide 3 (T01_Q1) was checked', reached('theme/afro-optimism slide 3')],
  ['Explore T02_Q1 over time was checked', reached('explore T02_Q1')],
  ['every tracked single-answer chart on a theme page was reached', results.filter((r) => r.where.startsWith('theme/')).every((r) => r.found)],
];
// The questions whose answer lists hold only the agree side total under 100 in
// every wave, for all respondents and for women.
for (const where of ['theme/identity-and-social-justice slide 31', 'explore T12_Q2', 'explore T12_Q3']) {
  const runs = results.filter((r) => r.found && (r.where === where || r.where === `${where}&gender=female`));
  const full = runs.flatMap((r) => r.waves.filter((w) => w.total >= 99.95).map((w) => `${r.where} ${w.wave}`));
  guards.push([`${where} totals under 100 in every wave, as its list stops short`, runs.length > 0 && full.length === 0,
    full.length ? `100 in ${full.join(', ')}` : '']);
}
for (const [what, ok, detail] of guards) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  guard: ${what}${detail ? ` (${detail})` : ''}`);
}
if (errors.length) console.log(`page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
const checked = results.filter((r) => r.found).length;
console.log(`${checked} charts checked (${tracked.length} on theme pages), ${failed} failed, ${errors.length} page error(s)`);
process.exit(failed || errors.length ? 1 : 0);
