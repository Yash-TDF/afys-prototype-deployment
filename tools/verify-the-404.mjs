// Each landing tile carries its theme's picture on the right, in PSB's layout of 22 Oct (THE-404):
// - one picture per tile, the file src/data/tile-pictures.json names for its theme, loaded, as
//   decoration (alt="");
// - on the right of the figure and inside its tile, in an 88x96 frame, cropped (object-fit: cover)
//   from the side Yash chose on 26 Oct;
// - no line on any tile, as the mock-up has none; the figure, its "since" pill and the
//   Illustrative chip stay;
// - the picture is placed before the figures land, so nothing moves when they do;
// - no sideways scroll and no page errors.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-404.mjs [--url http://localhost:5173]
// At 1280 and 390px. Exits 1 on any failure.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = (urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173')).replace(/\/$/, '');

const PICTURES = JSON.parse(readFileSync(new URL('../src/data/tile-pictures.json', import.meta.url), 'utf8'));
// The side each picture is cropped from (Yash, 26 Oct, the same as the portal's); the centre otherwise.
const FOCUS = { 'asset-7.svg': '50% 0%', 'asset-34.svg': '50% 0%', 'asset-19.svg': '0% 50%', 'asset-8.svg': '100% 50%', 'asset-9.svg': '100% 50%' };
const focusOf = (file) => FOCUS[file] ?? '50% 50%';

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
};

for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1100 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  await page.waitForSelector('a.tile');
  const early = await page.evaluate(() => [...document.querySelectorAll('a.tile')].map((t) => {
    const img = t.querySelector('img.tpic');
    return img ? Math.round(img.getBoundingClientRect().top - t.getBoundingClientRect().top) : null;
  }));
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(2000);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('a.tile')].map((t) => {
    const r = t.getBoundingClientRect();
    const imgs = [...t.querySelectorAll('img.tpic')];
    const img = imgs[0];
    const ir = img?.getBoundingClientRect();
    const left = t.querySelector('.tstat-l')?.getBoundingClientRect();
    const cs = img ? getComputedStyle(img) : null;
    return {
      slug: (t.getAttribute('href') ?? '').replace('#/theme/', ''),
      imgs: imgs.length,
      file: img?.getAttribute('src')?.split('/').pop() ?? null,
      loaded: img ? img.complete && img.naturalWidth > 0 : false,
      alt: img?.getAttribute('alt'),
      box: ir ? [Math.round(ir.width), Math.round(ir.height)] : null,
      fit: cs?.objectFit,
      pos: cs?.objectPosition,
      right: Boolean(ir && left && ir.left >= left.right - 0.5),
      inside: Boolean(ir && ir.left >= r.left && ir.right <= r.right + 0.5 && ir.top >= r.top && ir.bottom <= r.bottom + 0.5),
      lines: t.querySelectorAll('svg polyline').length,
      headline: t.querySelector('.tstat-v')?.textContent ?? null,
      pill: t.querySelector('.tstat-d')?.textContent ?? null,
      chip: t.querySelector('.chip')?.textContent ?? null,
      imgTop: ir ? Math.round(ir.top - r.top) : null,
    };
  }));
  const at = `at ${width}px`;
  check(`${at}, 12 tiles, each with one picture: the one src/data/tile-pictures.json names for its theme`,
    tiles.length === 12 && tiles.every((t) => t.imgs === 1 && t.file === PICTURES[t.slug]?.file),
    tiles.filter((t) => t.imgs !== 1 || t.file !== PICTURES[t.slug]?.file).map((t) => [t.slug, t.imgs, t.file]));
  check(`${at}, every picture loads, and is decoration (alt="")`, tiles.every((t) => t.loaded && t.alt === ''),
    tiles.filter((t) => !t.loaded || t.alt !== '').map((t) => t.slug));
  check(`${at}, each picture sits right of the figure, inside its tile`, tiles.every((t) => t.right && t.inside),
    tiles.filter((t) => !t.right || !t.inside).map((t) => t.slug));
  check(`${at}, every frame is 88x96, cropped not stretched, from its chosen side`,
    tiles.every((t) => t.box?.[0] === 88 && t.box?.[1] === 96 && t.fit === 'cover' && t.pos === focusOf(t.file)),
    tiles.filter((t) => !(t.box?.[0] === 88 && t.box?.[1] === 96 && t.fit === 'cover' && t.pos === focusOf(t.file))).map((t) => [t.slug, t.box, t.fit, t.pos]));
  check(`${at}, no tile draws a line`, tiles.every((t) => t.lines === 0), tiles.filter((t) => t.lines > 0).map((t) => t.slug));
  check(`${at}, every tile with a figure keeps its "since" pill and its Illustrative chip`,
    tiles.every((t) => t.headline === null || (t.pill !== null && t.chip === 'Illustrative')),
    tiles.filter((t) => t.headline !== null && (t.pill === null || t.chip !== 'Illustrative')).map((t) => t.slug));
  check(`${at}, the picture is placed before the figures land, and doesn't move when they do`,
    early.every((y, i) => y !== null && y === tiles[i].imgTop), { early, after: tiles.map((t) => t.imgTop) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${at}, no sideways scroll and no page errors`, overflow <= 0 && errors.length === 0, { overflow, errors });
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
