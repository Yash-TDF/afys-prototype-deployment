// A chart of several questions draws one line per question (THE-398): slide 41's three and
// slide 45's two, each named by what its question's note names, over the waves that question
// was asked. Ishwar's review of #31 added three rules, checked here too: a split by men and women
// is refused on these charts (it would keep only the first line), the lines share no base (they
// are separate questions), and a landing tile reads its chart's first line, so the two agree.
// Also, at phone width no "View as a table" runs off the screen, and a table that scrolls inside
// its card shows a shadow saying so.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-398.mjs [--url http://localhost:5173]
// Reads what Chart.js paints, the notes and the table under each chart. Exits 1 on any failure.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = (urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173')).replace(/\/$/, '');

// What each slide's lines are called (the answers its notes name, as written), which lines start
// in 2022, and the caption its landing tile carries for the chart's first line.
const SLIDES = {
  41: {
    theme: 'government-satisfaction',
    tile: 'Government Satisfaction',
    lines: ['Very good or Good', 'Get better', 'I will have a better life than my parents did'],
    from2022: ['I will have a better life than my parents did'],
    caption: 'Expect a very good or good quality of life',
  },
  45: {
    theme: 'climate-change',
    tile: 'Climate Change',
    lines: ['Very concerned + Somewhat concerned', 'Very satisfied + Somewhat satisfied'],
    from2022: ['Very satisfied + Somewhat satisfied'],
    caption: 'Very or somewhat concerned about climate change',
  },
};

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });
const errors = [];
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
};

async function fresh(width) {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}
async function open(page, hash, compare) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  if (compare) {
    await page.evaluate((value) => {
      const field = [...document.querySelectorAll('label.field')].find((l) => l.querySelector('span')?.textContent === 'Compare by');
      const select = field?.querySelector('select');
      if (select) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }
    }, compare);
    await page.waitForTimeout(1200);
  }
}

// One theme-page chart as painted: its lines, the notes under it, and the table's headings.
const chart = (page, slide) => page.evaluate(async (slide) => {
  const { Chart } = await import('/src/charts/setup.ts');
  const cell = [...document.querySelectorAll('.chart-cell')]
    .find((c) => (c.querySelector('.slide-ref')?.textContent ?? '').match(/slide (\d+)/)?.[1] === String(slide));
  const c = cell?.querySelector('canvas') ? Chart.getChart(cell.querySelector('canvas')) : null;
  if (!c) return null;
  return {
    categories: (c.data.labels ?? []).map((l) => [].concat(l).join(' ')),
    lines: c.data.datasets.map((d) => ({ label: d.label, data: d.data.map((v) => (typeof v === 'number' ? v : null)) })),
    notes: [...cell.querySelectorAll('p.note')].map((p) => p.textContent.trim()),
    // Each heading ends in its sort arrow, which is not part of the name.
    tableHead: [...cell.querySelectorAll('table thead th')].map((th) => th.textContent.replace(/[▾▴▲▼]/g, '').trim()),
  };
}, slide);

const show = (c) => (c ? c.lines.map((l) => l.label).join(' | ') : 'no chart');

for (const width of [1280, 390]) {
  for (const [slide, want] of Object.entries(SLIDES)) {
    const page = await fresh(width);
    await open(page, `#/theme/${want.theme}`);
    const got = await chart(page, slide);
    const labels = got?.lines.map((l) => l.label) ?? [];
    check(`at ${width}px, slide ${slide} draws one line per question, named by its note, in the legend and the table`,
      Boolean(got) && JSON.stringify(labels) === JSON.stringify(want.lines) && want.lines.every((n) => got.tableHead.includes(n)), show(got));

    const at2020 = got?.categories.indexOf('2020') ?? -1;
    const wrong = (got?.lines ?? []).filter((l) => (want.from2022.includes(l.label) ? l.data[at2020] !== null : typeof l.data[at2020] !== 'number'));
    const said = want.from2022.every((n) => got?.notes.some((note) => note.includes(`“${n}”`) && note.includes('2020')));
    check(`at ${width}px, slide ${slide}: a question first asked in 2022 has no 2020 point, and the chart says so`,
      Boolean(got) && at2020 >= 0 && wrong.length === 0 && said, JSON.stringify({ wrong: wrong.map((l) => l.label), said }));

    // Separate questions, separate bases: no one "Base (n)" per wave across the lines (review of #31).
    check(`at ${width}px, slide ${slide}'s table carries no shared base column`,
      Boolean(got) && !got.tableHead.some((h) => /^Base/.test(h)), JSON.stringify(got?.tableHead ?? null));
    await page.close();
  }
}

// A split by men and women would keep only each cut's first line: refused, and every line stays.
for (const [slide, want] of Object.entries(SLIDES)) {
  const page = await fresh(1280);
  await open(page, `#/theme/${want.theme}`, 'gender');
  const got = await chart(page, slide);
  const labels = got?.lines.map((l) => l.label) ?? [];
  check(`slide ${slide} split by men and women is refused, and keeps all its lines`,
    Boolean(got) && JSON.stringify(labels) === JSON.stringify(want.lines)
      && got.notes.some((n) => n.includes('one line per question') && n.includes('cannot also split by gender')),
    `${show(got)} || ${got?.notes.find((n) => n.includes('split')) ?? 'no refusal note'}`);
  await page.close();
}

// Each landing tile reads its chart's first line, so the card and the chart agree (review of #31).
{
  const page = await fresh(1280);
  for (const [slide, want] of Object.entries(SLIDES)) {
    await open(page, `#/theme/${want.theme}`);
    const line = (await chart(page, slide))?.lines[0] ?? null;
    await open(page, '#/');
    const tile = await page.evaluate((name) => {
      const t = [...document.querySelectorAll('.tile')].find((x) => x.querySelector('.theme-tag')?.textContent?.trim() === name);
      return t && { value: t.querySelector('.tstat-v')?.textContent ?? null, caption: t.querySelector('.tstat-of')?.textContent?.trim() ?? null };
    }, want.tile);
    // The card prints whole numbers, rounded half away from zero (ui/format.ts).
    const last = line?.data.filter((v) => v !== null).at(-1);
    const shown = last === undefined ? null : `${Math.sign(last) * Math.round(Math.abs(last))}%`;
    check(`the ${want.tile} tile reads slide ${slide}'s first line, with its caption`,
      // The caption, then since THE-416 " · N countries asked in every wave".
      Boolean(tile && line) && tile.value === shown && tile.caption?.split(' · ')[0] === want.caption,
      `tile ${tile?.value} "${tile?.caption}" | chart's first line ${line?.label} ends at ${last}`);
  }
  await page.close();
}

// Control: a chart of one question still draws that question's answers (slide 3, T01_Q1).
{
  const page = await fresh(1280);
  await open(page, '#/theme/afro-optimism');
  const got = await chart(page, 3);
  const answers = await page.evaluate(async () => {
    const { question } = await import('/src/content.ts');
    const { optionsFor } = await import('/src/illustrative.ts');
    return optionsFor('T01_Q1', question('T01_Q1')?.text ?? '', null).labels.slice(0, 3);
  });
  check('control: slide 3, one question, draws its own first three answers', Boolean(got)
    && JSON.stringify(got.lines.map((l) => l.label)) === JSON.stringify(answers), `${show(got)} | answers ${answers.join(' | ')}`);
  await page.close();
}

// At phone width no table runs off the screen, and one that scrolls inside its card shows it.
{
  const page = await fresh(390);
  await open(page, '#/');
  const slugs = await page.evaluate(async () => (await import('/src/content.ts')).themes.map((t) => t.slug));
  const pages = [...slugs.map((s) => `#/theme/${s}`), '#/methodology', '#/explore?q=T10_Q1&chart=line', '#/explore?q=T01_Q3&chart=hbar'];
  const wrong = [];
  let tables = 0;
  for (const hash of pages) {
    await open(page, hash);
    const got = await page.evaluate(() => {
      for (const d of document.querySelectorAll('details')) d.open = true;
      const vw = document.documentElement.clientWidth;
      const bad = [];
      for (const t of document.querySelectorAll('table')) {
        let box = t.parentElement;
        while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowX)) box = box.parentElement;
        if (box && box !== document.documentElement && box !== document.body) {
          const scrolls = box.scrollWidth > box.clientWidth + 1;
          const cue = /gradient/.test(getComputedStyle(box).backgroundImage);
          if (box.getBoundingClientRect().right > vw + 1 || (scrolls && !cue)) bad.push({ scrolls, cue });
        } else if (t.getBoundingClientRect().right > vw + 1) {
          bad.push({ tableRight: Math.round(t.getBoundingClientRect().right) });
        }
      }
      return { pageScrolls: document.documentElement.scrollWidth > vw + 1, tables: document.querySelectorAll('table').length, bad };
    });
    tables += got.tables;
    if (got.pageScrolls || got.bad.length) wrong.push({ page: hash, ...got, bad: got.bad.slice(0, 2) });
  }
  check('at 390px, on every theme page, Methodology and Explore, no table runs off the screen, and one that scrolls shows it',
    pages.length === 15 && tables > 30 && wrong.length === 0, JSON.stringify({ pages: pages.length, tables, wrong: wrong.slice(0, 3) }));
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass).length;
if (errors.length) console.log(`page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
console.log(`${results.length - failed}/${results.length} passed, ${errors.length} page error(s)`);
process.exit(failed || errors.length ? 1 : 0);
