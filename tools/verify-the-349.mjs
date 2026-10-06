// THE-349 check: the explorer lets a reader hide answers, and hiding is display only.
// The figures left on screen are the figures they were before, the pie keeps the
// hidden slice's share as a gap, and the chart, the table, the CSV and the link all
// say what is hidden. Read-only for the repo. Run with the prototype served on :5173
// (`pnpm exec vite`, not `pnpm dev`, which regenerates src/data/content.json):
//   node tools/verify-the-349.mjs [label]
// Drives the installed Google Chrome (CHROME_PATH to use another). Writes
// results-<label>.md to node_modules/.cache/verify-the-349. Exit 1 on any FAIL.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTOTYPE = join(dirname(fileURLToPath(import.meta.url)), '..');
const HERE = join(PROTOTYPE, 'node_modules', '.cache', 'verify-the-349');
mkdirSync(HERE, { recursive: true });
const LABEL = process.argv[2] ?? 'run';
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

const git = (...args) => {
  try { return execFileSync('git', ['-C', PROTOTYPE, ...args], { encoding: 'utf8' }).trim(); } catch { return '?'; }
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function open(page, query) {
  await page.goto(`${BASE}/#/explore?${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
}

/** Everything a check needs, read off the live chart, table, notes and address bar. */
async function read(page) {
  return page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    const canvas = document.querySelector('.explorer-figure canvas');
    const chart = canvas ? Chart.getChart(canvas) : null;
    const datasets = (chart?.data?.datasets ?? []).map((d, i) => ({
      label: d.label,
      data: (d.data ?? []).map(Number),
      colours: Array.isArray(d.backgroundColor) ? d.backgroundColor : [d.backgroundColor],
      hidden: chart.getDatasetMeta(i).hidden === true || d.hidden === true,
    }));
    const arcs = chart?.config?.type === 'pie'
      ? chart.getDatasetMeta(0).data.map((el) => Math.round(el.circumference * 1e6) / 1e6)
      : null;
    const legend = (chart?.legend?.legendItems ?? []).map((item) => ({ text: item.text, hidden: !!item.hidden }));
    const rows = [...document.querySelectorAll('.explorer-figure table tbody tr')].map((tr) => ({
      label: tr.querySelector('th')?.textContent ?? '',
      values: [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()),
    }));
    const fields = [...document.querySelectorAll('.filters .field')];
    const answers = fields.find((f) => (f.querySelector('.field-label, span')?.textContent ?? '').trim() === 'Answers');
    return {
      type: chart?.config?.type ?? null,
      labels: (chart?.data?.labels ?? []).map(String),
      datasets,
      arcs,
      legend,
      subtitle: chart?.options?.plugins?.subtitle?.display ? [].concat(chart.options.plugins.subtitle.text).join(' ') : null,
      rows,
      notes: [...document.querySelectorAll('.explorer-figure .note')].map((p) => p.textContent),
      // URLSearchParams writes a space as '+'.
      hash: decodeURIComponent(window.location.hash.replace(/\+/g, ' ')),
      picker: answers ? (answers.querySelector('.picker-trigger')?.textContent ?? '') : null,
    };
  });
}

/** Label -> value of the first dataset, for comparing one state with another. */
const byLabel = (state) => Object.fromEntries(state.labels.map((label, i) => [label, state.datasets[0]?.data[i]]));
const colourOf = (state) => Object.fromEntries(state.labels.map((label, i) => [label, state.datasets[0]?.colours[i] ?? state.datasets[0]?.colours[0]]));
const rowsOf = (state) => Object.fromEntries(state.rows.map((r) => [r.label, r.values]));
const hideQuery = (labels) => labels.map((l) => `hide=${encodeURIComponent(l)}`).join('&');

const results = [];
const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

async function check(id, name, body) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let outcome;
  try {
    outcome = await body(page, errors);
  } catch (e) {
    outcome = { pass: false, details: { exception: e.message.split('\n')[0] } };
  } finally {
    await context.close();
  }
  results.push({ id, name, ...outcome });
  console.log(`${outcome.pass ? 'PASS' : 'FAIL'}  ${id} ${name}`);
}

// --- H1: hide two answers with the selector; the rest keep their figures ------
await check('H1', 'selector hides answers on horizontal bars; the rest keep their figures, colours and table values', async (page, errors) => {
  // Six answers, so two can go and four stay. T01_Q1 has three.
  await open(page, 'q=T08_Q5&chart=hbar');
  const before = await read(page);
  const answers = before.labels;
  const keep = answers.slice(0, answers.length - 2);
  const hide = answers.slice(answers.length - 2);

  // Tick the answers to keep: an Answers picker reads like the Country one, where
  // nothing ticked means all of them.
  const field = page.locator('.filters .field').filter({ has: page.locator('.field-label', { hasText: /^Answers$/ }) });
  await field.locator('.picker-trigger').click();
  for (const answer of keep) {
    await field.getByRole('option', { name: answer, exact: true }).click();
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  const after = await read(page);

  const was = byLabel(before);
  const now = byLabel(after);
  const wasColour = colourOf(before);
  const nowColour = colourOf(after);
  const wasRows = rowsOf(before);
  const nowRows = rowsOf(after);
  const pass = answers.length >= 4
    && same(after.labels, keep)
    && keep.every((a) => now[a] === was[a])
    && keep.every((a) => nowColour[a] === wasColour[a])
    && keep.every((a) => same(nowRows[a], wasRows[a]))
    && hide.every((a) => !(a in nowRows))
    && after.notes.some((n) => /2 answers hidden/.test(n) && hide.every((a) => n.includes(a)) && /all respondents/.test(n))
    && /hidden/.test(after.subtitle ?? '')
    && hide.every((a) => after.hash.includes(`hide=${a}`))
    && errors.length === 0;
  return { pass, details: { answers, keep, hide, was, now, notes: after.notes, subtitle: after.subtitle, hash: after.hash, errors } };
});

// --- H2: the pie keeps the hidden slice's share as a gap ----------------------
await check('H2', 'a hidden pie slice leaves a gap: every other slice keeps its angle', async (page, errors) => {
  await open(page, 'q=T08_Q5&chart=pie');
  const before = await read(page);
  const hidden = before.labels[1];
  await open(page, `q=T08_Q5&chart=pie&${hideQuery([hidden])}`);
  const after = await read(page);
  const at = before.labels.indexOf(hidden);
  const others = before.labels.map((_, i) => i).filter((i) => i !== at);
  const legendHidden = after.legend.find((item) => item.text === hidden)?.hidden;
  const pass = before.type === 'pie' && after.type === 'pie'
    && same(after.labels, before.labels)
    && others.every((i) => after.arcs?.[i] === before.arcs?.[i])
    && same(after.datasets[0]?.data, before.datasets[0]?.data)
    && /transparent|rgba\(0, 0, 0, 0\)/.test(String(after.datasets[0]?.colours[at]))
    && legendHidden === true
    && after.notes.some((n) => /1 answer hidden/.test(n) && n.includes(hidden))
    && errors.length === 0;
  return { pass, details: { hidden, arcsBefore: before.arcs, arcsAfter: after.arcs, colour: after.datasets[0]?.colours[at], legendHidden, notes: after.notes, errors } };
});

// --- H3: a legend click on the line chart is the same switch ------------------
await check('H3', 'clicking a line chart legend item hides that answer, in the URL and the note, and clicking again restores it', async (page, errors) => {
  await open(page, 'q=T01_Q1&chart=line');
  const before = await read(page);
  const target = before.datasets[0]?.label;
  const box = await page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    const canvas = document.querySelector('.explorer-figure canvas');
    // A mouse click outside the viewport hits nothing, and the legend sits below it at 1440x900.
    canvas.scrollIntoView({ block: 'center' });
    const chart = Chart.getChart(canvas);
    const hit = chart.legend.legendHitBoxes[0];
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + hit.left + hit.width / 2, y: rect.top + hit.top + hit.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(1200);
  const hidden = await read(page);
  const box2 = await page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    const canvas = document.querySelector('.explorer-figure canvas');
    // A mouse click outside the viewport hits nothing, and the legend sits below it at 1440x900.
    canvas.scrollIntoView({ block: 'center' });
    const chart = Chart.getChart(canvas);
    const hit = chart.legend.legendHitBoxes[0];
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + hit.left + hit.width / 2, y: rect.top + hit.top + hit.height / 2 };
  });
  await page.mouse.click(box2.x, box2.y);
  await page.waitForTimeout(1200);
  const restored = await read(page);

  const unchanged = (state) => state.datasets.every((d) => {
    const old = before.datasets.find((o) => o.label === d.label);
    return old && same(old.data, d.data);
  });
  const pass = before.type === 'line' && before.datasets.length >= 2
    && hidden.hash.includes(`hide=${target}`)
    && hidden.datasets.find((d) => d.label === target)?.hidden === true
    && unchanged(hidden)
    && hidden.notes.some((n) => /1 answer hidden/.test(n) && n.includes(target))
    && !restored.hash.includes('hide=')
    && restored.datasets.every((d) => !d.hidden)
    && !restored.notes.some((n) => /hidden/.test(n))
    && errors.length === 0;
  return { pass, details: { target, hiddenHash: hidden.hash, restoredHash: restored.hash, notes: hidden.notes, errors } };
});

// --- H4: a multi-select ranking keeps its ten; nothing is pulled in -----------
await check('H4', 'hiding options of a multi-select leaves the others as they were, and pulls no new option in', async (page, errors) => {
  await open(page, 'q=T09_Q1&chart=hbar');
  const before = await read(page);
  const hide = before.labels.slice(0, 2);
  await open(page, `q=T09_Q1&chart=hbar&${hideQuery(hide)}`);
  const after = await read(page);
  const was = byLabel(before);
  const now = byLabel(after);
  const pass = before.labels.length >= 4
    && same(after.labels, before.labels.filter((l) => !hide.includes(l)))
    && after.labels.every((l) => now[l] === was[l])
    && after.notes.some((n) => /2 answers hidden/.test(n))
    && errors.length === 0;
  return { pass, details: { hide, before: before.labels, after: after.labels, errors } };
});

// --- H5: the CSV carries what is hidden ---------------------------------------
await check('H5', 'the CSV names the hidden answers, says nothing was rebased, and its rows are the visible figures', async (page, errors) => {
  await open(page, 'q=T01_Q1&chart=hbar');
  const before = await read(page);
  const hide = before.labels.slice(-1);
  await open(page, `q=T01_Q1&chart=hbar&${hideQuery(hide)}`);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.locator('.exports button', { hasText: 'CSV' }).click(),
  ]);
  const text = readFileSync(await download.path(), 'utf8');
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n/);
  const meta = lines.filter((l) => l.startsWith('"#') || l.startsWith('#'));
  const data = lines.filter((l) => !(l.startsWith('"#') || l.startsWith('#'))).slice(1).filter(Boolean);
  const was = byLabel(before);
  const csvValues = Object.fromEntries(data.map((l) => {
    const cells = l.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i, all) => i % 2 === 0 || all[i] !== '');
    const label = cells[0].replace(/^"|"$/g, '').replace(/""/g, '"');
    return [label, Number(cells[1])];
  }));
  const hiddenLine = meta.find((l) => /Answers hidden/.test(l));
  const pass = !!hiddenLine
    && hide.every((a) => hiddenLine.includes(a))
    && /not rebased|all respondents/.test(hiddenLine + meta.join(' '))
    && hide.every((a) => !(a in csvValues))
    && Object.keys(csvValues).length === before.labels.length - hide.length
    && Object.entries(csvValues).every(([label, value]) => value === was[label])
    && /hide=/.test(meta.find((l) => /Source:/.test(l)) ?? '')
    && errors.length === 0;
  return { pass, details: { hiddenLine, rows: csvValues, source: meta.find((l) => /Source:/.test(l)), errors } };
});

// --- H6: the link carries it, and a new question starts with nothing hidden ----
await check('H6', 'a link with hidden answers restores them; Next starts the next question with nothing hidden', async (page, errors) => {
  await open(page, 'q=T01_Q1&chart=hbar');
  const before = await read(page);
  const hide = before.labels.slice(0, 1);
  await open(page, `q=T01_Q1&chart=hbar&${hideQuery(hide)}`);
  const linked = await read(page);
  await page.locator('.qnav button', { hasText: 'Next' }).click();
  await page.waitForTimeout(1200);
  const next = await read(page);
  const pass = same(linked.labels, before.labels.filter((l) => !hide.includes(l)))
    && linked.picker !== null && !/All answers/.test(linked.picker)
    && !next.hash.includes('hide=')
    && !next.notes.some((n) => /hidden/.test(n))
    && errors.length === 0;
  return { pass, details: { hide, picker: linked.picker, nextHash: next.hash, errors } };
});

// --- H7: no selector where the chart is not drawn across answers --------------
await check('H7', 'country bars and the map offer no answer selector, and drop a hide= they cannot honour', async (page, errors) => {
  await open(page, 'q=T01_Q1&chart=bar&hide=Anything');
  const bar = await read(page);
  await open(page, 'q=T01_Q1&chart=map&hide=Anything');
  const map = await read(page);
  const pass = bar.picker === null && map.picker === null
    && !bar.hash.includes('hide=') && !map.hash.includes('hide=')
    && errors.length === 0;
  return { pass, details: { barPicker: bar.picker, mapPicker: map.picker, barHash: bar.hash, mapHash: map.hash, errors } };
});

// --- H8: everything hidden is not a chart -------------------------------------
await check('H8', 'a link hiding every answer shows them all rather than an empty chart', async (page, errors) => {
  await open(page, 'q=T01_Q1&chart=hbar');
  const before = await read(page);
  await open(page, `q=T01_Q1&chart=hbar&${hideQuery(before.labels)}`);
  const after = await read(page);
  const pass = before.labels.length > 0
    && same(after.labels, before.labels)
    && !after.hash.includes('hide=')
    && errors.length === 0;
  return { pass, details: { before: before.labels, after: after.labels, hash: after.hash, errors } };
});

// --- H9: control — nothing hidden, nothing changed ----------------------------
await check('H9', 'control: with nothing hidden the chart has no hidden note and no subtitle', async (page, errors) => {
  await open(page, 'q=T01_Q1&chart=hbar');
  const state = await read(page);
  const pass = state.labels.length > 0
    && !state.notes.some((n) => /hidden/.test(n))
    && state.subtitle === null
    && errors.length === 0;
  return { pass, details: { notes: state.notes, subtitle: state.subtitle, errors } };
});

// --- H10: a theme page's pie legend hides without rebasing, too -------------
await check('H10', 'on a theme page, a pie legend click leaves a gap and says so, rather than widening the other slices', async (page, errors) => {
  await page.goto(`${BASE}/#/theme/connected-africa`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const pie = async () => page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    const canvas = [...document.querySelectorAll('canvas')].find((c) => Chart.getChart(c)?.config.type === 'pie');
    if (!canvas) return null;
    canvas.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 300));
    const chart = Chart.getChart(canvas);
    const rect = canvas.getBoundingClientRect();
    const box = chart.legend.legendHitBoxes[0];
    const card = canvas.closest('figure');
    return {
      labels: chart.data.labels.map(String),
      arcs: chart.getDatasetMeta(0).data.map((el) => Math.round(el.circumference * 1e6) / 1e6),
      colour: chart.data.datasets[0].backgroundColor[0],
      struck: chart.legend.legendItems[0].hidden,
      notes: [...(card?.querySelectorAll('.note') ?? [])].map((p) => p.textContent).filter((n) => /hidden/.test(n)),
      click: { x: rect.left + box.left + box.width / 2, y: rect.top + box.top + box.height / 2 },
    };
  });
  const before = await pie();
  await page.mouse.click(before.click.x, before.click.y);
  await page.waitForTimeout(1500);
  const after = await pie();
  const pass = before !== null && after !== null
    && before.arcs.slice(1).every((a, i) => a === after.arcs[i + 1])
    && after.struck === true
    && /transparent|rgba\(0, 0, 0, 0\)/.test(String(after.colour))
    && after.notes.some((n) => /1 answer hidden/.test(n) && n.includes(before.labels[0]))
    && errors.length === 0;
  return { pass, details: { arcsBefore: before?.arcs, arcsAfter: after?.arcs, colour: after?.colour, struck: after?.struck, notes: after?.notes, errors } };
});

// --- H11: a trend chip names the line it describes ----------------------------
await check('H11', 'on a chart of several lines the trend chips name their line, and follow it when the first is hidden', async (page, errors) => {
  const chips = async () => page.evaluate(() => [...document.querySelectorAll('.explorer-figure .insights .insight')].map((c) => c.textContent));
  await open(page, 'q=T01_Q1&chart=line');
  const first = await read(page);
  const before = await chips();
  const [line1, line2] = first.datasets.map((d) => d.label);
  await open(page, `q=T01_Q1&chart=line&${hideQuery([line1])}`);
  const after = await chips();
  const pass = before.length > 0 && before.every((c) => c.includes(line1))
    && after.length > 0 && after.every((c) => c.includes(line2))
    && errors.length === 0;
  return { pass, details: { line1, line2, before, after, errors } };
});

await check('H12', 'hiding an answer leaves a distribution\'s chips as they were: they read the question, not the screen', async (page, errors) => {
  // Review of #19: on T01_Q1's pie, hiding "Right direction" made the chip
  // read "Wrong direction 34% highest", which is false for the question.
  const chips = async () => page.evaluate(() => [...document.querySelectorAll('.explorer-figure .insights .insight')].map((c) => c.textContent));
  await open(page, 'q=T01_Q1&chart=pie');
  const shown = await read(page);
  const before = await chips();
  const top = shown.labels[shown.datasets[0].data.indexOf(Math.max(...shown.datasets[0].data))];
  await open(page, `q=T01_Q1&chart=pie&${hideQuery([top])}`);
  const after = await chips();
  const pass = before.length > 0 && same(before, after) && before.some((c) => c.startsWith(top))
    && errors.length === 0;
  return { pass, details: { hidden: top, before, after, errors } };
});

await check('H13', 'closing the Answers list after a change leaves focus on its trigger, not the page', async (page, errors) => {
  // Review of #19: the redraw replaced the field, and focus fell to <body>.
  await open(page, 'q=T01_Q1&chart=hbar');
  await page.locator('#field-answers').locator('..').locator('.picker-trigger').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.locator('.field.is-open [role="option"], .field.is-open input[type="checkbox"]').first().focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => ({
    hash: decodeURIComponent(window.location.hash.replace(/\+/g, ' ')),
    active: document.activeElement?.className || document.activeElement?.tagName,
    inAnswers: Boolean(document.activeElement?.closest('.field')?.querySelector('#field-answers')),
  }));
  const pass = state.hash.includes('hide=') && state.active === 'picker-trigger' && state.inAnswers
    && errors.length === 0;
  return { pass, details: { ...state, errors } };
});

await browser.close();

const failed = results.filter((r) => !r.pass).length;
const lines = [
  `# THE-349 answer selector check — ${LABEL}`, '',
  `Prototype ${git('rev-parse', '--abbrev-ref', 'HEAD')} @ ${git('rev-parse', '--short', 'HEAD')}, ${new Date().toISOString()}`, '',
  `**${results.length - failed} passed, ${failed} failed.**`, '',
  '| Check | Result | Details |', '|---|---|---|',
  ...results.map((r) => `| ${r.id} ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | \`${JSON.stringify(r.details).replace(/\|/g, '\\|')}\` |`),
];
writeFileSync(join(HERE, `results-${LABEL}.md`), lines.join('\n') + '\n');
console.log(`\n${results.length - failed} passed, ${failed} failed → results-${LABEL}.md`);
process.exit(failed ? 1 : 0);
