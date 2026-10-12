// The landing page's cards read as Rosie's 8 Oct deck asks (THE-401, slide 1), which
// Ishwar's 9 Oct client note confirmed:
// - no stat card draws a line (the Countries card's went);
// - the Countries card reads "Across Sub-Saharan Africa · 16 countries included in 2026";
// - the Respondents card's text is only "4,901 respondents in 2026";
// - "THEMES" becomes "KEY THEMES", "From hundreds of questions asked since 2020";
// - the "12 themes" label above the tiles goes.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-401.mjs [--url http://localhost:5173]
// Each card at 1280 and 390px, with its text measured inside its card. Exits 1 on any
// failure.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = (urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173')).replace(/\/$/, '');

// Rosie's wording, from her deck, as the ticket records it.
const WANT = {
  countriesSub: 'Across Sub-Saharan Africa · 16 countries included in 2026',
  respondentsSub: '4,901 respondents in 2026',
  respondentsValue: '14,311',
  themesLabel: 'KEY THEMES',
  themesSub: 'From hundreds of questions asked since 2020',
  themesValue: '12',
  heading: 'Explore by Theme',
};

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

async function open(page, hash) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
}

// The four stat cards as painted, keyed by their label, and the heading above the tiles.
const landing = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.stat-row .stat')].map((card) => {
    const sub = card.querySelector('.sub');
    const box = card.getBoundingClientRect();
    // Measure the text itself, not its box: a Range over the text nodes.
    let fits = null;
    if (sub?.firstChild) {
      const range = document.createRange();
      range.selectNodeContents(sub);
      fits = [...range.getClientRects()].every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5);
    }
    return {
      label: card.querySelector('.label')?.innerText?.trim() ?? null,
      value: card.querySelector('.value')?.innerText?.trim() ?? null,
      sub: sub?.innerText?.trim() ?? null,
      lines: card.querySelectorAll('svg polyline').length,
      fits,
      overflow: card.scrollWidth > card.clientWidth + 1,
    };
  });
  const heading = document.querySelector('h2.section-heading');
  return {
    cards,
    heading: heading?.innerText?.trim() ?? null,
    headingCount: heading?.querySelector('.count')?.innerText?.trim() ?? null,
    tiles: document.querySelectorAll('.tile').length,
  };
});

const results = [];
async function check(name, width, body) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let outcome;
  try {
    outcome = await body(page);
  } catch (e) {
    outcome = { pass: false, detail: e.message.split('\n')[0] };
  } finally {
    await context.close();
  }
  const pass = outcome.pass && errors.length === 0;
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${outcome.detail}${errors.length ? ` | page errors: ${[...new Set(errors)].join(' | ')}` : ''}`);
}

for (const width of [1280, 390]) {
  await check(`at ${width}px, no stat card draws a line`, width, async (page) => {
    await open(page, '#/');
    const { cards } = await landing(page);
    return { pass: cards.length === 4 && cards.every((c) => c.lines === 0),
      detail: cards.map((c) => `${c.label} ${c.lines}`).join(' | ') };
  });
  await check(`at ${width}px, the Countries card reads "${WANT.countriesSub}", inside its card`, width, async (page) => {
    await open(page, '#/');
    const card = (await landing(page)).cards.find((c) => c.label === 'COUNTRIES');
    return { pass: Boolean(card) && card.sub === WANT.countriesSub && card.fits === true && !card.overflow,
      detail: JSON.stringify({ sub: card?.sub ?? null, fits: card?.fits ?? null }) };
  });
  await check(`at ${width}px, the Respondents card reads ${WANT.respondentsValue} and only "${WANT.respondentsSub}"`, width, async (page) => {
    await open(page, '#/');
    const card = (await landing(page)).cards.find((c) => c.label === 'RESPONDENTS');
    return { pass: Boolean(card) && card.value === WANT.respondentsValue && card.sub === WANT.respondentsSub && card.fits === true,
      detail: JSON.stringify({ value: card?.value ?? null, sub: card?.sub ?? null, fits: card?.fits ?? null }) };
  });
  await check(`at ${width}px, the Themes card reads "${WANT.themesLabel}", ${WANT.themesValue}, "${WANT.themesSub}"`, width, async (page) => {
    await open(page, '#/');
    const card = (await landing(page)).cards[3];
    return { pass: Boolean(card) && card.label === WANT.themesLabel && card.value === WANT.themesValue
      && card.sub === WANT.themesSub && card.fits === true,
    detail: JSON.stringify({ label: card?.label ?? null, value: card?.value ?? null, sub: card?.sub ?? null, fits: card?.fits ?? null }) };
  });
  await check(`at ${width}px, the heading above the tiles reads only "${WANT.heading}"`, width, async (page) => {
    await open(page, '#/');
    const got = await landing(page);
    return { pass: got.heading === WANT.heading && got.headingCount === null,
      detail: JSON.stringify({ heading: got.heading, count: got.headingCount }) };
  });
}

// Controls: what the ticket leaves alone.
await check('control: the Survey waves card is unchanged, and all twelve tiles are there', 1280, async (page) => {
  await open(page, '#/');
  const got = await landing(page);
  const waves = got.cards.find((c) => c.label === 'SURVEY WAVES');
  return { pass: Boolean(waves) && waves.value === '4' && waves.sub === '2020 · 2022 · 2024 · 2026' && got.tiles === 12 && got.cards.length === 4,
    detail: JSON.stringify({ waves: waves ? `${waves.value} ${waves.sub}` : null, tiles: got.tiles, cards: got.cards.length }) };
});
await check('control: each card still opens its target', 1280, async (page) => {
  const targets = [];
  for (let i = 0; i < 4; i += 1) {
    await open(page, '#/');
    await page.locator('.stat-row .stat').nth(i).click();
    await page.waitForTimeout(600);
    targets.push(await page.evaluate(() => window.location.hash));
  }
  const want = ['#/methodology?s=coverage', '#/methodology?s=overview', '#/methodology?s=coverage', '#/'];
  return { pass: JSON.stringify(targets) === JSON.stringify(want), detail: targets.join(' | ') };
});

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
