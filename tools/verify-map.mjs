// verify-map.mjs
//
// Checks in a real browser that each of the 28 surveyed countries on the round-zero map
//   - fills when its wave is selected (methodology view),
//   - names the survey's own spelling on hover,
//   - opens its own wave list on click,
// and that a country the survey never covered reads "never surveyed" / "not surveyed" with no
// value, never a zero. The explorer's Map chart type is checked as a second view.
//
// Expected values come from the portal seeds (afys-portal/db/seeds/001_countries.sql and
// 003_country_wave.sql), NOT from the prototype's src/data/content.json: checking the page against
// the file that produced it would pass a defect in that file.
//
// Which outline belongs to which country is checked independently of any spelling: each
// surveyed outline's Natural Earth numeric id must equal the ISO 3166-1 numeric code of the
// seed's ISO3.
//
// Two things about the page shape how this runs:
//   1. The first hover on a map throws "TypeError: this._fn is not a function" inside Chart.js's
//      shared animation loop. After that, tooltips never visibly paint and charts drawn later in
//      the same tab can stay blank. So every wave, in both views, starts from a fresh page load,
//      and the fills are read before anything is hovered.
//   2. Because the visible tooltip does not paint, the hover check reads the text from Chart.js's
//      tooltip model. Whether a tooltip is actually drawn is recorded as its own check. Evidence
//      screenshots of tooltips are taken separately with an in-tab workaround (animation switched
//      off on that one chart object, in the browser only) and are labelled as such.
//
// Read-only for both repositories. Writes only to node_modules/.cache/verify-map:
//   results.json, results.md, screenshots/*.png
//
// Usage — serve the prototype first with `pnpm exec vite` (`pnpm dev` rebuilds content.json):
//   node tools/verify-map.mjs [--browser chrome|chromium|firefox|webkit] [--url http://localhost:5173]
//     [--headed] [--chrome-path <chrome.exe>]
// `chrome` (the default) is the installed Google Chrome; the others are Playwright's own builds.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// This repo, and the portal checked out beside it, as tools/build-content.mjs
// expects. Results go to node_modules/.cache, never into the repo (review of #20).
const PROTOTYPE = process.env.AFYS_PROTOTYPE ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTAL = process.env.AFYS_PORTAL ?? join(PROTOTYPE, '..', 'afys-portal');
const HERE = join(PROTOTYPE, 'node_modules', '.cache', 'verify-map');
mkdirSync(HERE, { recursive: true });
const PLAYWRIGHT_CORE = process.env.PLAYWRIGHT_CORE ?? 'playwright-core';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const BASE_URL = option('url', 'http://localhost:5173').replace(/\/$/, '');
const BROWSER = option('browser', 'chrome');
const HEADED = argv.includes('--headed');

const SHOTS = join(HERE, 'screenshots');
const CHART_MODULE = '/src/charts/setup.ts';
const METHOD_CANVAS = '.method-map canvas';
const EXPLORER_CANVAS = '.explorer-figure canvas';
const EXPLORER_QUESTION = 'T01_Q1';
const DASH = '\u2014';
const DOT = '\u00b7';

// Screenshot these whatever the result: the aliased countries and the Somalia / Somaliland split.
const SPOTLIGHT = [
  { outline: 'Congo', label: 'Congo Brazzaville' },
  { outline: 'Dem. Rep. Congo', label: 'DRC' },
  { outline: "C\u00f4te d'Ivoire", label: "C\u00f4te d'Ivoire" },
  { outline: 'eSwatini', label: 'eSwatini' },
  { outline: 'Somalia', label: 'Somalia' },
  { outline: 'Somaliland', label: 'Somaliland' },
];
const SPOTLIGHT_WAVES = [2024, 2026];

// ISO 3166-1 numeric codes for the 28 surveyed ISO3 codes, independent of any spelling.
const ISO_NUMERIC = {
  AGO: '024', BWA: '072', BFA: '854', CMR: '120', TCD: '148', COG: '178', CIV: '384', COD: '180',
  ETH: '231', GAB: '266', GHA: '288', KEN: '404', LBR: '430', MWI: '454', MLI: '466', MOZ: '508',
  NAM: '516', NGA: '566', RWA: '646', SEN: '686', SOM: '706', ZAF: '710', SDN: '729', TZA: '834',
  TGO: '768', UGA: '800', ZMB: '894', ZWE: '716',
};

// The methodology map's three fills, computed the way src/charts/palette.ts computes them.
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const mix = (a, b, t) => hex(a).map((v, i) => Math.round(v * (1 - t) + hex(b)[i] * t));
const FILLS = {
  'surveyed this wave': hex('#2f7a5a'),
  'surveyed another wave': mix('#2f7a5a', '#ffffff', 0.72),
  'never surveyed': hex('#f2f4f6'),
};

// ---------------------------------------------------------------------------------------------
// Expected values, from the portal seeds
// ---------------------------------------------------------------------------------------------
function readSeeds() {
  const unquote = (s) => s.replaceAll("''", "'");
  const countries = new Map();
  const c001 = readFileSync(join(PORTAL, 'db/seeds/001_countries.sql'), 'utf8');
  for (const m of c001.matchAll(/\('((?:[^']|'')*)', '([A-Z]{3})', (?:NULL|'(?:[^']|'')*')\)/g)) {
    countries.set(unquote(m[1]), { name: unquote(m[1]), iso3: m[2], waves: [] });
  }
  const w002 = readFileSync(join(PORTAL, 'db/seeds/002_waves.sql'), 'utf8');
  const waves = [...w002.matchAll(/^\((\d{4}),/gm)].map((m) => Number(m[1]));
  const c003 = readFileSync(join(PORTAL, 'db/seeds/003_country_wave.sql'), 'utf8');
  let memberships = 0;
  for (const m of c003.matchAll(/name = '((?:[^']|'')*)'\), \(SELECT id FROM waves WHERE year = (\d{4})\)/g)) {
    const country = countries.get(unquote(m[1]));
    if (!country) throw new Error(`003_country_wave names a country missing from 001: ${unquote(m[1])}`);
    country.waves.push(Number(m[2]));
    memberships += 1;
  }
  for (const c of countries.values()) c.waves.sort((a, b) => a - b);
  if (countries.size !== 28 || memberships !== 61 || waves.length !== 4) {
    throw new Error(`seed parse looks wrong: ${countries.size} countries, ${memberships} memberships, ${waves.length} waves`);
  }
  return { countries, waves, memberships };
}

// ---------------------------------------------------------------------------------------------
// Outline identity: is each surveyed name drawn on the right shape?
// ---------------------------------------------------------------------------------------------
function outlineIdentity(seeds) {
  const req = createRequire(join(PROTOTYPE, 'package.json'));
  const { feature } = req('topojson-client');
  const topo = JSON.parse(readFileSync(join(PROTOTYPE, 'node_modules/world-atlas/countries-110m.json'), 'utf8'));
  const world = feature(topo, topo.objects.countries);
  const byName = new Map(world.features.map((f) => [f.properties.name, f]));
  const geo = JSON.parse(readFileSync(join(PROTOTYPE, 'public/africa.geo.json'), 'utf8'));

  const rows = [...seeds.countries.values()].map((seed) => {
    const drawn = geo.features.filter((f) => f.properties.surveyName === seed.name);
    const ne = drawn.length === 1 ? byName.get(drawn[0].properties.name) : undefined;
    const id = ne?.id ?? null;
    return {
      country: seed.name,
      iso3: seed.iso3,
      outline: drawn.map((f) => f.properties.name).join(' + ') || null,
      naturalEarthId: id,
      isoNumeric: ISO_NUMERIC[seed.iso3],
      pass: drawn.length === 1 && id === ISO_NUMERIC[seed.iso3],
    };
  });

  const source = readFileSync(join(PROTOTYPE, 'tools/make-africa.mjs'), 'utf8');
  const block = source.slice(source.indexOf('new Set(['), source.indexOf(']);'));
  const africa = [...block.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);
  const notDrawn = africa.filter((name) => !byName.has(name));
  const somaliland = byName.get('Somaliland');
  return { rows, notDrawn, outlines: geo.features.length, somalilandId: somaliland?.id ?? null };
}

// ---------------------------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------------------------
/** Every outline on a map canvas: a safe interior point, its fill there, and its data value. */
async function readMap(page, selector) {
  return page.evaluate(async ({ selector, module }) => {
    const { Chart } = await import(module);
    const canvas = document.querySelector(selector);
    const chart = canvas ? Chart.getChart(canvas) : undefined;
    const dataset = chart?.data?.datasets?.[0];
    const meta = chart ? chart.getDatasetMeta(0) : undefined;
    if (!chart || !dataset || !meta || meta.data.length === 0) return null;

    const rect = canvas.getBoundingClientRect();
    const ratio = chart.currentDevicePixelRatio || 1;
    const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < image.length; i += 4) if (image[i] > 0) painted += 1;

    // One pixel, not an average: a sliver such as Gambia at 110m is about three pixels wide, so a
    // 3x3 average pulls in its neighbours' fill. The point is already chosen away from borders.
    const pixel = (x, y) => {
      const px = Math.round(x * ratio);
      const py = Math.round(y * ratio);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;
      const i = (py * canvas.width + px) * 4;
      return [image[i], image[i + 1], image[i + 2]];
    };
    // Inside this outline (with a margin), and inside no other outline.
    const inside = (el, index, x, y, margin) => {
      const offsets = margin === 0 ? [[0, 0]] : [[0, 0], [-margin, 0], [margin, 0], [0, -margin], [0, margin]];
      return offsets.every(([dx, dy]) => el.inRange(x + dx, y + dy))
        && meta.data.every((other, j) => j === index || !other.inRange(x, y));
    };

    const points = meta.data.map((el, index) => {
      const props = dataset.data[index].feature.properties;
      const centre = el.getCenterPoint();
      const spiral = [[centre.x, centre.y]];
      for (let r = 2; r <= 90; r += 2) {
        for (let a = 0; a < 360; a += 20) {
          spiral.push([centre.x + r * Math.cos((a * Math.PI) / 180), centre.y + r * Math.sin((a * Math.PI) / 180)]);
        }
      }
      let at = null;
      let margin = null;
      for (const m of [2, 1]) {
        at = spiral.find(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && inside(el, index, x, y, m)) ?? null;
        if (at) { margin = m; break; }
      }
      if (!at) {
        // Very small outlines (Gambia at 110m): search the bounding box on a half-pixel grid.
        const b = el.getBounds();
        if (Number.isFinite(b.x)) {
          search: for (const m of [1, 0]) {
            for (let y = Math.ceil(b.y); y <= b.y2; y += 0.5) {
              for (let x = Math.ceil(b.x); x <= b.x2; x += 0.5) {
                if (inside(el, index, x, y, m)) { at = [x, y]; margin = m; break search; }
              }
            }
          }
        }
      }
      return {
        index,
        outline: props.name,
        surveyName: props.surveyName,
        value: dataset.data[index].value ?? null,
        margin,
        page: at ? { x: rect.left + at[0], y: rect.top + at[1] } : null,
        rgb: at ? pixel(at[0], at[1]) : null,
      };
    });
    return { label: dataset.label, painted, points };
  }, { selector, module: CHART_MODULE });
}

async function chartReady(page, selector) {
  return page.evaluate(async ({ selector, module }) => {
    const { Chart } = await import(module);
    const canvas = document.querySelector(selector);
    if (!canvas || canvas.dataset.qaStale) return null;
    const chart = Chart.getChart(canvas);
    return chart && chart.getDatasetMeta(0).data.length > 0 ? chart.data.datasets[0].label : null;
  }, { selector, module: CHART_MODULE });
}

async function waitForChart(page, selector, predicate = () => true) {
  for (let i = 0; i < 120; i += 1) {
    const label = await chartReady(page, selector);
    if (label !== null && predicate(label)) {
      await page.mouse.move(2, 2);
      await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), selector);
      await page.waitForTimeout(900); // Chart.js animation is 260ms; leave it well settled
      return label;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`chart on ${selector} never became ready`);
}

/** A fresh document, so nothing a previous step broke carries over. */
async function fresh(page, hash) {
  await page.goto('about:blank');
  await page.goto(`${BASE_URL}/${hash}`, { waitUntil: 'load' });
}

async function tooltipState(page, selector) {
  return page.evaluate(async ({ selector, module }) => {
    const { Chart } = await import(module);
    const tooltip = Chart.getChart(document.querySelector(selector))?.tooltip;
    const active = tooltip?.getActiveElements?.() ?? [];
    const text = (tooltip?.body ?? []).map((b) => b.lines.join(' ')).join(' | ');
    return { index: active[0]?.index ?? null, text: text || null, opacity: tooltip?.opacity ?? null };
  }, { selector, module: CHART_MODULE });
}

async function hover(page, selector, point, expectedIndex) {
  await page.mouse.move(point.x, point.y);
  let last = { index: null, text: null, opacity: null };
  for (let i = 0; i < 25; i += 1) {
    await page.waitForTimeout(40);
    last = await tooltipState(page, selector);
    if (last.index === expectedIndex && last.text) break;
  }
  return last;
}

/** Hover, wait well past the tooltip's fade-in, and measure whether anything was drawn. */
async function hoverAndMeasurePaint(page, selector, point) {
  const snap = () => page.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    return Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
  }, selector);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(300);
  const before = await snap();
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(800);
  const after = await snap();
  let changed = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2] || before[i + 3] !== after[i + 3]) changed += 1;
  }
  return { changed, ...(await tooltipState(page, selector)) };
}

/** The in-tab workaround used only for evidence screenshots: animation off on this chart object. */
async function disableAnimationInTab(page, selector) {
  await page.evaluate(async ({ selector, module }) => {
    const { Chart } = await import(module);
    const chart = Chart.getChart(document.querySelector(selector));
    chart.options.animation = false;
    chart.update('none');
  }, { selector, module: CHART_MODULE });
}

async function clickDetail(page, point) {
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const aside = document.querySelector('.country-detail');
    return {
      title: aside?.querySelector('h2')?.textContent ?? null,
      items: [...(aside?.querySelectorAll('li') ?? [])].map((li) => li.textContent),
    };
  });
}

function nearestFill(rgb) {
  if (!rgb) return { fill: null, distance: null };
  let best = null;
  for (const [fill, ref] of Object.entries(FILLS)) {
    const distance = Math.sqrt(ref.reduce((sum, v, i) => sum + (v - rgb[i]) ** 2, 0));
    if (!best || distance < best.distance) best = { fill, distance: Math.round(distance) };
  }
  return best;
}

async function clip(page, point, file) {
  const viewport = page.viewportSize();
  const width = 520;
  const height = 360;
  const x = Math.max(0, Math.min(viewport.width - width, Math.round(point.x - width / 2)));
  const y = Math.max(0, Math.min(viewport.height - height, Math.round(point.y - height / 2)));
  await page.screenshot({ path: join(SHOTS, file), clip: { x, y, width, height } });
  return `screenshots/${file}`;
}

const slug = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const git = (repo, ...args) => {
  try { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim(); } catch { return null; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------
const seeds = readSeeds();
// Interview counts (THE-348): the page prints them beside each wave. They come from the
// generated file rather than the seeds, which carry no counts; membership is still the seeds'.
// On a branch without THE-348 the file does not exist and the page still says "surveyed".
const FIELDWORK = join(PROTOTYPE, 'src', 'data', 'fieldwork.json');
const fieldwork = existsSync(FIELDWORK) ? JSON.parse(readFileSync(FIELDWORK, 'utf8')) : { countries: {} };
const identity = outlineIdentity(seeds);
const seedByOutline = new Map(
  identity.rows.filter((r) => r.pass).map((r) => [r.outline, seeds.countries.get(r.country)]),
);

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const require = createRequire(import.meta.url);
const playwright = require(PLAYWRIGHT_CORE);
const browser = BROWSER === 'chrome'
  // The installed Google Chrome, found as Playwright finds it on any OS, unless a path is given.
  ? await playwright.chromium.launch(option('chrome-path', null)
    ? { headless: !HEADED, executablePath: option('chrome-path', null) }
    : { headless: !HEADED, channel: 'chrome' })
  : await playwright[BROWSER].launch({ headless: !HEADED });
const browserVersion = browser.version();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();

let step = 'start';
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push({ step, message: String(e), stack: (e.stack || '').split('\n').slice(1, 4).map((s) => s.trim()).join(' <- ') }));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrors.push({ step, message: `console: ${m.text()}` });
});

const checks = [];
const paintChecks = [];
const shotTaken = new Set();
const record = (entry) => { checks.push(entry); return entry; };

try {
  // ------------------------------------------------------------------ methodology view, as shipped
  for (const year of seeds.waves) {
    step = `methodology ${year}: load`;
    await fresh(page, '#/methodology');
    await waitForChart(page, METHOD_CANVAS);

    const button = page.locator('.type-switch button', { hasText: `${year} ${DOT}` });
    const buttonText = (await button.textContent())?.trim() ?? null;
    const expectedCount = [...seeds.countries.values()].filter((c) => c.waves.includes(year)).length;
    record({
      view: 'methodology', wave: year, country: null, outline: null, check: 'wave button count',
      expected: `${year} ${DOT} ${expectedCount} countries`, actual: buttonText,
      pass: buttonText === `${year} ${DOT} ${expectedCount} countries`,
    });

    step = `methodology ${year}: select wave`;
    await button.click();
    await waitForChart(page, METHOD_CANVAS, (label) => label === `Surveyed in ${year}`);
    await page.locator('.method-layout').screenshot({ path: join(SHOTS, `methodology-${year}.png`) });
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), METHOD_CANVAS);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(300);

    step = `methodology ${year}: read fills (nothing hovered yet)`;
    const map = await readMap(page, METHOD_CANVAS);
    record({
      view: 'methodology', wave: year, country: null, outline: null, check: 'map draws',
      expected: 'the map canvas is painted', actual: `${map.painted} painted pixels`, pass: map.painted > 20000,
    });

    for (const p of map.points) {
      const seed = seedByOutline.get(p.outline) ?? null;
      const base = { view: 'methodology', wave: year, country: seed?.name ?? null, outline: p.outline };
      if (!p.page) {
        record({ ...base, check: 'interior point', expected: 'a point inside the outline', actual: 'none found', pass: false });
        continue;
      }
      const expectedFill = !seed || seed.waves.length === 0
        ? 'never surveyed'
        : seed.waves.includes(year) ? 'surveyed this wave' : 'surveyed another wave';
      const got = nearestFill(p.rgb);
      record({
        ...base, check: 'fill', expected: expectedFill,
        actual: `${got.fill} rgb(${p.rgb?.join(',')}) d=${got.distance}`, pass: got.fill === expectedFill,
      });
    }

    // Does a tooltip actually get drawn? Measured once per wave, on the first hover of a fresh page.
    step = `methodology ${year}: first hover (tooltip paint)`;
    const ghana = map.points.find((p) => p.surveyName === 'Ghana' && p.page);
    if (ghana) {
      const paint = await hoverAndMeasurePaint(page, METHOD_CANVAS, ghana.page);
      paintChecks.push({ view: 'methodology', wave: year, mode: 'as shipped', ...paint });
      record({
        view: 'methodology', wave: year, country: 'Ghana', outline: 'Ghana', check: 'tooltip is drawn',
        expected: 'tooltip fades in (opacity 1) and pixels change',
        actual: `opacity ${paint.opacity}, ${paint.changed} pixels changed`,
        pass: paint.opacity === 1 && paint.changed > 1000,
      });
      await clip(page, ghana.page, `methodology-${year}-first-hover-as-shipped.png`);
    }

    step = `methodology ${year}: hover and click every outline`;
    for (const p of map.points) {
      if (!p.page) continue;
      const seed = seedByOutline.get(p.outline) ?? null;
      const who = seed?.name ?? p.outline;
      const base = { view: 'methodology', wave: year, country: seed?.name ?? null, outline: p.outline };

      // Since THE-348 the page says how many were interviewed, from the delivered
      // survey file (src/data/fieldwork.json). Membership still comes from the seeds
      // above, so a country the seeds say was asked must have a count, and one they
      // say was not must not.
      const count = seed ? (fieldwork.countries[seed.name]?.interviews[String(year)] ?? null) : null;
      const expectedTip = !seed
        ? `${p.outline} ${DASH} never surveyed`
        : seed.waves.includes(year)
          ? `${seed.name} ${DASH} ${count === null ? `surveyed in ${year}` : `${count.toLocaleString('en-GB')} interviews in ${year}`}`
          : `${seed.name} ${DASH} surveyed in ${seed.waves.join(', ')}, not ${year}`;
      const tip = await hover(page, METHOD_CANVAS, p.page, p.index);
      const hovered = record({
        ...base, check: 'hover text', expected: expectedTip, actual: tip.text,
        pass: tip.index === p.index && tip.text === expectedTip,
      });

      const detail = await clickDetail(page, p.page);
      const expectedDetail = seed
        ? {
          title: seed.name,
          items: seeds.waves.map((w) => {
            if (!seed.waves.includes(w)) return `${w} ${DASH} not surveyed`;
            const c = fieldwork.countries[seed.name]?.interviews[String(w)] ?? null;
            return `${w} ${DASH} ${c === null ? 'surveyed' : `${c.toLocaleString('en-GB')} interviews`}`;
          }),
        }
        : { title: 'Select a country', items: [] };
      const clicked = record({
        ...base, check: 'click', expected: expectedDetail, actual: detail, pass: same(detail, expectedDetail),
      });
      if (!clicked.pass && !shotTaken.has(`m-click-${who}`)) {
        shotTaken.add(`m-click-${who}`);
        const file = `methodology-${year}-click-${slug(who)}-FAIL.png`;
        await page.locator('.method-layout').screenshot({ path: join(SHOTS, file) });
        clicked.screenshot = `screenshots/${file}`;
      }
      if (!hovered.pass) hovered.note = 'text read from the Chart.js tooltip model';
      await page.mouse.move(2, 2);
    }
  }

  // ------------------------------------------------------------------ evidence screenshots, in-tab workaround
  for (const year of SPOTLIGHT_WAVES) {
    step = `methodology ${year}: evidence screenshots with animation off in the tab`;
    await fresh(page, '#/methodology');
    await waitForChart(page, METHOD_CANVAS);
    await page.locator('.type-switch button', { hasText: `${year} ${DOT}` }).click();
    await waitForChart(page, METHOD_CANVAS, (label) => label === `Surveyed in ${year}`);
    await disableAnimationInTab(page, METHOD_CANVAS);
    await page.waitForTimeout(300);
    const map = await readMap(page, METHOD_CANVAS);

    const ghana = map.points.find((p) => p.surveyName === 'Ghana' && p.page);
    if (ghana) {
      const paint = await hoverAndMeasurePaint(page, METHOD_CANVAS, ghana.page);
      paintChecks.push({ view: 'methodology', wave: year, mode: 'in-tab workaround (animation off)', ...paint });
    }

    for (const spot of SPOTLIGHT) {
      const p = map.points.find((x) => x.outline === spot.outline && x.page);
      if (!p) continue;
      const tip = await hover(page, METHOD_CANVAS, p.page, p.index);
      await page.waitForTimeout(250);
      const file = `methodology-${year}-hover-${slug(spot.label)}-workaround.png`;
      await clip(page, p.page, file);
      const detail = await clickDetail(page, p.page);
      const panelFile = `methodology-${year}-click-${slug(spot.label)}-workaround.png`;
      await page.locator('.method-layout').screenshot({ path: join(SHOTS, panelFile) });
      checks.push({
        view: 'methodology (workaround)', wave: year, country: seedByOutline.get(spot.outline)?.name ?? null,
        outline: spot.outline, check: 'evidence', expected: 'screenshot', actual: { tooltip: tip.text, opacity: tip.opacity, panel: detail },
        pass: true, screenshot: `screenshots/${file}`, panelScreenshot: `screenshots/${panelFile}`,
      });
      await page.mouse.move(2, 2);
      await page.waitForTimeout(150);
    }
  }

  // ------------------------------------------------------------------ explorer, Map chart type
  for (const year of seeds.waves) {
    step = `explorer map ${year}: load`;
    await fresh(page, `#/explore?q=${EXPLORER_QUESTION}`);
    await page.locator('.type-switch button', { hasText: 'Map' }).click();
    await waitForChart(page, EXPLORER_CANVAS);
    // Matched on the field's own label, not on its text: since the "Compare by"
    // filter arrived it offers "Wave" as an option, so hasText finds two fields.
    const waveSelect = page.locator('form.filters label.field')
      .filter({ has: page.locator('span:text-is("Wave")') })
      .locator('select');
    if ((await waveSelect.inputValue()) !== String(year)) {
      await page.evaluate((sel) => { const c = document.querySelector(sel); if (c) c.dataset.qaStale = '1'; }, EXPLORER_CANVAS);
      await waveSelect.selectOption(String(year));
      await waitForChart(page, EXPLORER_CANVAS);
    }
    await page.locator('.explorer-figure').screenshot({ path: join(SHOTS, `explorer-map-${year}.png`) });
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), EXPLORER_CANVAS);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(300);

    step = `explorer map ${year}: read values`;
    const map = await readMap(page, EXPLORER_CANVAS);
    record({
      view: 'explorer map', wave: year, country: null, outline: null, check: 'map draws',
      expected: 'the map canvas is painted', actual: `${map.painted} painted pixels`, pass: map.painted > 20000,
    });

    step = `explorer map ${year}: hover every outline`;
    for (const p of map.points) {
      const seed = seedByOutline.get(p.outline) ?? null;
      const who = seed?.name ?? p.outline;
      const base = { view: 'explorer map', wave: year, country: seed?.name ?? null, outline: p.outline };
      if (!p.page) {
        record({ ...base, check: 'interior point', expected: 'a point inside the outline', actual: 'none found', pass: false });
        continue;
      }
      const inWave = Boolean(seed?.waves.includes(year));
      record({
        ...base, check: 'value', expected: inWave ? 'a percentage' : 'no value (null)',
        actual: p.value === null ? 'null' : String(p.value), pass: inWave ? typeof p.value === 'number' : p.value === null,
      });
      const tip = await hover(page, EXPLORER_CANVAS, p.page, p.index);
      const escaped = who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expectedTip = inWave ? `${who}: <n>%` : `${who} ${DASH} not surveyed`;
      const hovered = record({
        ...base, check: 'hover text', expected: expectedTip, actual: tip.text,
        pass: tip.index === p.index && (inWave ? new RegExp(`^${escaped}: \\d+(\\.\\d+)?%$`).test(tip.text ?? '') : tip.text === expectedTip),
      });
      if (!hovered.pass && !shotTaken.has(`e-hover-${who}`)) {
        shotTaken.add(`e-hover-${who}`);
        hovered.screenshot = await clip(page, p.page, `explorer-${year}-hover-${slug(who)}-FAIL.png`);
      }
      await page.mouse.move(2, 2);
    }
  }
} finally {
  await browser.close();
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------
const graded = checks.filter((c) => c.check !== 'evidence');
// Checks that fail because of a defect already raised as its own issue. They are still run and
// listed, but counted apart so this run is judged on what it is verifying.
const KNOWN_ELSEWHERE = { 'tooltip is drawn': 'THE-251' };
for (const c of graded) if (!c.pass && KNOWN_ELSEWHERE[c.check]) c.known = KNOWN_ELSEWHERE[c.check];
const failures = graded.filter((c) => !c.pass && !c.known);
const known = graded.filter((c) => !c.pass && c.known);
const results = {
  generatedAt: new Date().toISOString(),
  url: BASE_URL,
  browser: { name: BROWSER === 'chrome' ? 'Google Chrome (installed)' : `Playwright ${BROWSER}`, version: browserVersion, viewport: '1440x1000', deviceScaleFactor: 1 },
  repos: {
    prototype: { head: git(PROTOTYPE, 'rev-parse', '--short', 'HEAD'), status: git(PROTOTYPE, 'status', '--porcelain') },
    portal: { head: git(PORTAL, 'rev-parse', '--short', 'HEAD'), status: git(PORTAL, 'status', '--porcelain') },
  },
  seeds: {
    countries: seeds.countries.size, memberships: seeds.memberships, waves: seeds.waves,
    perWave: Object.fromEntries(seeds.waves.map((y) => [y, [...seeds.countries.values()].filter((c) => c.waves.includes(y)).length])),
  },
  identity,
  totals: { checks: graded.length, failed: failures.length, knownElsewhere: known.length },
  tooltipPaint: paintChecks,
  pageErrors,
  checks,
};
writeFileSync(join(HERE, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

const ok = '\u2705';
const bad = '\u274c';
const tick = (list) => (list.length === 0 ? 'n/a' : list.every((c) => c.pass) ? ok : bad);
const cell = (filter) => tick(graded.filter(filter));
const text = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const lines = [];
lines.push('# Map verification — surveyed countries on the round-zero map', '');
lines.push(`- Run: ${results.generatedAt}`);
lines.push(`- Browser: ${results.browser.name} ${browserVersion}, viewport 1440x1000`);
lines.push(`- Page: ${BASE_URL} — afys-prototype ${results.repos.prototype.head}, afys-portal ${results.repos.portal.head}`);
lines.push(`- Expected values from the portal seeds: ${seeds.countries.size} countries, ${seeds.memberships} memberships; per wave ${Object.entries(results.seeds.perWave).map(([y, n]) => `${y}=${n}`).join(', ')}`);
lines.push(`- Graded checks: ${graded.length}, failed: ${failures.length}`);
lines.push(`- Known failures raised as their own issues, not counted above: ${known.length}${known.length ? ` (${[...new Set(known.map((c) => `${c.known}: ${c.check}`))].join('; ')})` : ''}`);
lines.push('- Every wave in both views was checked from a fresh page load; fills were read before anything was hovered.', '');

lines.push('## Wave buttons', '', '| Wave | Expected | On the page | |', '|---|---|---|---|');
for (const c of graded.filter((x) => x.check === 'wave button count')) {
  lines.push(`| ${c.wave} | ${c.expected} | ${c.actual} | ${c.pass ? ok : bad} |`);
}

lines.push('', '## Right shape for each name (Natural Earth id against ISO 3166-1 numeric)', '', '| Country | Outline drawn | NE id | ISO numeric | |', '|---|---|---|---|---|');
for (const r of identity.rows) lines.push(`| ${r.country} | ${r.outline} | ${r.naturalEarthId} | ${r.isoNumeric} | ${r.pass ? ok : bad} |`);

lines.push('', '## The 28 surveyed countries', '');
lines.push('Hover text is read from Chart.js\'s tooltip model — see "Tooltips are not drawn" below.', '');
lines.push(`| Country | Seed waves | Fill ${seeds.waves.join(' | Fill ')} | Hover names the survey's spelling | Click opens its wave list | Explorer map: value + hover |`);
lines.push(`|---|---|${seeds.waves.map(() => '---').join('|')}|---|---|---|`);
for (const seed of [...seeds.countries.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const mine = (c) => c.country === seed.name;
  const fills = seeds.waves.map((y) => cell((c) => mine(c) && c.view === 'methodology' && c.check === 'fill' && c.wave === y));
  lines.push(`| ${seed.name} | ${seed.waves.join(', ')} | ${fills.join(' | ')} | ${cell((c) => mine(c) && c.view === 'methodology' && c.check === 'hover text')} | ${cell((c) => mine(c) && c.view === 'methodology' && c.check === 'click')} | ${cell((c) => mine(c) && c.view === 'explorer map' && c.outline)} |`);
}

lines.push('', '## Outlines the survey never covered', '', '| Outline | Grey on every wave | Hover "never surveyed" | Click opens no country | Explorer: no value, "not surveyed" |', '|---|---|---|---|---|');
const never = [...new Set(graded.filter((c) => c.country === null && c.outline).map((c) => c.outline))].sort((a, b) => a.localeCompare(b));
for (const outline of never) {
  const mine = (c) => c.outline === outline && c.country === null;
  lines.push(`| ${outline} | ${cell((c) => mine(c) && c.check === 'fill')} | ${cell((c) => mine(c) && c.view === 'methodology' && c.check === 'hover text')} | ${cell((c) => mine(c) && c.check === 'click')} | ${cell((c) => mine(c) && c.view === 'explorer map')} |`);
}
lines.push('', `Not drawn at all at 110m (no outline in world-atlas): ${identity.notDrawn.join(', ') || 'none'}.`);
lines.push(`Somaliland is its own outline with no ISO id (Natural Earth id: ${identity.somalilandId ?? 'none'}), so northern Somalia reads "never surveyed".`);

lines.push('', '## Maps draw', '', '| View | Wave | Painted pixels | |', '|---|---|---|---|');
for (const c of graded.filter((x) => x.check === 'map draws')) lines.push(`| ${c.view} | ${c.wave} | ${c.actual} | ${c.pass ? ok : bad} |`);

lines.push('', '## Tooltips are not drawn (THE-251)', '');
lines.push('Measured on the first hover of a fresh page (Ghana), waiting 800ms: tooltip opacity and how many canvas pixels changed.', '');
lines.push('| Mode | Wave | Tooltip text (model) | Opacity | Pixels changed |', '|---|---|---|---|---|');
for (const p of paintChecks) lines.push(`| ${p.mode} | ${p.wave} | ${p.text ?? '—'} | ${p.opacity} | ${p.changed} |`);

lines.push('', '## Page errors, with the step they happened in', '');
if (pageErrors.length === 0) lines.push('None.');
if (pageErrors.some((e) => /_fn is not a function/.test(e.message))) {
  lines.push('`this._fn is not a function` is THE-251: the first hover on any chart throws it.', '');
}
for (const e of pageErrors) lines.push(`- **${e.step}** — ${e.message}${e.stack ? ` (${e.stack})` : ''}`);

lines.push('', '## Failures', '');
if (failures.length === 0) lines.push('None.');
for (const f of failures) {
  lines.push(`- **${f.country ?? f.outline ?? '—'}** · ${f.view} · ${f.wave} · ${f.check}: expected \`${text(f.expected)}\`, got \`${text(f.actual)}\`${f.screenshot ? ` — ${f.screenshot}` : ''}`);
}

lines.push('', '## Known failures raised as their own issues (not counted as failures)', '');
if (known.length === 0) lines.push('None.');
for (const f of known) {
  lines.push(`- **${f.known}** · ${f.country ?? f.outline ?? '—'} · ${f.view} · ${f.wave} · ${f.check}: expected \`${text(f.expected)}\`, got \`${text(f.actual)}\``);
}

lines.push('', '## Evidence screenshots (animation switched off in the tab, so tooltips paint)', '');
for (const c of checks.filter((x) => x.check === 'evidence')) {
  lines.push(`- ${c.country ?? c.outline} · ${c.wave}: hover "${c.actual.tooltip}" — ${c.screenshot}; panel "${c.actual.panel.title}" — ${c.panelScreenshot}`);
}
lines.push('', 'Full maps per wave: screenshots/methodology-<wave>.png and screenshots/explorer-map-<wave>.png.');
writeFileSync(join(HERE, 'results.md'), `${lines.join('\n')}\n`);

console.log(`browser ${results.browser.name} ${browserVersion}`);
console.log(`graded checks ${graded.length}, failed ${failures.length}, known failures raised elsewhere ${known.length}`);
for (const f of failures) console.log(`  FAIL ${f.view} ${f.wave} ${f.country ?? f.outline ?? '-'} ${f.check}: expected ${JSON.stringify(f.expected)} got ${JSON.stringify(f.actual)}`);
for (const f of known) console.log(`  KNOWN ${f.known} ${f.view} ${f.wave} ${f.country ?? f.outline ?? '-'} ${f.check}: got ${JSON.stringify(f.actual)}`);
console.log(`tooltip paint: ${paintChecks.map((p) => `${p.mode} ${p.wave}: opacity ${p.opacity}, ${p.changed}px`).join(' | ')}`);
console.log(`page errors: ${pageErrors.length} (${[...new Set(pageErrors.map((e) => e.message))].join(' / ')})`);
console.log(`identity: ${identity.rows.filter((r) => r.pass).length}/${identity.rows.length} outlines match ISO numeric`);
console.log(`wrote ${join(HERE, 'results.md')}`);
// Exit 1 on any failure, as the README says both checks do. Without it a run
// that drew no-data as 0 reported 286 of 1036 failures and still exited 0
// (review of #20).
process.exit(failures.length || pageErrors.length ? 1 : 0);
