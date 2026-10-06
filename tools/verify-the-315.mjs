// THE-315 check: every grid chart draws its own rows, and a grid is never read
// as one question.
//
// A grid question's rows are child questions, each with its own base. This
// checks, in a real browser against the running prototype:
//   - every grid chart's categories are its own children's row names, ranked
//     largest first by their latest figure (so slides 10 and 12, both rows of
//     T02_Q3, draw different rows);
//   - a row not asked in a wave has no value there, and the table says "Not
//     asked" (slide 13's UN, IMF and G20 are 2026 only);
//   - a single-wave grid's rows are separate figures, not one distribution;
//   - the explorer shows a grid parent as a list of its rows, never as a chart,
//     and two rows of one grid opened on their own draw different figures;
//   - a tracked grid refuses a gender split, its chips read the latest wave, and
//     it states no single base.
//
// Usage: serve the prototype with `pnpm exec vite` (`pnpm dev` rebuilds
// content.json first), then `node tools/verify-the-315.mjs [--url http://localhost:5173]`.
// Writes results.md to node_modules/.cache/verify-the-315. Exit 1 on any FAIL.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'node_modules', '.cache', 'verify-the-315');
const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const BASE = option('url', 'http://localhost:5173').replace(/\/$/, '');
const CHROME = option('chrome-path', null);
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const git = (...args) => {
  try { return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim(); } catch { return '?'; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const content = JSON.parse(readFileSync(join(ROOT, 'src/data/content.json'), 'utf8'));
const byCode = new Map(content.questions.map((q) => [q.code, q]));

/** The grid a chart plots, as src/content.ts gridOf has it: every question a row of one grid. */
const gridOf = (codes) => {
  const parents = new Set(codes.map((code) => byCode.get(code)?.parent ?? null));
  const [only] = parents;
  return codes.length > 1 && parents.size === 1 && only ? only : null;
};
const gridCharts = content.charts.filter((c) => gridOf(c.questions) && c.type !== 'pie');
const slugOf = (chart) => content.themes.find((t) => t.order === chart.theme).slug;

/** Every chart on one theme page, keyed by deck slide: what Chart.js drew, and the table. */
async function chartsOn(page, slug) {
  await page.goto(`${BASE}/#/theme/${slug}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  return page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    const out = {};
    for (const cell of document.querySelectorAll('.chart-cell')) {
      const slide = (cell.querySelector('.slide-ref')?.textContent ?? '').match(/slide (\d+)/)?.[1];
      const canvas = cell.querySelector('canvas');
      const chart = canvas ? Chart.getChart(canvas) : null;
      if (!slide) continue;
      out[slide] = {
        labels: (chart?.data?.labels ?? []).map((l) => [].concat(l).join(' ')),
        series: (chart?.data?.datasets ?? []).map((d) => d.label),
        // Null kept as null: Number(null) is 0, the very thing a gap must not be.
        values: (chart?.data?.datasets ?? []).map((d) => (d.data ?? []).map((v) => (v === null ? null : Number(v)))),
        corner: cell.querySelector('table thead th')?.textContent?.trim() ?? null,
        caption: cell.querySelector('table caption')?.textContent ?? null,
        notAsked: [...cell.querySelectorAll('table td')].filter((td) => td.textContent === 'Not asked').length,
      };
    }
    return out;
  });
}

async function explorer(page, code) {
  await page.goto(`${BASE}/#/explore?q=${code}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  return page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    const canvas = document.querySelector('.explorer-figure canvas');
    const chart = canvas ? Chart.getChart(canvas) : null;
    return {
      notice: document.querySelector('.grid-notice p')?.textContent ?? null,
      rows: [...document.querySelectorAll('.grid-notice .grid-row-link')].map((b) => b.textContent),
      canvas: Boolean(canvas),
      labels: (chart?.data?.labels ?? []).map((l) => [].concat(l).join(' ')),
      series: (chart?.data?.datasets ?? []).map((d) => d.label),
      values: (chart?.data?.datasets ?? []).map((d) => (d.data ?? []).map((v) => (v === null ? null : Number(v)))),
    };
  });
}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

const browser = await pw.chromium.launch(CHROME
  ? { headless: true, executablePath: CHROME }
  : { headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const charts = {};
for (const slug of [...new Set(gridCharts.map(slugOf))]) Object.assign(charts, await chartsOn(page, slug));

// Each row's name, worked out here from content.json rather than asked of the
// app, so a check of the page is not a check of the code against itself: the
// row's label after its grid's, else the row its text names in brackets.
const rowName = (q) => {
  const grid = byCode.get(q.parent);
  if (grid && q.label.startsWith(`${grid.label}: `)) return q.label.slice(grid.label.length + 2);
  return /\[([^\]]+)\]\s*$/.exec(q.text)?.[1] ?? q.label;
};
const names = Object.fromEntries(gridCharts.flatMap((c) => c.questions).map((code) => [code, rowName(byCode.get(code))]));

// 1. Every grid chart draws its own children, ranked by the latest figure.
const latest = (values, row) => {
  for (let s = values.length - 1; s >= 0; s -= 1) if (values[s][row] !== null) return values[s][row];
  return -1;
};
for (const chart of gridCharts) {
  const drawn = charts[String(chart.slide)];
  const expected = chart.questions.map((code) => names[code]);
  check(`slide ${chart.slide} draws its own rows`, drawn && same([...drawn.labels].sort(), [...expected].sort()),
    `drawn ${JSON.stringify(drawn?.labels)}; its questions ${JSON.stringify(expected)}`);
  const order = (drawn?.labels ?? []).map((_, row) => latest(drawn.values, row));
  check(`slide ${chart.slide} ranks its rows largest first`, order.every((v, i) => i === 0 || order[i - 1] >= v),
    JSON.stringify(order));
  // The heading carries the table's sort arrow after its text.
  check(`slide ${chart.slide}'s table heads its rows "Item"`, /^Item(?![a-z])/.test(drawn?.corner ?? ''), String(drawn?.corner));
  check(`slide ${chart.slide} states no single base`, /each row is a separate question/.test(drawn?.caption ?? ''),
    String(drawn?.caption));
}

// 2. Slides 10 and 12 are both rows of T02_Q3 once the portal splits it (THE-363):
//    countries on one, organisations on the other.
const ten = gridCharts.find((c) => c.slide === 10);
const twelve = gridCharts.find((c) => c.slide === 12);
if (ten && twelve) {
  check('slides 10 and 12 draw different rows', !same([...charts['10'].labels].sort(), [...charts['12'].labels].sort()),
    `10 ${JSON.stringify(charts['10'].labels)} / 12 ${JSON.stringify(charts['12'].labels)}`);
} else {
  check('slides 10 and 12 draw different rows', true,
    'not applicable: this content has slide 10 or 12 as a single question (before THE-363)');
}

// 3. Every tracked grid: a row not asked in a wave is a gap, and the table says
//    so. Slide 13 must have some (UN, IMF and G20 are 2026 only), so this check
//    cannot pass by finding nothing to check.
const askedIn = (code, year) => !byCode.get(code).waves || byCode.get(code).waves.includes(year);
for (const chart of gridCharts.filter((c) => c.comparison === 'tracked')) {
  const drawn = charts[String(chart.slide)];
  const years = content.waves.map((w) => w.year).filter((y) => chart.questions.some((code) => askedIn(code, y)));
  check(`slide ${chart.slide} draws only the waves its rows were asked in`, same(drawn?.series, years.map(String)),
    `${JSON.stringify(drawn?.series)}, expected ${JSON.stringify(years.map(String))}`);
  const gaps = chart.questions.flatMap((code) => years.filter((y) => !askedIn(code, y)).map((y) => ({ code, y })));
  const wrong = gaps.filter(({ code, y }) => {
    const row = drawn.labels.indexOf(names[code]);
    return drawn.values[drawn.series.indexOf(String(y))]?.[row] !== null;
  });
  check(`slide ${chart.slide} has no value where a row was not asked`,
    wrong.length === 0 && (chart.slide !== 13 || gaps.length > 0),
    `${gaps.map(({ code, y }) => `${names[code]} ${y}`).join(', ') || 'every row asked in every wave'}; `
    + `given a value: ${wrong.length}`);
  check(`slide ${chart.slide}'s table says "Not asked" for each`, drawn?.notAsked === gaps.length,
    `${drawn?.notAsked} cell(s), expected ${gaps.length}`);
}

// 4. A single-wave grid's rows are separate figures, not one distribution.
for (const chart of gridCharts.filter((c) => c.comparison !== 'tracked')) {
  const total = Math.round((charts[String(chart.slide)]?.values?.[0] ?? []).reduce((a, b) => a + (b ?? 0), 0));
  check(`slide ${chart.slide}'s rows are not one distribution`, Math.abs(total - 100) > 1, `rows sum to ${total}`);
}

// 5. The explorer: a grid parent is a list of its rows; rows opened alone differ.
for (const parent of [...new Set(content.questions.filter((q) => q.parent).map((q) => q.parent))]) {
  const state = await explorer(page, parent);
  const children = content.questions.filter((q) => q.parent === parent);
  check(`explorer ${parent} lists its rows and draws no chart`,
    !state.canvas && Boolean(state.notice) && state.rows.length === children.length,
    `canvas ${state.canvas}, ${state.rows.length} row link(s) of ${children.length}`);
}
for (const [a, b] of [['T03_Q1_AU', 'T03_Q1_UN'], ['T10_Q4_JOBS', 'T10_Q4_POVERTY']]) {
  const [left, right] = [await explorer(page, a), await explorer(page, b)];
  check(`explorer ${a} and ${b} draw different figures`, !same(left.values, right.values),
    `${JSON.stringify(left.values[0]?.slice(0, 3))} / ${JSON.stringify(right.values[0]?.slice(0, 3))}`);
}
const scales = { T03_Q1_AU: 'Very positive', T09_Q3_AI: 'Strongly agree', T10_Q4_JOBS: 'Very satisfied', T12_Q1_WATER: 'Very concerned' };
for (const [code, first] of Object.entries(scales)) {
  const state = await explorer(page, code);
  check(`explorer ${code} answers on its own scale`, [...state.labels, ...state.series].includes(first),
    `labels ${JSON.stringify(state.labels)} series ${JSON.stringify(state.series)}`);
}

// 6. The model, as the page builds it: gender refused on a tracked grid, and the
//    chips read the latest wave.
await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
const model = await page.evaluate(async (slide) => {
  const { themes } = await import('/src/content.ts');
  const { buildViewModel, DEFAULT_FILTERS } = await import('/src/model.ts');
  const { insights } = await import('/src/ui/insights.ts');
  const theme = themes.find((t) => t.charts.some((c) => c.slide === slide));
  const spec = theme.charts.find((c) => c.slide === slide);
  const split = buildViewModel(spec, theme, { ...DEFAULT_FILTERS, compare: 'gender' });
  const plain = buildViewModel(spec, theme, DEFAULT_FILTERS);
  return {
    note: split.compareNote, splitSeries: split.series.map((s) => s.label),
    plainSeries: plain.series.map((s) => s.label), chips: insights(plain).map((i) => `${i.label}: ${i.sub}`),
  };
}, 13);
check('slide 13 refuses a gender split', Boolean(model.note) && same(model.splitSeries, model.plainSeries),
  `${model.note}; series ${JSON.stringify(model.splitSeries)}`);
const lastWave = model.plainSeries[model.plainSeries.length - 1];
check('slide 13\'s chips read the latest wave', model.chips.some((c) => c.endsWith(`highest in ${lastWave}`))
  && model.chips.some((c) => c.includes('each row is a separate question')), model.chips.join(' | '));

// 7. A grid row opened on its own draws only the waves it was asked in, and a
//    wave it was not asked in is a sentence, not a chart (review of #20). The
//    waves come from content.json here, not from the app.
const wavesOf = (code) => byCode.get(code).waves ?? content.waves.map((w) => w.year);
async function explorerAt(query) {
  await page.goto(`${BASE}/#/explore?${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  return page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    const fig = document.querySelector('.explorer-figure');
    const canvas = fig?.querySelector('canvas');
    const chart = canvas ? Chart.getChart(canvas) : null;
    return {
      canvas: Boolean(canvas),
      labels: (chart?.data?.labels ?? []).map((l) => [].concat(l).join(' ')),
      series: (chart?.data?.datasets ?? []).map((d) => d.label),
      notice: fig?.querySelector('.not-asked')?.textContent ?? null,
      notes: [...(fig?.querySelectorAll('.note') ?? [])].map((n) => n.textContent),
      downloads: document.querySelectorAll('.explorer-figure .exports button').length,
    };
  });
}
for (const code of ['T02_Q3_DE', 'T03_Q1_UN']) {
  const asked = wavesOf(code);
  const unasked = content.waves.map((w) => w.year).filter((y) => !asked.includes(y));
  const line = await explorerAt(`q=${code}&chart=line`);
  check(`explorer ${code} over time draws only its waves`,
    unasked.length > 0 && same(line.labels, asked.map(String)) && line.notes.some((n) => n.includes(`Not asked in ${unasked[0]}`)),
    `drawn ${JSON.stringify(line.labels)}, asked ${JSON.stringify(asked)}; notes ${JSON.stringify(line.notes)}`);
  const bar = await explorerAt(`q=${code}&chart=bar&wave=${unasked[0]}`);
  check(`explorer ${code} at ${unasked[0]} says it was not asked, and draws nothing`,
    !bar.canvas && (bar.notice ?? '').includes(`not asked in ${unasked[0]}`) && bar.downloads === 0,
    `canvas ${bar.canvas}, notice ${JSON.stringify(bar.notice)}, downloads ${bar.downloads}`);
}
// The controls: a row asked in every wave still draws every wave, and a row
// still draws a chart in the wave it was asked in.
const allWaves = await explorerAt('q=T02_Q3_AU&chart=line');
check('control: explorer T02_Q3_AU over time draws all its waves', same(allWaves.labels, wavesOf('T02_Q3_AU').map(String)),
  `drawn ${JSON.stringify(allWaves.labels)}, asked ${JSON.stringify(wavesOf('T02_Q3_AU'))}`);
const ownWave = await explorerAt(`q=T02_Q3_DE&chart=bar&wave=${wavesOf('T02_Q3_DE')[0]}`);
const surveyed = content.countries.filter((c) => c.waves.includes(wavesOf('T02_Q3_DE')[0])).length;
check(`control: explorer T02_Q3_DE at ${wavesOf('T02_Q3_DE')[0]} draws a bar per country`,
  ownWave.canvas && !ownWave.notice && ownWave.labels.length === surveyed && ownWave.downloads > 0,
  `canvas ${ownWave.canvas}, ${ownWave.labels.length} bars of ${surveyed} countries, ${ownWave.downloads} download button(s)`);

// 8. A single-wave grid at a wave none of its rows was asked in, and the same
//    grid compared by wave (review of #20, the low items). Slide 39's statements
//    are 2022 onwards, so 2020 has nothing; built and drawn by the page's own code.
const flatGrids = gridCharts.filter((c) => c.comparison !== 'tracked');
const askedBySome = (chart) => content.waves.map((w) => w.year).filter((y) => chart.questions.some((code) => wavesOf(code).includes(y)));
await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
const flat = await page.evaluate(async (specs) => {
  const { themes } = await import('/src/content.ts');
  const { buildViewModel, DEFAULT_FILTERS } = await import('/src/model.ts');
  const { renderFigure } = await import('/src/charts/render.ts');
  return specs.map(({ slide, empty }) => {
    const theme = themes.find((t) => t.charts.some((c) => c.slide === slide));
    const spec = theme.charts.find((c) => c.slide === slide);
    const byWave = buildViewModel(spec, theme, { ...DEFAULT_FILTERS, compare: 'wave' });
    if (empty === null) return { slide, byWave: byWave.series.map((s) => s.label) };
    const model = buildViewModel(spec, theme, { ...DEFAULT_FILTERS, wave: empty });
    const host = document.createElement('div');
    document.body.append(host);
    renderFigure(host, model, spec.type, '#000');
    const out = { slide, empty, note: model.notAsked, canvas: Boolean(host.querySelector('canvas')),
      shown: host.querySelector('.not-asked')?.textContent ?? null, byWave: byWave.series.map((s) => s.label) };
    host.remove();
    return out;
  });
}, flatGrids.map((c) => ({ slide: c.slide, empty: content.waves.map((w) => w.year).find((y) => !askedBySome(c).includes(y)) ?? null })));
for (const r of flat) {
  const chart = flatGrids.find((c) => c.slide === r.slide);
  check(`slide ${r.slide} compared by wave draws only the waves its rows were asked in`,
    same(r.byWave, askedBySome(chart).map(String)), `${JSON.stringify(r.byWave)}, expected ${JSON.stringify(askedBySome(chart).map(String))}`);
  if (r.empty === undefined) continue;
  check(`slide ${r.slide} at ${r.empty} says none of its rows was asked`,
    !r.canvas && (r.shown ?? '').startsWith(`None of these items was asked in ${r.empty}`),
    `canvas ${r.canvas}, said ${JSON.stringify(r.shown)}`);
}
check('slide 39 is among the grids checked at a wave none of its rows was asked in',
  flat.some((r) => r.slide === 39 && r.empty !== undefined), JSON.stringify(flat.map((r) => [r.slide, r.empty ?? null])));

// 9. Tile 3 reads a row of slide 12 as its trend (THE-379). Slide 12's categories
//    are organisations, not years, so before this the card skipped it and printed
//    "Not tracked across waves". The row is worked out here from content.json: the
//    chart's first listed question, the deck's own first row. Not the tallest bar,
//    which is an accident of the illustrative figures.
if (twelve) {
  const theme = content.themes.find((t) => t.order === twelve.theme);
  const expectedRow = names[twelve.questions[0]];
  const drawn = charts['12'];
  const at = drawn.labels.indexOf(expectedRow);
  const column = drawn.series.map((year, s) => ({ year: Number(year), value: drawn.values[s][at] }));
  const start = column.findIndex((p) => p.value !== null);
  const trendRow = start < 0 ? [] : column.slice(start);
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const card = await page.evaluate(async (slug) => {
    const { themes } = await import('/src/content.ts');
    const { themeCardFigures } = await import('/src/views/theme-card.ts');
    const figures = themeCardFigures(themes.find((t) => t.slug === slug));
    const tile = [...document.querySelectorAll('.tile')].find((t) => t.querySelector('.theme-tag')?.closest('.tile')
      && t.textContent.includes(themes.find((x) => x.slug === slug).name));
    return { ...figures, printedOf: tile?.querySelector('.tstat-of')?.textContent?.trim() ?? null,
      printedNone: tile?.querySelector('.tstat-none')?.textContent?.trim() ?? null };
  }, theme.slug);
  check(`tile ${theme.order} headlines slide 12's first row, ${expectedRow}`, card.of === expectedRow && card.headline !== null,
    `reads ${JSON.stringify(card.of)}, headline ${card.headline}, note ${JSON.stringify(card.note)}`);
  check(`tile ${theme.order}'s trend is that row as slide 12 draws it`,
    trendRow.length >= 2 && same(card.spark, trendRow.map((p) => p.value))
      && card.delta?.from === trendRow[0].year && card.delta?.to === trendRow[trendRow.length - 1].year,
    `spark ${JSON.stringify(card.spark)} from ${card.delta?.from} to ${card.delta?.to}; `
    + `slide 12 ${JSON.stringify(trendRow)}`);
  check(`tile ${theme.order} prints a caption for that row, not "Not tracked"`,
    Boolean(card.caption) && card.printedOf === card.caption && !card.printedNone,
    `caption ${JSON.stringify(card.caption)}, printed ${JSON.stringify(card.printedOf)}, none ${JSON.stringify(card.printedNone)}`);
} else {
  check('tile 3 headlines slide 12\'s first row', true,
    'not applicable: this content has slide 12 as a single question (before THE-363)');
}

check('no page errors', errors.length === 0, errors.join(' | ') || 'none');
await browser.close();

const lines = [
  '# THE-315 grid check', '',
  `\`${git('rev-parse', '--abbrev-ref', 'HEAD')}\` at \`${git('rev-parse', '--short', 'HEAD')}\`, `
  + `working tree ${git('status', '--short') ? 'with changes' : 'clean'}; content generated ${content.generatedAt}; `
  + `${new Date().toISOString()}.`, '',
  `${gridCharts.length} grid charts: slides ${gridCharts.map((c) => c.slide).join(', ')}.`, '',
  ...results.map((r) => `- ${r.pass ? 'PASS' : '**FAIL**'} ${r.name}: ${r.detail}`),
];
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'results.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.some((r) => !r.pass) ? 1 : 0);
