// Each landing tile carries its theme's picture on the right, in PSB's layout of 22 Oct (THE-404):
// - one picture per tile, the file src/data/tile-pictures.json names for its theme, loaded, as
//   decoration (alt="");
// - on the right of the figure and inside its tile, in an 88x96 frame, cropped (object-fit: cover)
//   from the side tile-pictures.json gives it (`focus`, as Yash chose on 26 Oct), the centre otherwise;
// - laid out as the portal's tile: the figure at the foot, the picture centred beside it, 8px
//   apart, and loading lazily. A tile narrower than at 1280 gives the change (pills or note) its
//   own row under both, so the pills keep theirs (THE-417, Yash 27 Oct);
// - no line on any tile, as the mock-up has none; the figure and its "since" pill stay, and
//   no tile carries an Illustrative chip: the footer says it once (THE-421);
// - the picture is placed before the figures land, so nothing moves when they do;
// - no sideways scroll and no page errors.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-404.mjs [--url http://localhost:5173]
// At 1280, 768 and 390px. Exits 1 on any failure.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = (urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173')).replace(/\/$/, '');

const PICTURES = JSON.parse(readFileSync(new URL('../src/data/tile-pictures.json', import.meta.url), 'utf8'));
// The side each picture is cropped from: its `focus` in tile-pictures.json, the centre otherwise.
// Read from the data the page reads, so a new picture needs no edit here (review of #34); that the
// crops are the portal's too is docs/THE-404's check, which reads the portal's CSS.
const focusOf = (slug) => PICTURES[slug]?.focus ?? '50% 50%';

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
};

for (const width of [1280, 768, 390]) {
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
  // The pictures load lazily, as the portal's do: scroll the page through, then wait until every one
  // has loaded (or report the ones that haven't, below).
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.querySelectorAll('img.tpic')].every((i) => i.complete && i.naturalWidth > 0),
    null, { timeout: 10000 }).catch(() => {});
  const tiles = await page.evaluate(() => [...document.querySelectorAll('a.tile')].map((t) => {
    const r = t.getBoundingClientRect();
    const imgs = [...t.querySelectorAll('img.tpic')];
    const img = imgs[0];
    const ir = img?.getBoundingClientRect();
    const left = t.querySelector('.tstat-l')?.getBoundingClientRect();
    const slot = t.querySelector('.tstats');
    const sr = slot?.getBoundingClientRect();
    const ss = slot ? getComputedStyle(slot) : null;
    const cs = img ? getComputedStyle(img) : null;
    // The figure and its caption, and the change under them (pills, or a note). In a tile narrower
    // than at 1280 the change has its own row, under the figure and the picture.
    const fig = (t.querySelector('.tstat-fig') ?? t.querySelector('.tstat-l'))?.getBoundingClientRect();
    const change = (t.querySelector('.tstat-pills') ?? t.querySelector('.tstat-l > .tstat-d'))?.getBoundingClientRect();
    const own = Boolean(change && ir && change.top >= ir.bottom - 0.5);
    // The row the figure shares with the picture: below the rule and padding, down to the slot's foot,
    // or with the change on its own row, down to the lower of the figure and the picture.
    const rowTop = sr && ss ? sr.top + parseFloat(ss.borderTopWidth) + parseFloat(ss.paddingTop) : null;
    const rowBottom = own ? Math.max(fig?.bottom ?? 0, ir.bottom) : sr?.bottom;
    return {
      lazy: img?.loading === 'lazy',
      layout: [ss?.alignItems, cs?.alignSelf, ss?.columnGap].join(' '),
      own,
      // The figure sits at the foot of its row, and the picture at the row's middle. With the change on
      // its own row, that row is at the slot's foot.
      foot: Boolean(sr && (own ? fig && Math.abs(fig.bottom - rowBottom) <= 1 && Math.abs(change.bottom - sr.bottom) <= 1
        : left && Math.abs(left.bottom - sr.bottom) <= 1)),
      centred: Boolean(ir && rowTop !== null && Math.abs((ir.top + ir.bottom) / 2 - (rowTop + rowBottom) / 2) <= 1),
      slug: (t.getAttribute('href') ?? '').replace('#/theme/', ''),
      imgs: imgs.length,
      file: img?.getAttribute('src')?.split('/').pop() ?? null,
      loaded: img ? img.complete && img.naturalWidth > 0 : false,
      alt: img?.getAttribute('alt'),
      box: ir ? [Math.round(ir.width), Math.round(ir.height)] : null,
      fit: cs?.objectFit,
      pos: cs?.objectPosition,
      right: Boolean(ir && fig && fig.width > 0 && ir.left >= fig.right - 0.5),
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
    tiles.every((t) => t.box?.[0] === 88 && t.box?.[1] === 96 && t.fit === 'cover' && t.pos === focusOf(t.slug)),
    tiles.filter((t) => !(t.box?.[0] === 88 && t.box?.[1] === 96 && t.fit === 'cover' && t.pos === focusOf(t.slug))).map((t) => [t.slug, t.box, t.fit, t.pos]));
  check(`${at}, laid out as the portal's tile: the figure at the foot, the picture centred beside it, 8px apart, loading lazily`,
    tiles.every((t) => t.lazy && t.layout === 'flex-end center 8px' && t.foot && t.centred),
    tiles.filter((t) => !(t.lazy && t.layout === 'flex-end center 8px' && t.foot && t.centred)).map((t) => [t.slug, t.lazy, t.layout, t.foot, t.centred]));
  check(`${at}, the change (pills or note) sits ${width < 1280 ? 'on its own row, under the figure and the picture' : 'under the figure, beside the picture'}`,
    tiles.every((t) => t.headline === null || t.own === (width < 1280)), tiles.filter((t) => t.headline !== null && t.own !== (width < 1280)).map((t) => t.slug));
  check(`${at}, no tile draws a line`, tiles.every((t) => t.lines === 0), tiles.filter((t) => t.lines > 0).map((t) => t.slug));
  check(`${at}, every tile with a figure keeps its "since" pill, and no tile has an Illustrative chip (THE-421)`,
    tiles.every((t) => t.chip === null && (t.headline === null || t.pill !== null)),
    tiles.filter((t) => t.chip !== null || (t.headline !== null && t.pill === null)).map((t) => [t.slug, t.chip]));
  check(`${at}, the picture is placed before the figures land, and doesn't move when they do`,
    early.every((y, i) => y !== null && y === tiles[i].imgTop), { early, after: tiles.map((t) => t.imgTop) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${at}, no sideways scroll and no page errors`, overflow <= 0 && errors.length === 0, { overflow, errors });
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
