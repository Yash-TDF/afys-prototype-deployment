// The review link says once, not everywhere, that its figures are illustrative (THE-421; Nimit,
// 28 Oct: "a lot of mentions how this is not real data, can we get rid of them"; Yash, 29 Oct: one
// short line in the footer, nothing repeated):
// - on every page the word appears once, in the footer's line, counting everything a reader or a
//   screen reader meets: the visible text, the tables' captions, and every label and title;
// - no banner, no "Illustrative" chip on a chart or a tile, and Methodology has no "The figures";
// - no tooltip adds a line of its own;
// - a downloaded CSV, which leaves the site without the footer, says it once;
// - the figures are the ones drawn before: `--figures <file>` writes the charts' values, and two
//   runs' files are compared byte for byte.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-421.mjs [--url http://localhost:5173] [--figures out.json]
// Exits 1 on any failure.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const arg = (name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : null);
const BASE = (arg('--url') ?? process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const FIGURES = arg('--figures');

const FOOTER_NOTE = 'Figures shown are illustrative.';
// Every way the site has said it: the word itself, and the phrases that said it without the word.
const SAID = /illustrative|not a survey result|not survey results|generated for layout|not real data/gi;
const PAGES = ['#/', '#/theme/afro-optimism', '#/theme/climate-change', '#/explore', '#/methodology'];

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — ${JSON.stringify(detail).slice(0, 500)}`}`);
};

const errors = [];
async function open(hash) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, acceptDownloads: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(`${hash}: ${e.message}`));
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(2000);
  return page;
}

const figures = {};
for (const hash of PAGES) {
  const page = await open(hash);
  const found = await page.evaluate((source) => {
    const said = new RegExp(source, 'gi');
    // Text nodes only, so the HTML comments, which no reader meets, don't count.
    const text = document.body.textContent ?? '';
    const attrs = [...document.querySelectorAll('[aria-label],[title],[alt],[aria-description]')]
      .flatMap((el) => ['aria-label', 'title', 'alt', 'aria-description'].map((a) => el.getAttribute(a) ?? ''));
    const inText = text.match(said) ?? [];
    const inAttrs = attrs.flatMap((v) => v.match(said) ?? []);
    const footer = document.querySelector('.site-footer');
    return {
      inText: inText.length,
      inAttrs: attrs.filter((v) => new RegExp(source, 'i').test(v)),
      inFooter: (footer?.textContent?.match(said) ?? []).length,
      note: footer?.querySelector('.footer-note')?.textContent?.trim() ?? null,
      banner: document.querySelectorAll('.illustrative-banner').length,
      chips: [...document.querySelectorAll('.chip')].map((el) => el.textContent),
      headings: [...document.querySelectorAll('h2')].map((h) => h.textContent?.trim()),
      totalSaid: inText.length + inAttrs.length,
    };
  }, SAID.source);
  check(`${hash}: said once, in the footer's line ("${FOOTER_NOTE}")`,
    found.totalSaid === 1 && found.inFooter === 1 && found.note === FOOTER_NOTE, found);
  check(`${hash}: no banner and no Illustrative chip`, found.banner === 0 && found.chips.length === 0, found);
  if (hash === '#/methodology') {
    check('#/methodology: no "The figures" section, and the other sections are still there',
      !found.headings.includes('The figures') && found.headings.includes('Languages and locations'), found.headings);
  }

  // The tooltip, and the figures each chart draws.
  const charts = await page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    return [...document.querySelectorAll('canvas')].map((canvas) => {
      const chart = Chart.getChart(canvas);
      if (!chart) return null;
      const afterBody = chart.options.plugins?.tooltip?.callbacks?.afterBody;
      const extra = typeof afterBody === 'function' ? afterBody.call(chart.tooltip, []) : afterBody;
      return {
        title: canvas.closest('figure')?.querySelector('h3')?.textContent ?? canvas.getAttribute('aria-label') ?? '',
        tooltipLine: Array.isArray(extra) ? extra.join(' ') : (extra ?? ''),
        data: chart.data.datasets.map((d) => d.data),
      };
    }).filter(Boolean);
  });
  if (hash !== '#/' && hash !== '#/methodology') {
    check(`${hash}: no tooltip adds a line of its own (${charts.length} charts read)`,
      charts.length > 0 && charts.every((c) => c.tooltipLine === ''), charts.filter((c) => c.tooltipLine !== '').map((c) => [c.title, c.tooltipLine]));
  }
  figures[hash] = charts.map((c) => [c.title, c.data]);

  if (hash === '#/explore') {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).first().click(),
    ]);
    const csv = readFileSync(await download.path(), 'utf8');
    const lines = csv.split('\r\n');
    const saying = lines.filter((l) => new RegExp(SAID.source, 'i').test(l));
    check('#/explore: a downloaded CSV says it once, as its first line',
      saying.length === 1 && lines[0].replace(/^﻿/, '').includes('Figures are illustrative') && lines.some((l) => l.startsWith('"# Base:') || l.startsWith('# Base:')),
      { saying, first: lines.slice(0, 3) });
  }
  await page.close();
}

check('no page threw an error', errors.length === 0, errors);
if (FIGURES) {
  writeFileSync(FIGURES, JSON.stringify(figures, null, 1));
  console.log(`figures written to ${FIGURES}: ${Object.values(figures).reduce((n, c) => n + c.length, 0)} charts`);
}
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks pass');
process.exit(failed ? 1 : 0);
